/**
 * MusicPanel: the music player and playlist (now playing, controls, track list and uploads). It lives in the
 * Playlist section of the settings menu; the volumes live in its Options section.
 */
import { useRef } from 'react';
import Icon from '../common/Icon';
import StatusMessage from '../common/StatusMessage';
import { useTranslation } from '../i18n/LanguageProvider';
import { useSortable } from '../../hooks/useSortable';
import { useMusic } from './MusicProvider';
import EqualizerBars from './EqualizerBars';
import { AUDIO_ACCEPT, MAX_TRACK_BYTES, MAX_UPLOADS } from '../../scripts/music-library';

const MB = Math.round(MAX_TRACK_BYTES / (1024 * 1024));

/**
 * Player and playlist: what is playing with its controls, the list (tapping a song plays it, the handle
 * reorders it, the X removes it) and uploading your own songs.
 */
function MusicPanel() {
    const { t, tm } = useTranslation();
    const music = useMusic();
    const fileInput = useRef<HTMLInputElement>(null);
    const sortable = useSortable(music.moveTrack, 'spinly-music-track');
    const current = music.playlist.find((track) => track.id === music.currentId) ?? null;
    const empty = music.playlist.length === 0;
    const status = music.playing ? t('music', 'nowPlaying') : current ? t('music', 'paused') : t('music', 'nothing');

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
