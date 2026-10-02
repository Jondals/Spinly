/**
 * Tooltip: an accessible tooltip that works with mouse, keyboard and touch.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';

interface TooltipProps {
    content: React.ReactNode;
    children: React.ReactNode;
    ariaLabel: string;
    className?: string;
}

const LONG_PRESS_MS = 400;

/**
 * Mouse: hover (only on devices with real hover). Keyboard: Enter/Space pins it and Escape closes it.
 * Touch: a tap or a long press opens it and tapping outside closes it.
 */
function Tooltip({ content, children, ariaLabel, className = '' }: TooltipProps) {
    const [open, setOpen] = useState(false);
    const bubbleId = useId();
    const rootRef = useRef<HTMLSpanElement>(null);
    const pressTimer = useRef<number | null>(null);
    const openedByPress = useRef(false);

    useDismiss(open, () => setOpen(false), [rootRef]);

    useEffect(() => () => {
        if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    }, []);

    /** Cancels a pending long press. */
    const clearPress = () => {
        if (pressTimer.current !== null) {
            window.clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };

    /** Touch and pen: a long press opens the tooltip. */
    const handlePointerDown = (event: React.PointerEvent) => {
        if (event.pointerType === 'mouse') return;
        clearPress();
        pressTimer.current = window.setTimeout(() => {
            openedByPress.current = true;
            setOpen(true);
        }, LONG_PRESS_MS);
    };

    /** A click (or tap) toggles the tooltip. */
    const handleClick = () => {
        // The click that follows a long press must not close it again.
        if (openedByPress.current) {
            openedByPress.current = false;
            return;
        }
        setOpen((prev) => !prev);
    };

    /** Enter or Space toggles the tooltip from the keyboard. */
    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            // Keeps Space from reaching the wheel's global listener.
            event.preventDefault();
            event.stopPropagation();
            setOpen((prev) => !prev);
        }
    };

    return (
        <span
            ref={rootRef}
            className={`spinly-tooltip${open ? ' spinly-tooltip--open' : ''}${className ? ` ${className}` : ''}`}
            role="button"
            tabIndex={0}
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-describedby={bubbleId}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onPointerCancel={clearPress}
            onContextMenu={(event) => { if (open || pressTimer.current !== null) event.preventDefault(); }}
        >
            {children}
            <span id={bubbleId} role="tooltip" className="spinly-tooltip-bubble">
                {content}
            </span>
        </span>
    );
}

export default Tooltip;
