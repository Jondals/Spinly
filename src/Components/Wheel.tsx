import React, { useCallback, useEffect, useRef, useState } from 'react';
import '../css/Wheel.css';
import { SPIN_DURATION, describeSector, getWheelBackground, spinWheel, getLabelTransform, getOptionProbabilities, isLightColor } from '../scripts/wheel';
import Tooltip from './Tooltip';
import WinnerOverlay from './WinnerOverlay';
import type { WheelTheme } from '../types/theme-types';
import type { WheelOption } from '../scripts/option-wheel';
import { useTranslation } from '../lib/i18n';

interface WheelProps {
    options: WheelOption[];
    activeTheme?: WheelTheme | null;
}

function Wheel({ options, activeTheme }: WheelProps) {
    const { lang, t } = useTranslation();
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [winner, setWinner] = useState<string | null>(null);
    const hasOptions = options.length > 0;
    const showResult = Boolean(winner) && !spinning;
    const size = 480;
    const radius = size / 2;
    const n = Math.max(options.length, 1);

    const handleSpin = () => {
        if (spinning || !hasOptions) return;
        setWinner(null);
        setSpinning(true);
        const result = spinWheel(options, rotation);
        setRotation(result.rotation);
        setTimeout(() => { setSpinning(false); setWinner(result.winner);}, SPIN_DURATION);
    };

    // Cerrar el overlay de resultado: el foco vuelve al botón de girar (teclado)
    const spinButtonRef = useRef<HTMLButtonElement>(null);
    const closeResult = useCallback(() => {
        setWinner(null);
        spinButtonRef.current?.focus({ preventScroll: true });
    }, []);

    // "Spin Again": cierra el overlay y lanza un giro nuevo
    const handleSpinAgain = () => {
        spinButtonRef.current?.focus({ preventScroll: true });
        handleSpin();
    };

    // Referencia siempre actualizada para el listener global (evita closures viejas)
    const handleSpinRef = useRef(handleSpin);
    useEffect(() => {
        handleSpinRef.current = handleSpin;
    });

    // Barra espaciadora = girar, salvo que el foco esté en un input de texto,
    // textarea, select, contenido editable o dentro de un botón (nativo).
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

    // Tooltip de probabilidades: reparto equitativo → una frase; con pesos distintos → lista
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
            {/* Resultado: overlay flotante (portal a <body>), fuera del flujo del layout */}
            {showResult && winner && (
                <WinnerOverlay winner={winner} onClose={closeResult} onSpinAgain={handleSpinAgain} />
            )}
            <div className="wheel-container">
                <div className="wheel-pointer" />
                <div className={`wheel-disc ${!hasOptions ? 'wheel-disc--empty' : ''}${hasAnyImage ? ' wheel-disc--with-img' : ''}`} style={wheelStyle}>
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
                                        {img && (
                                            <image
                                                href={img}
                                                x={0}
                                                y={0}
                                                width={size}
                                                height={size}
                                                preserveAspectRatio="xMidYMid slice"
                                            />
                                        )}
                                        <path d={describeSector(radius, radius, radius, start, end)} fill="rgba(0,0,0,0.28)" />
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

                    <div className="wheel-hub"/>
                </div>
            </div>

            {/* Botón GIRAR (Imagen 2): zona a ancho completo + pista de teclado */}
            <div className="wheel-spin-zone">
                <button
                    ref={spinButtonRef}
                    type="button"
                    className={`wheel-spin-button spinly-btn-primary${spinning ? ' wheel-spin-button--spinning' : ''}`}
                    onClick={handleSpin}
                    disabled={spinning || !hasOptions}
                >
                    <svg className="wheel-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                        <path d="M8 16H3v5" />
                    </svg>
                    <span className="wheel-spin-button-text">{spinning ? t('wheel', 'spinning') : t('wheel', 'spin')}</span>
                </button>
                <div className="wheel-spin-hint">
                    <span className="wheel-spin-key">{t('wheel', 'space')}</span>
                    <span className="wheel-spin-hint-text">{t('wheel', 'toSpin')}</span>
                    <span className="wheel-spin-hint-sep" aria-hidden="true">·</span>
                    {/* Tooltip con la probabilidad REAL de cada opción (getOptionProbabilities) */}
                    <Tooltip className="wheel-spin-odds" ariaLabel={t('wheel', 'oddsAria')} content={oddsContent}>
                        <svg className="wheel-spin-hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                            <path d="m9 12 2 2 4-4" />
                        </svg>
                        <span className="wheel-spin-hint-text">{t('wheel', 'certified')}</span>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

export default Wheel;