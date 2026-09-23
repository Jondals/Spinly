import React from 'react';

export interface SegmentedOption<T extends string> {
    id: T;
    label: string;
}

interface SegmentedToggleProps<T extends string> {
    options: SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    ariaLabel: string;
}

// Toggle segmentado compartido ("Mis X / Comunidad" en Themes y Presets):
// un único componente para que ambos sean visualmente idénticos.
// El indicador activo se desliza con transform (ver .spinly-segmented en shared.css).
function SegmentedToggle<T extends string>({ options, value, onChange, ariaLabel }: SegmentedToggleProps<T>) {
    const activeIndex = Math.max(0, options.findIndex((option) => option.id === value));
    const style = {
        '--spinly-seg-count': options.length,
        '--spinly-seg-index': activeIndex,
    } as React.CSSProperties;

    return (
        <div className="spinly-segmented" role="tablist" aria-label={ariaLabel} style={style}>
            <span className="spinly-segmented-indicator" aria-hidden="true" />
            {options.map((option) => {
                const isActive = option.id === value;
                return (
                    <button
                        key={option.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className={`spinly-segmented-btn${isActive ? ' spinly-segmented-btn--active' : ''}`}
                        onClick={() => onChange(option.id)}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

export default SegmentedToggle;
