/**
 * DuelWheel: the two-sector wheel that decides each tournament duel.
 *
 * It reuses the main wheel's rim, lights, pointer and disc (Wheel.css classes). Side A sits on the
 * left and side B on the right, exactly like the scoreboard above it, and each sector is sized by its
 * odds. The space bar spins it too, and the pointer and lights open the same color pickers as the
 * main wheel (the colors are saved in the active theme).
 */
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import Icon from '../common/Icon';
import Tooltip from '../common/Tooltip';
import { useTranslation } from '../i18n/LanguageProvider';
import { useSoundPreference, useSpinTicks } from '../../hooks/useSpinSound';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useMusicPulse } from '../../hooks/useMusicPulse';
import { useMusic } from '../music/MusicProvider';
import type { WheelColorField } from '../wheel/Wheel';
import { colorCss, duelSectors, spinDuel, type Participant, type Side } from '../../scripts/tournament';
import { useTournamentText } from '../../scripts/tournament-strings';

const ColorPicker = lazy(() => import('../editor/ColorPicker'));

/** Resolved value of a CSS variable (the active theme's color). */
const cssColor = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000000';

// A regular spin lasts as long as the main wheel's (4.2 s); a quick one, 1.4 s.
export const DUEL_SPIN_MS = 4200;
export const QUICK_SPIN_MS = 1400;

// Positions of the 24 rim lights (SVG units) and their staggered animation delays.
const RIM_LIGHTS = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 2 * Math.PI;
    return { x: 50 + 48.6 * Math.sin(angle), y: 50 - 48.6 * Math.cos(angle), delay: `${(-(i / 24) * 2.4).toFixed(2)}s` };
});

/** CSS color of a participant, with a neutral fallback while the slot is empty. */
const colorVar = (participant: Participant | undefined) => colorCss(participant?.color ?? 'indigo');

interface DuelWheelProps {
    a: Participant | undefined;
    b: Participant | undefined;
    /** Probability that A wins each spin (0-1). */
    probability: number;
    quickSpin: boolean;
    /** No duel in play (finished tournament): the wheel stays still. */
    disabled: boolean;
    onSpinStart: () => void;
    onResult: (winner: Side, ms: number) => void;
    /** Pointer and lights: the same theme colors as the main wheel (saved in the theme). */
    onColorChange: (field: WheelColorField, color: string) => void;
}

/** Renders the duel wheel, its spin button and the keyboard hint. */
function DuelWheel({ a, b, probability, quickSpin, disabled, onSpinStart, onResult, onColorChange }: DuelWheelProps) {
    const { t } = useTranslation();
    const { tt } = useTournamentText();
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const discRef = useRef<HTMLDivElement>(null);
    const timer = useRef<number | undefined>(undefined);
    const sound = useSoundPreference();
    // One tick every twelfth of a turn: with only two sectors it would barely tick otherwise.
    useSpinTicks(discRef, spinning, 12, sound.enabled);
    const duration = quickSpin ? QUICK_SPIN_MS : DUEL_SPIN_MS;
    // With music on, the rim lights follow its beat, like on the main wheel.
    const music = useMusic();
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const containerRef = useRef<HTMLDivElement>(null);
    const lightsFollowMusic = music.playing && !reducedMotion;
    useMusicPulse(containerRef, lightsFollowMusic);
    const pointerRef = useRef<HTMLButtonElement>(null);
    const lightsRef = useRef<HTMLButtonElement>(null);
    const [picker, setPicker] = useState<{ field: WheelColorField; anchor: HTMLElement; color: string } | null>(null);

    /** Opens (or closes, if it is already open) the color picker for the pointer or the lights. */
    const togglePicker = (field: WheelColorField, anchor: HTMLElement | null) => {
        if (!anchor) return;
        const cssVar = field === 'pointerColor' ? '--wheel-pointer-color' : '--wheel-light-color';
        setPicker((open) => (open?.field === field ? null : { field, anchor, color: cssColor(cssVar) }));
    };

    useEffect(() => () => window.clearTimeout(timer.current), []);

    /** Picks the winner, starts the CSS transition and reports the result when it stops. */
    const spin = () => {
        if (spinning || disabled || !a || !b) return;
        const result = spinDuel(probability, rotation);
        setSpinning(true);
        setRotation(result.rotation);
        onSpinStart();
        timer.current = window.setTimeout(() => {
            setSpinning(false);
            onResult(result.winner, duration);
        }, duration);
    };

    // The keyboard listener is registered once, so it calls the latest `spin` through a ref.
    const spinRef = useRef(spin);
    useEffect(() => {
        spinRef.current = spin;
    });

    // Space spins the duel, except in fields, buttons or dialogs (same as the main wheel).
    useEffect(() => {
        /** Space spins, unless the focus is somewhere Space means something else. */
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.code !== 'Space' && event.key !== ' ') || event.repeat) return;
            const target = event.target as HTMLElement | null;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
            if (target?.closest('button, [role="dialog"]')) return;
            event.preventDefault();
            spinRef.current();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const sectors = duelSectors(probability);
    const split = sectors.b[1];
    const discStyle = {
        background: `conic-gradient(${colorVar(b)} 0deg ${split}deg, ${colorVar(a)} ${split}deg 360deg)`,
        transform: `rotate(${rotation}deg)`,
        transitionDuration: `${duration}ms`,
        '--option-count': 2,
    } as CSSProperties;
    // Each label sits in the middle of its own sector.
    const labels = [
        { participant: a, angle: (sectors.a[0] + sectors.a[1]) / 2 },
        { participant: b, angle: (sectors.b[0] + sectors.b[1]) / 2 },
    ];
    const odds = probability === 0.5
        ? t('wheel', 'oddsEqual', { pct: 50, n: 2 })
        : `${a?.name ?? ''}: ${Math.round(probability * 100)}% · ${b?.name ?? ''}: ${100 - Math.round(probability * 100)}%`;

    return (
        <div className="tour-duel-wheel">
            <div className="tour-duel-stage">
                <div
                    ref={containerRef}
                    className={`wheel-container tour-duel-container${spinning ? ' wheel-container--spinning' : ''}${lightsFollowMusic ? ' wheel-container--music' : ''}`}
                    aria-label={tt('wheelAria', { a: a?.name ?? tt('tbd'), b: b?.name ?? tt('tbd') })}
                    role="group"
                >
                    <button
                        ref={pointerRef}
                        type="button"
                        className="wheel-pointer-btn"
                        onClick={() => togglePicker('pointerColor', pointerRef.current)}
                        aria-label={t('wheel', 'pointerColor')}
                        aria-expanded={picker?.field === 'pointerColor'}
                        title={t('wheel', 'pointerColor')}
                    >
                        <Icon name="pointer" className="wheel-pointer" size={40} />
                    </button>
                    {/* The whole wheel opens the lights color; the pointer sits above it with its own */}
                    <button
                        ref={lightsRef}
                        type="button"
                        className="wheel-lights-btn"
                        onClick={() => togglePicker('lightColor', lightsRef.current)}
                        aria-label={t('wheel', 'lightsColor')}
                        aria-expanded={picker?.field === 'lightColor'}
                        title={t('wheel', 'lightsColor')}
                    />
                    <svg className="wheel-rim" viewBox="0 0 100 100" aria-hidden="true">
                        {/* Own gradients: the main wheel's ones live inside a display: none subtree */}
                        <defs>
                            <linearGradient id="duel-rim-gradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" className="wheel-rim-stop-top" />
                                <stop offset="1" className="wheel-rim-stop-bottom" />
                            </linearGradient>
                            <radialGradient id="duel-light-halo">
                                <stop offset="0" className="wheel-light-halo-core" />
                                <stop offset="1" className="wheel-light-halo-edge" />
                            </radialGradient>
                        </defs>
                        <circle className="wheel-rim-ring" cx="50" cy="50" r="48.6" />
                        <circle className="wheel-rim-inner" cx="50" cy="50" r="47.1" />
                        {RIM_LIGHTS.map((light, i) => (
                            <circle key={`halo-${i}`} className="wheel-light-halo" cx={light.x} cy={light.y} r="3.2" />
                        ))}
                        {RIM_LIGHTS.map((light, i) => (
                            <circle key={i} className="wheel-light wheel-light--rim" cx={light.x} cy={light.y} r="0.75" style={{ animationDelay: light.delay }} />
                        ))}
                        <circle className="wheel-hub" cx="50" cy="50" r="5" />
                    </svg>
                    <div ref={discRef} className="wheel-disc" style={discStyle}>
                        {labels.map(({ participant, angle }, index) => (
                            <span key={index} className="wheel-label" style={{ transform: `rotate(${angle}deg)` }}>
                                <span className="wheel-label-text">{participant?.name ?? tt('tbd')}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            {picker && (
                <Suspense fallback={null}>
                    <ColorPicker
                        key={picker.field}
                        color={picker.color}
                        onChange={(color) => onColorChange(picker.field, color)}
                        onClose={() => setPicker(null)}
                        anchorEl={picker.anchor}
                        placement={picker.field === 'lightColor' ? 'around' : 'below'}
                    />
                </Suspense>
            )}
            <div className="wheel-spin-zone tour-duel-spin-zone">
                <button
                    type="button"
                    className={`wheel-spin-button spinly-btn-primary${spinning ? ' wheel-spin-button--spinning' : ''}`}
                    data-sound="none"
                    onClick={spin}
                    disabled={spinning || disabled || !a || !b}
                >
                    <Icon name="spin" className="wheel-spin-icon" />
                    <span className="wheel-spin-button-text">{spinning ? tt('spinning') : tt('spinDuel')}</span>
                </button>
                <div className="wheel-spin-hint">
                    <span className="wheel-spin-key">{t('wheel', 'space')}</span>
                    <span className="wheel-spin-hint-text">{t('wheel', 'toSpin')}</span>
                    <span className="wheel-spin-hint-sep" aria-hidden="true">·</span>
                    <Tooltip className="wheel-spin-odds" ariaLabel={`${t('wheel', 'certified')}: ${t('wheel', 'oddsAria')}`} content={odds}>
                        <Icon name="shieldCheck" className="wheel-spin-hint-icon" />
                        <span className="wheel-spin-hint-text">{t('wheel', 'certified')}</span>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

export default DuelWheel;
