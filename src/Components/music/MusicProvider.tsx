/**
 * MusicProvider: the music context of the app. It plays the user's playlist (crossfades, next/previous,
 * resume on the first gesture), uploads songs to the account, feeds the beat-reactive visuals and wires
 * the Media Session (lock screen and media keys).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { Notice } from '../common/StatusMessage';
import type { AccountSession } from '../../scripts/profile';
import type { MusicEngine } from '../../scripts/music-engine';
import type { BeatGrid } from '../../scripts/beat-analysis';
import { setPulseSource } from '../../scripts/music-pulse';
import { dictMessage, type LocalMessage } from '../../scripts/strings';
import { isSwitchingAccount } from '../../scripts/account-data';
import {
    MAX_TRACK_BYTES,
    MAX_UPLOADS,
    audioMimeOf,
    readMusicPreference,
    readPendingUploads,
    trackNameFromFile,
    writeMusicPreference,
    writePendingUploads,
    type MusicLibrary,
    type MusicTrack,
} from '../../scripts/music-library';
import {
    deleteCloudTrackFile,
    deleteTrackFile,
    downloadTrackFile,
    readTrackFile,
    saveTrackFile,
    uploadTrackFile,
} from '../../scripts/music-files';

const MB = Math.round(MAX_TRACK_BYTES / (1024 * 1024));

export interface MusicContextValue {
    playlist: readonly MusicTrack[];
    /** On: playing or about to (loading the song). */
    playing: boolean;
    currentId: string | null;
    loadingId: string | null;
    uploadingId: string | null;
    volume: number;
    notice: Notice | null;
    toggle(): void;
    playTrack(id: string): void;
    next(): void;
    previous(): void;
    setVolume(volume: number): void;
    addFiles(files: readonly File[]): Promise<void>;
    removeTrack(id: string): void;
    moveTrack(from: number, to: number): void;
    dismissNotice(): void;
}

const MusicContext = createContext<MusicContextValue | null>(null);

/** The music context; it must be used inside MusicProvider. */
export function useMusic(): MusicContextValue {
    const value = useContext(MusicContext);
    if (!value) throw new Error('useMusic must be used inside MusicProvider');
    return value;
}

interface MusicProviderProps {
    library: MusicLibrary;
    onLibraryChange: Dispatch<SetStateAction<MusicLibrary>>;
    session: AccountSession | null;
    children: ReactNode;
}

// The settings menu holds the music controls: a gesture on it already turns music on or off by itself.
const AUDIO_CONTROLS = '.spinly-settings';

/** Adds ids to (or removes them from) the list of songs waiting to be uploaded. */
const markPending = (ids: readonly string[], pending: boolean) => {
    const current = readPendingUploads();
    writePendingUploads(pending ? [...current, ...ids.filter((id) => !current.includes(id))] : current.filter((id) => !ids.includes(id)));
};

/**
 * The app's music: each user's playlist is stored by App (it travels with the account) and this provider
 * handles playback, uploads and the cloud copy of the files. The audio engine loads the first time
 * music is turned on.
 */
function MusicProvider({ library, onLibraryChange, session, children }: MusicProviderProps) {
    const uid = session && !session.isAnonymous ? session.userId : null;
    const [preference] = useState(readMusicPreference);
    const [playing, setPlaying] = useState(false);
    const [currentId, setCurrentId] = useState<string | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const [volume, setVolumeState] = useState(preference.volume);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [pendingTick, setPendingTick] = useState(0);

    const engineRef = useRef<MusicEngine | null>(null);
    const enginePromise = useRef<Promise<MusicEngine | null> | null>(null);
    // Track loaded in the engine (playing or paused) and its blob URL, released when it changes.
    const loadedIdRef = useRef<string | null>(null);
    const urlRef = useRef<string | null>(null);
    // Every play request invalidates earlier ones that are still loading.
    const requestRef = useRef(0);
    // Beat grid of every analysed song (null: it failed; no entry: not analysed yet, or in progress).
    const gridsRef = useRef(new Map<string, BeatGrid | null>());
    const analyzingRef = useRef(new Set<string>());
    const libraryRef = useRef(library);
    libraryRef.current = library;
    const uidRef = useRef(uid);
    uidRef.current = uid;
    const volumeRef = useRef(volume);
    volumeRef.current = volume;

    /** Shows a notice in the player. */
    const say = useCallback((tone: Notice['tone'], text: LocalMessage) => setNotice({ tone, text }), []);

    /** Loads and creates the audio engine once. */
    const getEngine = useCallback((): Promise<MusicEngine | null> => {
        if (!enginePromise.current) {
            enginePromise.current = import('../../scripts/music-engine')
                .then(({ createMusicEngine }) => {
                    const engine = createMusicEngine();
                    engine?.setVolume(volumeRef.current);
                    engineRef.current = engine;
                    return engine;
                })
                .catch(() => null);
        }
        return enginePromise.current;
    }, []);

    /** Frees the current blob URL. */
    const releaseUrl = useCallback(() => {
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
    }, []);

    /** A song's file: this browser's copy or, if missing, the account's (which is then cached here). */
    const fileOf = useCallback(async (track: MusicTrack): Promise<Blob | null> => {
        const local = await readTrackFile(track.id);
        if (local) return local;
        const owner = uidRef.current;
        if (!owner) return null;
        say('ok', dictMessage('music', 'downloading', { name: track.name }));
        const remote = await downloadTrackFile(owner, track.id);
        if (!remote.ok) return null;
        await saveTrackFile(track.id, remote.data);
        return remote.data;
    }, [say]);

    /** Pauses and remembers that music is off. */
    const stopPlayback = useCallback(() => {
        engineRef.current?.pause();
        setPlaying(false);
        setLoadingId(null);
        writeMusicPreference({ on: false });
    }, []);

    /** Loads and plays a track, starting its beat analysis in parallel. */
    const startTrack = useCallback(async (id: string) => {
        const track = libraryRef.current.playlist.find((item) => item.id === id);
        if (!track) return;
        const request = ++requestRef.current;
        setCurrentId(id);
        setPlaying(true);
        writeMusicPreference({ on: true });
        const engine = await getEngine();
        if (request !== requestRef.current) return;
        if (!engine) {
            say('error', dictMessage('errors', 'musicUnsupported'));
            stopPlayback();
            return;
        }
        setLoadingId(id);
        const file = await fileOf(track);
        if (request !== requestRef.current) return;
        if (!file) {
            say('error', dictMessage('errors', 'musicMissing', { name: track.name }));
            stopPlayback();
            return;
        }
        // The whole song's beat is analysed while it starts playing; until that finishes, the lights follow
        // the real-time beat tracker.
        if (!gridsRef.current.has(id) && !analyzingRef.current.has(id)) {
            analyzingRef.current.add(id);
            void engine.analyze(file).then((grid) => {
                analyzingRef.current.delete(id);
                gridsRef.current.set(id, grid);
            });
        }
        const url = URL.createObjectURL(file);
        const played = await engine.playFile(url);
        if (request !== requestRef.current) {
            URL.revokeObjectURL(url);
            return;
        }
        releaseUrl();
        urlRef.current = url;
        loadedIdRef.current = played ? id : null;
        setLoadingId(null);
        if (!played) {
            say('error', dictMessage('errors', 'musicCannotPlay', { name: track.name }));
            stopPlayback();
            return;
        }
        setNotice((current) => (current?.tone === 'ok' ? null : current));
    }, [fileOf, getEngine, releaseUrl, say, stopPlayback]);

    /** Plays the track `offset` positions away (wrapping around the playlist). */
    const step = useCallback((offset: number) => {
        const list = libraryRef.current.playlist;
        if (!list.length) return;
        const index = list.findIndex((track) => track.id === currentId);
        // Without a current track, "next" starts at the first one and "previous" at the last one.
        const from = index === -1 ? (offset > 0 ? -1 : 0) : index;
        const target = list[(from + offset + list.length) % list.length];
        void startTrack(target.id);
    }, [currentId, startTrack]);

    /** Next track. */
    const next = useCallback(() => step(1), [step]);
    /** Previous track. */
    const previous = useCallback(() => step(-1), [step]);

    // When a track ends the next one plays; with a single track, it repeats.
    const nextRef = useRef(next);
    nextRef.current = next;
    useEffect(() => {
        if (!playing) return;
        void getEngine().then((engine) => engine?.onEnded(() => nextRef.current()));
    }, [playing, getEngine]);

    // While playing, the wheel lights and the background pulse with the song (music-pulse.ts). Every song
    // starts its analysis from scratch: its tempo and pattern are its own.
    useEffect(() => {
        if (!playing) return undefined;
        let alive = true;
        void getEngine().then((engine) => {
            if (!alive || !engine || !currentId) return;
            setPulseSource({
                bands: () => engine.bands(),
                live: (analysis, at) => engine.live(analysis, at),
                clock: () => engine.clock(),
                grid: () => gridsRef.current.get(currentId) ?? null,
            });
        });
        return () => {
            alive = false;
            setPulseSource(null);
        };
    }, [playing, currentId, getEngine]);

    /** Play / pause, resuming the loaded track when possible. */
    const toggle = useCallback(() => {
        if (playing) {
            requestRef.current += 1;
            stopPlayback();
            return;
        }
        const list = libraryRef.current.playlist;
        const id = currentId && list.some((track) => track.id === currentId) ? currentId : list[0]?.id;
        if (!id) return;
        const engine = engineRef.current;
        if (engine && loadedIdRef.current === id) {
            setPlaying(true);
            writeMusicPreference({ on: true });
            void engine.resume().then((resumed) => { if (!resumed) void startTrack(id); });
            return;
        }
        void startTrack(id);
    }, [currentId, playing, startTrack, stopPlayback]);

    /** Plays a specific track (or toggles it if it is the loaded one). */
    const playTrack = useCallback((id: string) => {
        if (id === currentId && playing) return;
        if (id === currentId && engineRef.current && loadedIdRef.current === id) {
            toggle();
            return;
        }
        void startTrack(id);
    }, [currentId, playing, startTrack, toggle]);

    /** Sets and remembers the music volume (0-1). */
    const setVolume = useCallback((value: number) => {
        const clamped = Math.min(Math.max(value, 0), 1);
        setVolumeState(clamped);
        engineRef.current?.setVolume(clamped);
        writeMusicPreference({ volume: clamped });
    }, []);

    // If music was on last time, it comes back with the first gesture (browsers do not allow any sound
    // before that). The audio controls handle their own click.
    const toggleRef = useRef(toggle);
    toggleRef.current = toggle;
    useEffect(() => {
        if (!preference.on) return undefined;
        /** First user gesture: turns the music back on (unless it was on the audio controls). */
        const onGesture = (event: Event) => {
            remove();
            if (event.target instanceof Element && event.target.closest(AUDIO_CONTROLS)) return;
            toggleRef.current();
        };
        /** Stops listening for the first gesture. */
        const remove = () => {
            document.removeEventListener('pointerdown', onGesture, true);
            document.removeEventListener('keydown', onGesture, true);
        };
        document.addEventListener('pointerdown', onGesture, true);
        document.addEventListener('keydown', onGesture, true);
        return remove;
    }, [preference.on]);

    /** Validates and stores uploaded songs, then queues them for the cloud. */
    const addFiles = useCallback(async (files: readonly File[]) => {
        let uploads = libraryRef.current.playlist.length;
        const added: MusicTrack[] = [];
        let problem: LocalMessage | null = null;
        const probe = document.createElement('audio');
        for (const file of files) {
            const name = trackNameFromFile(file.name);
            const mime = audioMimeOf(file);
            if (!mime || !probe.canPlayType(mime)) {
                problem = dictMessage('errors', 'musicBadType', { name });
                continue;
            }
            if (file.size <= 0 || file.size > MAX_TRACK_BYTES) {
                problem = dictMessage('errors', 'musicTooBig', { name, mb: MB });
                continue;
            }
            if (uploads >= MAX_UPLOADS) {
                problem = dictMessage('errors', 'musicTooMany', { max: MAX_UPLOADS });
                break;
            }
            const id = crypto.randomUUID();
            if (!(await saveTrackFile(id, file))) {
                problem = dictMessage('errors', 'musicStorage');
                continue;
            }
            added.push({ id, name, mime, size: file.size });
            uploads += 1;
        }
        if (added.length) {
            onLibraryChange((prev) => ({ playlist: [...prev.playlist, ...added] }));
            markPending(added.map((track) => track.id), true);
            setPendingTick((tick) => tick + 1);
        }
        if (problem) say('error', problem);
        else if (added.length > 1) say('ok', dictMessage('music', 'addedMany', { n: added.length }));
        else if (added.length === 1 && !uidRef.current) say('ok', dictMessage('music', 'addedLocal', { name: added[0].name }));
    }, [onLibraryChange, say]);

    /** Removes a track everywhere (moving on to another one if it was playing). */
    const removeTrack = useCallback((id: string) => {
        const track = libraryRef.current.playlist.find((item) => item.id === id);
        if (!track) return;
        if (id === currentId) {
            const rest = libraryRef.current.playlist.filter((item) => item.id !== id);
            if (playing && rest.length) {
                const index = libraryRef.current.playlist.findIndex((item) => item.id === id);
                void startTrack(rest[index % rest.length].id);
            } else {
                requestRef.current += 1;
                stopPlayback();
                setCurrentId(null);
                loadedIdRef.current = null;
            }
        }
        onLibraryChange((prev) => ({ playlist: prev.playlist.filter((item) => item.id !== id) }));
        const wasPending = readPendingUploads().includes(id);
        markPending([id], false);
        void deleteTrackFile(id);
        // In the cloud only if it was uploaded. If that fails, the file is left orphaned but invisible.
        if (uidRef.current && !wasPending) void deleteCloudTrackFile(uidRef.current, id);
    }, [currentId, onLibraryChange, playing, startTrack, stopPlayback]);

    /** Reorders the playlist. */
    const moveTrack = useCallback((from: number, to: number) => {
        onLibraryChange((prev) => {
            const playlist = [...prev.playlist];
            const [moved] = playlist.splice(from, 1);
            if (!moved) return prev;
            playlist.splice(to, 0, moved);
            return { playlist };
        });
    }, [onLibraryChange]);

    // Uploads to the account the songs that are only in this browser (added without a session, or whose
    // upload failed). One at a time; on an error it stops and retries next time.
    useEffect(() => {
        if (!uid) return undefined;
        let alive = true;
        void (async () => {
            for (const id of readPendingUploads()) {
                if (!alive || isSwitchingAccount()) return;
                const track = libraryRef.current.playlist.find((item) => item.id === id);
                const file = track ? await readTrackFile(id) : null;
                if (!track || !file) {
                    markPending([id], false);
                    continue;
                }
                setUploadingId(id);
                say('ok', dictMessage('music', 'uploading', { name: track.name }));
                const saved = await uploadTrackFile(uid, id, file, track.mime);
                if (!alive) return;
                if (!saved.ok) {
                    say('error', saved.error);
                    break;
                }
                markPending([id], false);
                say('ok', dictMessage('music', 'addedCloud', { name: track.name }));
            }
            if (alive) setUploadingId(null);
        })();
        return () => {
            alive = false;
        };
    }, [uid, pendingTick, say]);

    // System controls (lock screen, media keys, headphones).
    const current = library.playlist.find((track) => track.id === currentId) ?? null;
    const currentTitle = current?.name ?? null;
    useEffect(() => {
        const media = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
        if (!media || typeof MediaMetadata === 'undefined') return undefined;
        media.playbackState = playing ? 'playing' : 'paused';
        if (currentTitle) {
            media.metadata = new MediaMetadata({
                title: currentTitle,
                artist: 'Spinly',
                artwork: [{ src: '/Images/spinly-logo-128.webp', sizes: '128x128', type: 'image/webp' }],
            });
        }
        const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
            ['play', () => { if (!playing) toggle(); }],
            ['pause', () => { if (playing) toggle(); }],
            ['nexttrack', next],
            ['previoustrack', previous],
        ];
        handlers.forEach(([action, handler]) => {
            try {
                media.setActionHandler(action, handler);
            } catch {
                // Action not supported by this browser.
            }
        });
        return () => handlers.forEach(([action]) => {
            try {
                media.setActionHandler(action, null);
            } catch {
                // Action not supported by this browser.
            }
        });
    }, [currentTitle, playing, toggle, next, previous]);

    /** Disposes the engine and the blob URL on unmount. */
    const shutdown = useCallback(() => {
        engineRef.current?.dispose();
        releaseUrl();
    }, [releaseUrl]);
    useEffect(() => shutdown, [shutdown]);

    const value = useMemo<MusicContextValue>(() => ({
        playlist: library.playlist,
        playing,
        currentId,
        loadingId,
        uploadingId,
        volume,
        notice,
        toggle,
        playTrack,
        next,
        previous,
        setVolume,
        addFiles,
        removeTrack,
        moveTrack,
        dismissNotice: () => setNotice(null),
    }), [library.playlist, playing, currentId, loadingId, uploadingId, volume, notice, toggle, playTrack, next, previous, setVolume, addFiles, removeTrack, moveTrack]);

    return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export default MusicProvider;
