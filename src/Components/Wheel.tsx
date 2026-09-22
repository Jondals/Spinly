import React, { useState } from 'react';
import '../css/Wheel.css';
import { SPIN_DURATION, describeSector, getWheelBackground, spinWheel, getLabelTransform, isLightColor } from '../scripts/wheel';
import type { WheelTheme } from '../types/theme-types';
import type { WheelOption } from '../scripts/option-wheel';

interface WheelProps {
    options: WheelOption[];
    activeTheme?: WheelTheme | null;
}

function Wheel({ options, activeTheme }: WheelProps) {
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

    const segmentColors = activeTheme?.segments
        ? activeTheme.segments.map(s => s.color).filter(Boolean)
        : undefined;
    const segmentImages = activeTheme?.segments
        ? activeTheme.segments.map(s => s.backgroundImage)
        : undefined;
    const hasAnyImage = Boolean(segmentImages?.some(Boolean));

    const wheelStyle: React.CSSProperties = {
        background: hasAnyImage ? undefined : getWheelBackground(options, segmentColors),
        transform: `rotate(${rotation}deg)`,
        transitionDuration: `${SPIN_DURATION}ms`,
        ['--option-count' as string]: options.length || 1,
    } as React.CSSProperties;

    return (
        <div className="Wheel">
            <div className="wheel-result-container">
                <p className={`wheel-result ${showResult ? 'wheel-result--visible' : ''}`}>
                    {showResult ? `¡${winner}!` : ''}
                </p>
            </div>
            <div className="wheel-container">
                <div className="wheel-pointer" />
                <div className={`wheel-disc ${!hasOptions ? 'wheel-disc--empty' : ''}${hasAnyImage ? ' wheel-disc--with-img' : ''}`} style={wheelStyle}>
                    {!hasOptions && (<p className="wheel-empty-text"> Añade opciones para girar </p>)}

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

            {/* Botón GIRAR: mismo tamaño en ambos estados (GIRAR / GIRANDO...) */}
            <button className={`wheel-spin-button ${spinning ? 'wheel-spin-button--spinning' : ''}`} onClick={handleSpin} disabled={spinning || !hasOptions}>
                <span className="wheel-spin-button-text">{spinning ? 'GIRANDO...' : 'GIRAR'}</span>
            </button>
        </div>
    );
}

export default Wheel;