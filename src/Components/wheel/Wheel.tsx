import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import '../../css/Wheel.css';
import { SPIN_DURATION, describeSector, getImageBox, getWheelBackground, spinWheel, getLabelTransform, getOptionProbabilities, isLightColor, WHEEL_VIEWBOX } from '../../scripts/wheel';
import Icon from '../common/Icon';
import Tooltip from '../common/Tooltip';
import type { WheelTheme } from '../../types/theme-types';
import type { WheelOption } from '../../scripts/option-wheel';
import { playWin } from '../../scripts/sound';
import { useTranslation } from '../i18n/LanguageProvider';
import { useSoundPreference, useSpinTicks } from '../../hooks/useSpinSound';
import { useWheelColors } from '../../hooks/useWheelColors';

/** Colores de la ruleta que el usuario puede tocar directamente sobre ella. */
export type WheelColorField = 'pointerColor' | 'lightColor';

interface WheelProps {
    options: WheelOption[];
    activeTheme?: WheelTheme | null;
    onColorChange: (field: WheelColorField, color: string) => void;
}

// Solo se usan tras una interacción: fuera del JS inicial.
const ColorPicker = lazy(() => import('../editor/ColorPicker'));
const WinnerOverlay = lazy(() => import('./WinnerOverlay'));

/** Luces en una circunferencia; el retardo escalonado crea el efecto de persecución. */
const ringOfLights = (count: number, radius: number, cycleSeconds: number) =>
    Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 2 * Math.PI;
        return {
            x: 50 + radius * Math.sin(angle),
            y: 50 - radius * Math.cos(angle),
            delay: `${(-(i / count) * cycleSeconds).toFixed(2)}s`,
        };
    });

// Luces fijas (no giran con el disco), como en una ruleta de feria. El ciclo coincide
// con la duración de la animación wheel-light (Wheel.css).
const LIGHT_CYCLE_S = 2.4;
const RIM_LIGHTS = ringOfLights(24, 48.6, LIGHT_CYCLE_S);
const HUB_LIGHTS = ringOfLights(8, 5, LIGHT_CYCLE_S);

/** Color efectivo de una variable CSS: el del tema o el por defecto del modo claro/oscuro. */
const cssColor = (name: string): string =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000000';

function Wheel({ options, activeTheme, onColorChange }: WheelProps) {
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

    useWheelColors(activeTheme);
    useSpinTicks(discRef, spinning, options.length, sound.enabled);

    const togglePicker = (field: WheelColorField, anchor: HTMLElement | null) => {
        if (!anchor) return;
        const cssVar = field === 'pointerColor' ? '--wheel-pointer-color' : '--wheel-light-color';
        setPicker((open) => (open?.field === field ? null : { field, anchor, color: cssColor(cssVar) }));
    };

    const handleSpin = () => {
        if (spinning || !hasOptions) return;
        setWinner(null);
        setSpinning(true);
        const result = spinWheel(options, rotation);
        setRotation(result.rotation);
        setTimeout(() => {
            setSpinning(false);
            setWinner(result.winner);
            playWin();
        }, SPIN_DURATION);
    };

    // El foco vuelve al botón de girar para no perderlo al cerrar el resultado.
    const spinButtonRef = useRef<HTMLButtonElement>(null);
    const closeResult = useCallback(() => {
        setWinner(null);
        spinButtonRef.current?.focus({ preventScroll: true });
    }, []);

    const handleSpinAgain = () => {
        spinButtonRef.current?.focus({ preventScroll: true });
        handleSpin();
    };

    // El listener global se registra una vez; la ref evita que use un handleSpin obsoleto.
    const handleSpinRef = useRef(handleSpin);
    useEffect(() => {
        handleSpinRef.current = handleSpin;
    });

    // Espacio gira la ruleta salvo que el foco esté en un campo, un botón o un diálogo,
    // donde Espacio ya tiene su propio significado.
    useEffect(() => {
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

    // Reparto equitativo: una frase. Con pesos distintos: la lista completa.
    const probabilities = getOptionProbabilities(options);
    const formatPct = (probability: number): string =>
        new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(probability * 100);
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
            {showResult && winner && (
                <Suspense fallback={null}>
                    <WinnerOverlay winner={winner} onClose={closeResult} onSpinAgain={handleSpinAgain} />
                </Suspense>
            )}
            <div className={`wheel-container${spinning ? ' wheel-container--spinning' : ''}`}>
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
                {/* Toda la ruleta abre el color de las luces; la flecha queda por encima con el suyo */}
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
                    </defs>
                    <circle className="wheel-rim-ring" cx="50" cy="50" r="48.6" />
                    <circle className="wheel-rim-inner" cx="50" cy="50" r="47.1" />
                    {RIM_LIGHTS.map((light, i) => (
                        <circle key={i} className="wheel-light" cx={light.x} cy={light.y} r="0.75" style={{ animationDelay: light.delay }} />
                    ))}
                    <circle className="wheel-hub" cx="50" cy="50" r="5" />
                    {HUB_LIGHTS.map((light, i) => (
                        <circle key={i} className="wheel-light" cx={light.x} cy={light.y} r="0.6" style={{ animationDelay: light.delay }} />
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
                    <span className="wheel-spin-hint-sep" aria-hidden="true">·</span>
                    <button
                        type="button"
                        className="wheel-sound-btn"
                        onClick={sound.toggle}
                        aria-pressed={sound.enabled}
                        aria-label={t('wheel', 'sound')}
                        title={t('wheel', 'sound')}
                    >
                        <Icon name={sound.enabled ? 'soundOn' : 'soundOff'} className="wheel-spin-hint-icon" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Wheel;