/**
 * SettingsMenu: the gear button of the header and its panel.
 *
 * Two collapsible sections: Options (sound effects and music volume, light mode and replaying the intro)
 * and Playlist (the music player with its songs). It replaces the old light/dark button and the music
 * corner, so every preference and the music live in one place, on desktop and on mobile.
 */
import { lazy, Suspense, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Icon, { type IconName } from '../common/Icon';
import EqualizerBars from '../music/EqualizerBars';
import { useMusic } from '../music/MusicProvider';
import { useTranslation } from '../i18n/LanguageProvider';
import { useDismiss } from '../../hooks/useDismiss';
import { useColorScheme } from '../../hooks/useColorScheme';
import { useSoundPreference } from '../../hooks/useSpinSound';
import { replaySplashOnNextLoad } from '../../scripts/splash';
import '../../css/Music.css';

// The player is only needed once the panel is opened: kept out of the initial JS.
const MusicPanel = lazy(() => import('../music/MusicPanel'));

// Must match the exit animation of .spinly-settings-menu--closing (Header.css).
const CLOSE_MS = 140;

interface VolumeRowProps {
    icon: IconName;
    label: string;
    ariaLabel: string;
    value: number;
    onChange: (value: number) => void;
}

/** A volume row: icon, name, a 0-1 slider with its filled part colored, and the percentage. */
function VolumeRow({ icon, label, ariaLabel, value, onChange }: VolumeRowProps) {
    return (
        <label className="spinly-music-volume spinly-settings-volume">
            <Icon name={icon} size={16} />
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
            <output className="spinly-settings-percent">{Math.round(value * 100)}%</output>
        </label>
    );
}

/** A collapsible section of the panel: icon, title, an optional badge and a chevron. */
function Section({ icon, title, badge, defaultOpen = true, children }: { icon: ReactNode; title: string; badge?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
    const [open, setOpen] = useState(defaultOpen);
    const bodyId = useId();
    return (
        <section className={`spinly-settings-section${open ? ' spinly-settings-section--open' : ''}`}>
            <button
                type="button"
                className="spinly-settings-section-head"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-controls={bodyId}
            >
                <span className="spinly-settings-section-icon">{icon}</span>
                <span className="spinly-settings-section-title">{title}</span>
                {badge !== undefined && <span className="spinly-settings-badge">{badge}</span>}
                <Icon name="chevronUp" size={16} className="spinly-settings-chevron" />
            </button>
            {open && <div id={bodyId} className="spinly-settings-section-body">{children}</div>}
        </section>
    );
}

/** The gear button and its panel. */
function SettingsMenu() {
    const { t } = useTranslation();
    const music = useMusic();
    const sound = useSoundPreference();
    const { scheme, toggle: toggleScheme } = useColorScheme();
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const closeTimer = useRef<number | undefined>(undefined);
    const rootRef = useRef<HTMLDivElement>(null);
    const titleId = useId();

    /** Closes the panel after its exit animation. */
    const close = () => {
        if (!open || closing) return;
        setClosing(true);
        closeTimer.current = window.setTimeout(() => {
            setOpen(false);
            setClosing(false);
        }, CLOSE_MS);
    };

    /** Opens the panel, or closes it if it is open. */
    const toggle = () => {
        if (open) {
            close();
            return;
        }
        window.clearTimeout(closeTimer.current);
        setClosing(false);
        setOpen(true);
    };

    useDismiss(open && !closing, close, [rootRef]);
    useEffect(() => () => window.clearTimeout(closeTimer.current), []);

    /** Replays the intro: the splash shows again on the next load, which happens right away. */
    const replayIntro = () => {
        replaySplashOnNextLoad();
        window.location.reload();
    };

    const soundsValue = sound.enabled ? sound.volume : 0;
    const label = open && !closing ? t('settings', 'close') : t('settings', 'open');

    return (
        <div className="spinly-settings" ref={rootRef}>
            <button
                type="button"
                className={`spinly-settings-btn${music.playing ? ' spinly-settings-btn--music' : ''}`}
                onClick={toggle}
                aria-label={label}
                aria-expanded={open && !closing}
                aria-haspopup="dialog"
                title={label}
            >
                <Icon name="settings" size={22} />
                {/* While music plays, a small equalizer on the gear says so */}
                {music.playing && <span className="spinly-settings-playing"><EqualizerBars /></span>}
            </button>

            {open && (
                <div className={`spinly-settings-menu${closing ? ' spinly-settings-menu--closing' : ''}`} role="dialog" aria-labelledby={titleId}>
                    <div className="spinly-settings-head">
                        <h2 id={titleId}>{t('settings', 'title')}</h2>
                        <button type="button" className="spinly-settings-close" onClick={close} aria-label={t('settings', 'close')}>
                            <Icon name="close" size={16} />
                        </button>
                    </div>

                    <Section icon={<Icon name="settings" size={16} />} title={t('settings', 'options')}>
                        <VolumeRow
                            icon={soundsValue > 0 ? 'soundOn' : 'soundOff'}
                            label={t('settings', 'sounds')}
                            ariaLabel={t('music', 'soundsVolume')}
                            value={soundsValue}
                            onChange={sound.setVolume}
                        />
                        <VolumeRow icon="music" label={t('settings', 'music')} ariaLabel={t('music', 'volume')} value={music.volume} onChange={music.setVolume} />
                        <label className="spinly-settings-switch">
                            <span>{t('settings', 'lightMode')}</span>
                            <input type="checkbox" role="switch" checked={scheme === 'light'} onChange={toggleScheme} />
                            <span className="spinly-settings-switch-track" aria-hidden="true"><span /></span>
                        </label>
                        <button type="button" className="spinly-action-btn spinly-settings-intro" onClick={replayIntro}>
                            <Icon name="play" size={13} />
                            {t('settings', 'replayIntro')}
                        </button>
                    </Section>

                    <Section icon={music.playing ? <EqualizerBars /> : <Icon name="music" size={16} />} title={t('settings', 'playlist')} badge={music.playlist.length}>
                        <Suspense fallback={<div className="spinly-settings-loading" />}>
                            <MusicPanel />
                        </Suspense>
                    </Section>
                </div>
            )}
        </div>
    );
}

export default SettingsMenu;
