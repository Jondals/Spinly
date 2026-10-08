/**
 * Wheel: the main prize wheel (conic-gradient disc, optional sector images, rim lights, pointer, spin
 * button with ticks, winner dialog and the odds tooltip). Space spins it too.
 */
import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import '../../css/Wheel.css';
import { SPIN_DURATION, describeSector, getImageBox, getWheelBackground, spinWheel, getLabelTransform, getOptionProbabilities, isLightColor, WHEEL_VIEWBOX } from '../../scripts/wheel';
import Icon from '../common/Icon';
import DotField from './DotField';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useMusicPulse } from '../../hooks/useMusicPulse';
import { useMusic } from '../music/MusicProvider';
import Tooltip from '../common/Tooltip';
import type { WheelTheme } from '../../types/theme-types';
import type { WheelOption } from '../../scripts/option-wheel';
import { playWin } from '../../scripts/sound';
import { reportResult, reportSpin, type RemoteSpin } from '../../scripts/chatterly-bridge';
import { useTranslation } from '../i18n/LanguageProvider';
import { useSoundPreference, useSpinTicks } from '../../hooks/useSpinSound';
import { useWheelColors } from '../../hooks/useWheelColors';

/** Wheel colors the user can change by clicking the wheel itself. */
export type WheelColorField = 'pointerColor' | 'lightColor';

interface WheelProps {
    options: WheelOption[];
    activeTheme?: WheelTheme | null;
    onColorChange: (field: WheelColorField, color: string) => void;
    /** false while another view covers it (the tournament): Space does not spin it. */
    active?: boolean;
}

// Only used after an interaction: kept out of the initial JS.
const ColorPicker = lazy(() => import('../editor/ColorPicker'));
const WinnerOverlay = lazy(() => import('./WinnerOverlay'));

/** Lights on a circle; the staggered delay creates the chasing effect. */
const ringOfLights = (count: number, radius: number, cycleSeconds: number) =>
    Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 2 * Math.PI;
        return {
            x: 50 + radius * Math.sin(angle),
            y: 50 - radius * Math.cos(angle),
            delay: `${(-(i / count) * cycleSeconds).toFixed(2)}s`,
        };
    });

// Fixed lights (they do not turn with the disc), like on a fairground wheel. The cycle matches the
// duration of the wheel-light animation (Wheel.css).
const LIGHT_CYCLE_S = 2.4;
const RIM_LIGHTS = ringOfLights(24, 48.6, LIGHT_CYCLE_S);
const HUB_LIGHTS = ringOfLights(8, 5, LIGHT_CYCLE_S);

/** Resolved color of a CSS variable: the theme's one or the light/dark mode default. */
const cssColor = (name: string): string =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000000';

/** Renders the wheel and handles spinning, the result dialog and the color pickers. */
function Wheel({ options: localOptions, activeTheme, onColorChange, active = true }: WheelProps) {
    // A spin that somebody else started in a Chatterly call replaces the options shown, until the person edits their own.
    const [remoteOptions, setRemoteOptions] = useState<WheelOption[] | null>(null);
    const options = remoteOptions ?? localOptions;
    const { lang, t } = useTranslation();
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [winner, setWinner] = useState<string | null>(null);
    const hasOptions = options.length > 0;
    const showResult = Boolean(winner) && !spinning;
    const size = WHEEL_VIEWBOX;
    const radius = size / 2;
    const n = Math.max(options.length, 1);
    const discRef = useRef<HTMLDivElement>(null);
    const pointerRef = useRef<HTMLButtonElement>(null);
    const lightsRef = useRef<HTMLButtonElement>(null);
    const [picker, setPicker] = useState<{ field: WheelColorField; anchor: HTMLElement; color: string } | null>(null);
    const sound = useSoundPreference();
    // With music playing, the lights follow its rhythm and pattern, even while spinning; without music they
    // do their usual fast chase while spinning.
    const music = useMusic();
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const containerRef = useRef<HTMLDivElement>(null);
    // Not while hidden (tournament): the duel wheel carries the music lights then.
    const lightsFollowMusic = music.playing && !reducedMotion && active;
    useMusicPulse(containerRef, lightsFollowMusic);

    useWheelColors(activeTheme);
    useSpinTicks(discRef, spinning, options.length, sound.enabled);

    /** Opens (or closes, if already open) the pointer or lights color picker. */
    const togglePicker = (field: WheelColorField, anchor: HTMLElement | null) => {
        if (!anchor) return;
        const cssVar = field === 'pointerColor' ? '--wheel-pointer-color' : '--wheel-light-color';
        setPicker((open) => (open?.field === field ? null : { field, anchor, color: cssColor(cssVar) }));
    };

    /** Spins the wheel and announces the winner when the transition ends. */
    const handleSpin = () => {
        if (spinning || !hasOptions) return;
        setWinner(null);
        setSpinning(true);
        const result = spinWheel(options, rotation);
        setRotation(result.rotation);
        reportSpin({ options: options.map((option) => ({ name: option.name, color: option.color })), rotation: result.rotation, winner: result.winner });
        setTimeout(() => {
            setSpinning(false);
            setWinner(result.winner);
            playWin();
            reportResult({ kind: 'wheel', title: '', names: options.map((option) => option.name), winner: result.winner });
        }, SPIN_DURATION);
    };

    // Own edits of the options end a remote view.
    useEffect(() => {
        setRemoteOptions(null);
    }, [localOptions]);

    // A spin from somebody else in a Chatterly call: same options, same landing angle, same winner.
    useEffect(() => {
        const onRemoteSpin = (event: Event) => {
            const spin = (event as CustomEvent<RemoteSpin>).detail;
            setRemoteOptions(spin.options.map((option, index) => ({ id: `remote-${index}`, name: option.name, color: option.color })));
            setWinner(null);
            setSpinning(true);
            setRotation((current) => current + ((((spin.rotation - current) % 360) + 360) % 360) + 5 * 360);
            setTimeout(() => {
                setSpinning(false);
                setWinner(spin.winner);
                playWin();
            }, SPIN_DURATION);
        };
        window.addEventListener('chatterly-remote-spin', onRemoteSpin);
        return () => window.removeEventListener('chatterly-remote-spin', onRemoteSpin);
    }, []);

    // Focus goes back to the spin button so it is not lost when the result closes.
    const spinButtonRef = useRef<HTMLButtonElement>(null);
    /** Closes the result dialog. */
    const closeResult = useCallback(() => {
        setWinner(null);
        spinButtonRef.current?.focus({ preventScroll: true });
    }, []);

    /** "Spin again" from the result dialog. */
    const handleSpinAgain = () => {
        spinButtonRef.current?.focus({ preventScroll: true });
        handleSpin();
    };

    // The global listener is registered once; the ref keeps it from using a stale handleSpin.
    const handleSpinRef = useRef(handleSpin);
    const activeRef = useRef(active);
    useEffect(() => {
        handleSpinRef.current = handleSpin;
        activeRef.current = active;
    });

    // Space spins the wheel unless the focus is on a field, a button or a dialog, where Space already has
    // its own meaning.
    useEffect(() => {
        /** Space spins the wheel when nothing else should handle it. */
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code !== 'Space' && e.key !== ' ') return;
            if (e.repeat) return;
            const target = e.target as HTMLElement | null;
            const isTextEntry =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                Boolean(target?.isContentEditable);
            if (isTextEntry) return;
            if (target && (target.tagName === 'BUTTON' || target.closest('button'))) return;
            if (target?.closest('[role="dialog"]')) return;
            if (!activeRef.current) return;
            e.preventDefault();
            handleSpinRef.current();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const segmentColors = activeTheme?.segments
        ? activeTheme.segments.map(s => s.color).filter(Boolean)
        : undefined;
    const segmentImages = activeTheme?.segments
        ? activeTheme.segments.map(s => s.backgroundImage)
        : undefined;
    const hasAnyImage = Boolean(segmentImages?.some(Boolean));

    // Equal odds: one sentence. Different weights: the full list.
    const probabilities = getOptionProbabilities(options);
    /** Up to two decimals without trailing zeros. No Intl.NumberFormat: creating one costs ~6 ms on the first render and only the decimal separator changes here. */
    const formatPct = (probability: number): string => {
        const rounded = String(Math.round(probability * 10000) / 100);
        return lang === 'es' ? rounded.replace('.', ',') : rounded;
    };
    const allEqual = probabilities.every((item) => Math.abs(item.probability - (probabilities[0]?.probability ?? 0)) < 1e-9);
    const oddsContent: React.ReactNode = probabilities.length === 0
        ? t('wheel', 'oddsEmpty')
        : allEqual
            ? t('wheel', 'oddsEqual', { pct: formatPct(probabilities[0].probability), n: probabilities.length })
            : (
                <>
                    <strong className="spinly-tooltip-title">{t('wheel', 'oddsTitle')}</strong>
                    {probabilities.map((item) => (
                        <span key={item.id} className="spinly-tooltip-row">
                            {t('wheel', 'oddsItem', { name: item.name, pct: formatPct(item.probability) })}
                        </span>
                    ))}
                </>
            );

    const wheelStyle: React.CSSProperties = {
        background: hasAnyImage ? undefined : getWheelBackground(options, segmentColors),
        transform: `rotate(${rotation}deg)`,
        transitionDuration: `${SPIN_DURATION}ms`,
        ['--option-count' as string]: options.length || 1,
    } as React.CSSProperties;

    return (
        <div className="Wheel">
            <DotField />
            {showResult && winner && (
                <Suspense fallback={null}>
                    <WinnerOverlay winner={winner} onClose={closeResult} onSpinAgain={handleSpinAgain} />
                </Suspense>
            )}
            <div ref={containerRef} className={`wheel-container${spinning ? ' wheel-container--spinning' : ''}${lightsFollowMusic ? ' wheel-container--music' : ''}`}>
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
                    <defs>
                        <linearGradient id="wheel-rim-gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" className="wheel-rim-stop-top" />
                            <stop offset="1" className="wheel-rim-stop-bottom" />
                        </linearGradient>
                        <radialGradient id="wheel-light-halo">
                            <stop offset="0" className="wheel-light-halo-core" />
                            <stop offset="1" className="wheel-light-halo-edge" />
                        </radialGradient>
                    </defs>
                    <circle className="wheel-rim-ring" cx="50" cy="50" r="48.6" />
                    <circle className="wheel-rim-inner" cx="50" cy="50" r="47.1" />
                    {/* Halo of each light: only with music, music-visuals.ts lights it up with the light */}
                    {RIM_LIGHTS.map((light, i) => (
                        <circle key={`halo-${i}`} className="wheel-light-halo" cx={light.x} cy={light.y} r="3.2" />
                    ))}
                    {RIM_LIGHTS.map((light, i) => (
                        <circle key={i} className="wheel-light wheel-light--rim" cx={light.x} cy={light.y} r="0.75" style={{ animationDelay: light.delay }} />
                    ))}
                    <circle className="wheel-hub" cx="50" cy="50" r="5" />
                    {HUB_LIGHTS.map((light, i) => (
                        <circle key={i} className="wheel-light wheel-light--hub" cx={light.x} cy={light.y} r="0.6" style={{ animationDelay: light.delay }} />
                    ))}
                </svg>
                <div ref={discRef} className={`wheel-disc ${!hasOptions ? 'wheel-disc--empty' : ''}${hasAnyImage ? ' wheel-disc--with-img' : ''}`} style={wheelStyle}>
                    {!hasOptions && (<p className="wheel-empty-text">{t('wheel', 'empty')}</p>)}

                    {hasAnyImage && hasOptions && (
                        <svg className="wheel-img-layer" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
                            <defs>
                                {options.map((option, index) => {
                                    const start = (index / n) * 360;
                                    const end = ((index + 1) / n) * 360;
                                    return (
                                        <clipPath key={option.id} id={`wheel-clip-${index}`}>
                                            <path d={describeSector(radius, radius, radius, start, end)} />
                                        </clipPath>
                                    );
                                })}
                            </defs>
                            {options.map((option, index) => {
                                const start = (index / n) * 360;
                                const end = ((index + 1) / n) * 360;
                                const fill = segmentColors?.[index] ?? option.color;
                                const img = segmentImages?.[index];
                                return (
                                    <g key={`img-${option.id}`} clipPath={`url(#wheel-clip-${index})`}>
                                        <path d={describeSector(radius, radius, radius, start, end)} fill={typeof fill === 'string' && fill.startsWith('#') ? fill : '#6366f1'} />
                                        {img && <image href={img} preserveAspectRatio="xMidYMid slice" {...getImageBox(activeTheme?.segments[index]?.imageFit, size)} />}
                                    </g>
                                );
                            })}
                        </svg>
                    )}

                    {options.map((option, index) => (
                        <span key={option.id} className={`wheel-label ${isLightColor(segmentColors?.[index] ?? option.color) ? 'wheel-label--dark' : ''}${segmentImages?.[index] ? ' wheel-label--over-img' : ''}`} style={{transform: getLabelTransform(index, options.length)}}>
                            <span className="wheel-label-text">{option.name}</span>
                        </span>
                    ))}
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

            <div className="wheel-spin-zone">
                <button
                    ref={spinButtonRef}
                    type="button"
                    className={`wheel-spin-button spinly-btn-primary${spinning ? ' wheel-spin-button--spinning' : ''}`}
                    data-sound="none"
                    onClick={handleSpin}
                    disabled={spinning || !hasOptions}
                >
                    <Icon name="spin" className="wheel-spin-icon" />
                    <span className="wheel-spin-button-text">{spinning ? t('wheel', 'spinning') : t('wheel', 'spin')}</span>
                </button>
                <div className="wheel-spin-hint">
                    <span className="wheel-spin-key">{t('wheel', 'space')}</span>
                    <span className="wheel-spin-hint-text">{t('wheel', 'toSpin')}</span>
                    <span className="wheel-spin-hint-sep" aria-hidden="true">·</span>
                    <Tooltip className="wheel-spin-odds" ariaLabel={`${t('wheel', 'certified')}: ${t('wheel', 'oddsAria')}`} content={oddsContent}>
                        <Icon name="shieldCheck" className="wheel-spin-hint-icon" />
                        <span className="wheel-spin-hint-text">{t('wheel', 'certified')}</span>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

export default Wheel;