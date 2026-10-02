/**
 * SegmentedToggle: a row of buttons with a sliding indicator, used as tabs or as a single choice.
 */
import type { CSSProperties, ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
    id: T;
    label: ReactNode;
}

interface SegmentedToggleProps<T extends string> {
    options: SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    ariaLabel: string;
    /** tabs: switches between views (Mine / Community). choice: picks a value (language). */
    kind?: 'tabs' | 'choice';
    className?: string;
}

/** Renders the toggle; the active indicator slides with a transform (.spinly-segmented in shared.css). */
function SegmentedToggle<T extends string>({ options, value, onChange, ariaLabel, kind = 'tabs', className = '' }: SegmentedToggleProps<T>) {
    const activeIndex = Math.max(0, options.findIndex((option) => option.id === value));
    const style = {
        '--spinly-seg-count': options.length,
        '--spinly-seg-index': activeIndex,
    } as CSSProperties;
    const isTabs = kind === 'tabs';

    return (
        <div
            className={`spinly-segmented ${className}`.trim()}
            role={isTabs ? 'tablist' : 'radiogroup'}
            aria-label={ariaLabel}
            style={style}
        >
            <span className="spinly-segmented-indicator" aria-hidden="true" />
            {options.map((option) => {
                const isActive = option.id === value;
                return (
                    <button
                        key={option.id}
                        type="button"
                        role={isTabs ? 'tab' : 'radio'}
                        aria-selected={isTabs ? isActive : undefined}
                        aria-checked={isTabs ? undefined : isActive}
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
