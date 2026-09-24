import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import Icon from '../common/Icon';
import { useTranslation } from '../i18n/LanguageProvider';
import { useDismiss } from '../../hooks/useDismiss';
import { useMusic } from './MusicProvider';
import EqualizerBars from './EqualizerBars';
import '../../css/Music.css';

// La playlist solo hace falta al abrirla: fuera del JS inicial.
const MusicPanel = lazy(() => import('./MusicPanel'));

// Coincide con la animación de salida de .spinly-audio-popover--closing (Music.css).
const CLOSE_MS = 180;

interface AudioControlsProps {
    /** dock: esquina de la ruleta en escritorio, con el botón de música y la playlist hacia arriba.
        drawer: sección del menú en móvil, una fila que despliega el reproductor dentro del menú. */
    variant: 'dock' | 'drawer';
}

/** Acceso a la música: el reproductor con la playlist y los volúmenes de música y efectos. */
function AudioControls({ variant }: AudioControlsProps) {
    const { t } = useTranslation();
    const music = useMusic();
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    // En el menú el reproductor se queda montado tras abrirlo una vez: así también se anima al plegar.
    const [mounted, setMounted] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const closeTimer = useRef<number | undefined>(undefined);
    const panelId = useId();
    const isDock = variant === 'dock';
    const expanded = open && !closing;

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
    // Con la playlist vacía no hay nada que poner: el botón de música lleva a subir canciones.
    const musicLabel = empty ? t('music', 'addMusic') : music.playing ? t('music', 'pauseMusic') : t('music', 'playMusic');
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
