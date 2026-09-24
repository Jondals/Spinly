import { useRef, type CSSProperties } from 'react';
import Icon, { type IconName } from '../common/Icon';
import StatusMessage from '../common/StatusMessage';
import { useTranslation } from '../i18n/LanguageProvider';
import { useSortable } from '../../hooks/useSortable';
import { useSoundPreference } from '../../hooks/useSpinSound';
import { useMusic } from './MusicProvider';
import EqualizerBars from './EqualizerBars';
import { AUDIO_ACCEPT, MAX_TRACK_BYTES, MAX_UPLOADS } from '../../scripts/music-library';

const MB = Math.round(MAX_TRACK_BYTES / (1024 * 1024));

interface VolumeRowProps {
    icon: IconName;
    label: string;
    ariaLabel: string;
    value: number;
    onChange: (value: number) => void;
}

/** Fila del mezclador: icono, nombre y deslizador de 0 a 1 con la parte llena coloreada. */
function VolumeRow({ icon, label, ariaLabel, value, onChange }: VolumeRowProps) {
    return (
        <label className="spinly-music-volume">
            <Icon name={icon} size={15} />
            <span className="spinly-music-volume-label">{label}</span>
            <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                aria-label={ariaLabel}
                style={{ '--fill': `${Math.round(value * 100)}%` } as CSSProperties}
            />
        </label>
    );
}

interface MusicPanelProps {
    /** Escritorio: el volumen de los efectos va aquí, en vez de un botón aparte de silenciar. */
    showSoundsVolume?: boolean;
}

/**
 * Reproductor y playlist: lo que suena con sus controles, el mezclador, la lista (tocar una
 * canción la pone, el asa la reordena, la X la quita) y la subida de canciones propias.
 */
function MusicPanel({ showSoundsVolume = false }: MusicPanelProps) {
    const { t, tm } = useTranslation();
    const music = useMusic();
    const sound = useSoundPreference();
    const fileInput = useRef<HTMLInputElement>(null);
    const sortable = useSortable(music.moveTrack, 'spinly-music-track');
    const current = music.playlist.find((track) => track.id === music.currentId) ?? null;
    const empty = music.playlist.length === 0;
    const status = music.playing ? t('music', 'nowPlaying') : current ? t('music', 'paused') : t('music', 'nothing');
    const soundsValue = sound.enabled ? sound.volume : 0;

    return (
        <div className="spinly-music">
            <div className="spinly-music-now">
                <span className={`spinly-music-disc${music.playing ? ' spinly-music-disc--spinning' : ''}`} aria-hidden="true" />
                <div className="spinly-music-now-text">
                    <span className="spinly-music-now-label">{status}</span>
                    <span className="spinly-music-now-title">{current ? current.name : t('music', 'yourPlaylist')}</span>
                </div>
            </div>

            <div className="spinly-music-controls">
                <button type="button" className="spinly-music-control" onClick={music.previous} disabled={empty} aria-label={t('music', 'previous')} title={t('music', 'previous')}>
                    <Icon name="skipBack" size={15} />
                </button>
                <button
                    type="button"
                    className="spinly-music-control spinly-music-control--main"
                    onClick={music.toggle}
                    disabled={empty}
                    aria-label={music.playing ? t('music', 'pause') : t('music', 'play')}
                    title={music.playing ? t('music', 'pause') : t('music', 'play')}
                >
                    <Icon name={music.playing ? 'pause' : 'play'} size={16} />
                </button>
                <button type="button" className="spinly-music-control" onClick={music.next} disabled={empty} aria-label={t('music', 'next')} title={t('music', 'next')}>
                    <Icon name="skipForward" size={15} />
                </button>
            </div>

            <div className="spinly-music-mixer">
                <VolumeRow icon="music" label={t('music', 'music')} ariaLabel={t('music', 'volume')} value={music.volume} onChange={music.setVolume} />
                {showSoundsVolume && (
                    <VolumeRow
                        icon={soundsValue > 0 ? 'soundOn' : 'soundOff'}
                        label={t('music', 'sounds')}
                        ariaLabel={t('music', 'soundsVolume')}
                        value={soundsValue}
                        onChange={sound.setVolume}
                    />
                )}
            </div>

            <div className="spinly-music-list-head">
                <span>{t('music', 'playlist')}</span>
                <span className="spinly-music-count">{music.playlist.length} / {MAX_UPLOADS}</span>
            </div>
            {empty ? (
                <p className="spinly-music-empty">{t('music', 'empty')}</p>
            ) : (
                <ol className="spinly-music-list">
                    {music.playlist.map((track, index) => {
                        const isCurrent = track.id === music.currentId;
                        const busy = track.id === music.loadingId || track.id === music.uploadingId;
                        const drag = sortable.itemState(index);
                        return (
                            <li
                                key={track.id}
                                ref={sortable.itemRef(index)}
                                className={`spinly-music-track${isCurrent ? ' spinly-music-track--current' : ''}${drag.className}`}
                                style={drag.style}
                            >
                                <button
                                    type="button"
                                    className="spinly-music-drag"
                                    data-sound="none"
                                    aria-label={t('music', 'moveTrack', { name: track.name })}
                                    title={t('options', 'dragHandle')}
                                    {...sortable.handleProps(index, music.playlist.length)}
                                >⠿</button>
                                <button
                                    type="button"
                                    className="spinly-music-track-main"
                                    onClick={() => music.playTrack(track.id)}
                                    aria-label={t('music', 'playTrack', { name: track.name })}
                                    aria-current={isCurrent ? 'true' : undefined}
                                >
                                    <span className="spinly-music-track-index" aria-hidden="true">
                                        {busy ? <span className="spinly-music-spinner" /> : isCurrent && music.playing ? <EqualizerBars /> : index + 1}
                                    </span>
                                    <span className="spinly-music-track-name">{track.name}</span>
                                </button>
                                <button
                                    type="button"
                                    className="spinly-music-remove"
                                    onClick={() => music.removeTrack(track.id)}
                                    aria-label={t('music', 'removeTrack', { name: track.name })}
                                    title={t('music', 'removeTrack', { name: track.name })}
                                >
                                    <Icon name="close" size={12} />
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}

            <div className="spinly-music-upload">
                <button
                    type="button"
                    className={`spinly-music-upload-btn${empty ? ' spinly-music-upload-btn--first' : ''}`}
                    onClick={() => fileInput.current?.click()}
                    disabled={music.playlist.length >= MAX_UPLOADS}
                >
                    <Icon name="upload" size={15} />
                    {t('music', 'upload')}
                </button>
                <input
                    ref={fileInput}
                    type="file"
                    accept={AUDIO_ACCEPT}
                    multiple
                    hidden
                    aria-label={t('music', 'upload')}
                    onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        event.target.value = '';
                        if (files.length) void music.addFiles(files);
                    }}
                />
                <p className="spinly-music-hint">{t('music', 'uploadHint', { mb: MB })}</p>
            </div>

            {music.notice && <StatusMessage tone={music.notice.tone}>{tm(music.notice.text)}</StatusMessage>}
        </div>
    );
}

export default MusicPanel;
