/**
 * AudioControls: the entry point to music and sound effects (a corner dock on desktop, a section of
 * the menu on mobile).
 */
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import Icon from '../common/Icon';
import { useTranslation } from '../i18n/LanguageProvider';
import { useDismiss } from '../../hooks/useDismiss';
import { useMusic } from './MusicProvider';
import EqualizerBars from './EqualizerBars';
import '../../css/Music.css';

// The playlist is only needed once it is opened: kept out of the initial JS.
const MusicPanel = lazy(() => import('./MusicPanel'));

// Matches the exit animation of .spinly-audio-popover--closing (Music.css).
const CLOSE_MS = 180;

interface AudioControlsProps {
    /** dock: corner of the wheel on desktop, with the music button and the playlist opening upwards.
        drawer: a section of the mobile menu, a row that unfolds the player inside the menu. */
    variant: 'dock' | 'drawer';
}

/** Access to music: the player with the playlist and the music and effects volumes. */
function AudioControls({ variant }: AudioControlsProps) {
    const { t } = useTranslation();
    const music = useMusic();
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    // In the menu the player stays mounted after it is opened once, so folding it is animated too.
    const [mounted, setMounted] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const closeTimer = useRef<number | undefined>(undefined);
    const panelId = useId();
    const isDock = variant === 'dock';
    const expanded = open && !closing;

    /** Closes the player (in the dock, after its exit animation). */
    const close = () => {
        if (!isDock) {
            setOpen(false);
            return;
        }
        setClosing(true);
        window.clearTimeout(closeTimer.current);
        closeTimer.current = window.setTimeout(() => {
            setOpen(false);
            setClosing(false);
        }, CLOSE_MS);
    };

    /** Opens or closes the player. */
    const togglePanel = () => {
        if (expanded) {
            close();
            return;
        }
        window.clearTimeout(closeTimer.current);
        setClosing(false);
        setOpen(true);
        setMounted(true);
    };

    useDismiss(isDock && expanded, close, [rootRef]);
    useEffect(() => () => window.clearTimeout(closeTimer.current), []);

    const panelLabel = expanded ? t('music', 'closePlaylist') : t('music', 'openPlaylist');

    if (!isDock) {
        return (
            <div className="spinly-audio spinly-audio--drawer">
                <button type="button" className="spinly-audio-playlist-btn" onClick={togglePanel} aria-expanded={expanded} aria-controls={panelId} aria-label={panelLabel}>
                    {music.playing ? <EqualizerBars /> : <Icon name="listMusic" size={16} />}
                    <span className="spinly-audio-btn-text">{t('music', 'playlist')}</span>
                    <span className="spinly-audio-playlist-count">{music.playlist.length}</span>
                    <Icon name="chevronUp" size={14} className="spinly-audio-playlist-chevron" />
                </button>
                <div id={panelId} className={`spinly-audio-fold${open ? ' spinly-audio-fold--open' : ''}`} inert={!open}>
                    <div className="spinly-audio-fold-inner">
                        {mounted && (
                            <Suspense fallback={null}>
                                <MusicPanel showSoundsVolume />
                            </Suspense>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    const empty = music.playlist.length === 0;
    // With an empty playlist there is nothing to play: the music button leads to uploading songs.
    const musicLabel = empty ? t('music', 'addMusic') : music.playing ? t('music', 'pauseMusic') : t('music', 'playMusic');
    /** Plays or pauses, or opens the player to add songs when the playlist is empty. */
    const onMusic = () => {
        if (!empty) music.toggle();
        else if (!expanded) togglePanel();
    };

    return (
        <div ref={rootRef} className="spinly-audio spinly-audio--dock">
            {open && (
                <div id={panelId} className={`spinly-audio-popover${closing ? ' spinly-audio-popover--closing' : ''}`} role="dialog" aria-label={t('music', 'playlist')}>
                    <Suspense fallback={<div className="spinly-audio-popover-loading" />}>
                        <MusicPanel showSoundsVolume />
                    </Suspense>
                </div>
            )}
            <div className={`spinly-audio-split${music.playing ? ' spinly-audio-split--on' : ''}`}>
                <button
                    type="button"
                    className="spinly-audio-btn"
                    onClick={onMusic}
                    aria-pressed={empty ? undefined : music.playing}
                    aria-label={musicLabel}
                    title={musicLabel}
                >
                    {music.playing ? <EqualizerBars /> : <Icon name="music" size={16} />}
                </button>
                <button
                    type="button"
                    className="spinly-audio-btn spinly-audio-btn--caret"
                    onClick={togglePanel}
                    aria-expanded={expanded}
                    aria-controls={open ? panelId : undefined}
                    aria-label={panelLabel}
                    title={panelLabel}
                >
                    <Icon name="chevronUp" size={14} />
                </button>
            </div>
        </div>
    );
}

export default AudioControls;
