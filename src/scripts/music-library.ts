/**
 * Music playlist: the songs each user uploads (none come built in). This file holds only the model, the
 * sanitizing and the local persistence of the list; the files live in IndexedDB and in the cloud
 * (music-files.ts) and playback in music-engine.ts.
 */

export type MusicTrack = { id: string; name: string; mime: string; size: number };

export type MusicLibrary = { playlist: MusicTrack[] };

/** The account's list: it travels with the account and is cleared on sign-out. */
export const MUSIC_STORAGE_KEY = 'spinly-music';
/** Songs uploaded in this browser that are not in the cloud yet (guest, or a failed upload). */
export const MUSIC_PENDING_KEY = 'spinly-music-pending';

export const MAX_UPLOADS = 10;
// Same as the user-data bucket's file_size_limit.
export const MAX_TRACK_BYTES = 10 * 1024 * 1024;
export const MAX_TRACK_NAME = 80;

// Types the bucket accepts (allowed_mime_types). Every file is normalised to one of them.
export const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/flac'] as const;

// Non-standard audio types browsers report, mapped to the accepted ones.
const MIME_ALIASES: Record<string, string> = {
    'audio/mp3': 'audio/mpeg',
    'audio/x-m4a': 'audio/mp4',
    'audio/m4a': 'audio/mp4',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/vnd.wave': 'audio/wav',
    'audio/x-flac': 'audio/flac',
    'audio/opus': 'audio/ogg',
};

// Some systems give no type for certain formats (e.g. .flac on Windows): it is inferred from the extension.
const MIME_BY_EXTENSION: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    opus: 'audio/ogg',
    wav: 'audio/wav',
    webm: 'audio/webm',
    flac: 'audio/flac',
};

/** `accept` attribute of the file input. */
export const AUDIO_ACCEPT = ['audio/*', ...Object.keys(MIME_BY_EXTENSION).map((ext) => `.${ext}`)].join(',');

/** The file's accepted type, or null if it is not audio the app accepts. */
export function audioMimeOf(file: { name: string; type: string }): string | null {
    const declared = file.type.toLowerCase().split(';')[0].trim();
    const normalized = MIME_ALIASES[declared] ?? declared;
    if ((AUDIO_MIME_TYPES as readonly string[]).includes(normalized)) return normalized;
    const extension = file.name.toLowerCase().split('.').pop() ?? '';
    return MIME_BY_EXTENSION[extension] ?? null;
}

/** Strips control characters: the name is shown as-is in the list and on the lock screen. */
const printable = (text: string): string => Array.from(text).filter((char) => char.charCodeAt(0) >= 32).join('');

/** Display name from the file name: without the extension and trimmed. */
export function trackNameFromFile(fileName: string): string {
    const base = printable(fileName.replace(/\.[^./\\]+$/, '')).trim();
    return (base || printable(fileName).trim() || 'Audio').slice(0, MAX_TRACK_NAME);
}

// Ids form the file's cloud path: only safe characters, never "/" or "..".
export const TRACK_ID_PATTERN = /^[a-z0-9-]{8,64}$/i;

/** First visit or after signing out: no songs, everyone uploads their own. */
export const createDefaultLibrary = (): MusicLibrary => ({ playlist: [] });

/** Validates one track; null if anything is off. */
function sanitizeTrack(raw: unknown): MusicTrack | null {
    if (!raw || typeof raw !== 'object') return null;
    const t = raw as Record<string, unknown>;
    if (typeof t.id !== 'string' || !TRACK_ID_PATTERN.test(t.id)) return null;
    if (typeof t.name !== 'string' || typeof t.mime !== 'string' || typeof t.size !== 'number') return null;
    const mime = (AUDIO_MIME_TYPES as readonly string[]).includes(t.mime) ? t.mime : null;
    const name = printable(t.name).trim().slice(0, MAX_TRACK_NAME);
    if (!mime || !name || !Number.isFinite(t.size) || t.size <= 0 || t.size > MAX_TRACK_BYTES) return null;
    return { id: t.id, name, mime, size: Math.round(t.size) };
}

/** Validates anything from storage or the cloud: unique ids, accepted types and the song cap. */
export function sanitizeMusicLibrary(raw: unknown): MusicLibrary | null {
    const list = (raw as { playlist?: unknown } | null)?.playlist;
    if (!Array.isArray(list)) return null;
    const seen = new Set<string>();
    const playlist: MusicTrack[] = [];
    for (const item of list) {
        const track = sanitizeTrack(item);
        if (!track || seen.has(track.id)) continue;
        seen.add(track.id);
        playlist.push(track);
        if (playlist.length === MAX_UPLOADS) break;
    }
    return { playlist };
}

/** On sign-in: the account's list wins, and this browser's songs it does not have are appended. */
export function mergeMusicLibraries(account: MusicLibrary, guest: MusicLibrary): MusicLibrary {
    const ids = new Set(account.playlist.map((track) => track.id));
    const extra = guest.playlist.filter((track) => !ids.has(track.id));
    return sanitizeMusicLibrary({ playlist: [...account.playlist, ...extra] }) ?? account;
}

/** Parses a localStorage entry; null if it is missing or broken. */
const readJson = (key: string): unknown => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

/** The saved playlist; empty when there is none (first visit or after signing out). */
export function readMusicLibrary(): MusicLibrary {
    return sanitizeMusicLibrary(readJson(MUSIC_STORAGE_KEY)) ?? createDefaultLibrary();
}

/** Saves the playlist; false if storage is unavailable or full. */
export function writeMusicLibrary(library: MusicLibrary): boolean {
    try {
        localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(library));
        return true;
    } catch {
        return false;
    }
}

/** Ids of songs still waiting to be uploaded. */
export function readPendingUploads(): string[] {
    const raw = readJson(MUSIC_PENDING_KEY);
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && TRACK_ID_PATTERN.test(id)) : [];
}

/** Saves (or clears) the ids of songs waiting to be uploaded. */
export function writePendingUploads(ids: readonly string[]): void {
    try {
        if (ids.length) localStorage.setItem(MUSIC_PENDING_KEY, JSON.stringify(ids));
        else localStorage.removeItem(MUSIC_PENDING_KEY);
    } catch {
        // No storage: it will be retried while the tab stays open.
    }
}

// Device preferences, like the language: they do not travel with the account.
const MUSIC_ON_KEY = 'spinly-music-on';
const MUSIC_VOLUME_KEY = 'spinly-music-volume';
export const DEFAULT_MUSIC_VOLUME = 0.6;

/** Whether music was on and at what volume. */
export function readMusicPreference(): { on: boolean; volume: number } {
    try {
        const volume = Number(localStorage.getItem(MUSIC_VOLUME_KEY));
        return {
            on: localStorage.getItem(MUSIC_ON_KEY) === 'on',
            volume: localStorage.getItem(MUSIC_VOLUME_KEY) !== null && Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 1) : DEFAULT_MUSIC_VOLUME,
        };
    } catch {
        return { on: false, volume: DEFAULT_MUSIC_VOLUME };
    }
}

/** Saves whether music is on and/or its volume. */
export function writeMusicPreference(pref: { on?: boolean; volume?: number }): void {
    try {
        if (pref.on !== undefined) localStorage.setItem(MUSIC_ON_KEY, pref.on ? 'on' : 'off');
        if (pref.volume !== undefined) localStorage.setItem(MUSIC_VOLUME_KEY, String(Math.round(pref.volume * 100) / 100));
    } catch {
        // No storage: the preference lasts as long as the tab.
    }
}
