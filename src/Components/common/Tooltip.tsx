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
 * Ratón: hover (solo en dispositivos con hover real). Teclado: Enter/Espacio lo fija y
 * Escape lo cierra. Táctil: toque o pulsación larga lo abre y tocar fuera lo cierra.
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

    const clearPress = () => {
        if (pressTimer.current !== null) {
            window.clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };

    const handlePointerDown = (event: React.PointerEvent) => {
        if (event.pointerType === 'mouse') return;
        clearPress();
        pressTimer.current = window.setTimeout(() => {
            openedByPress.current = true;
            setOpen(true);
        }, LONG_PRESS_MS);
    };

    const handleClick = () => {
        // El click que sigue a una pulsación larga no debe volver a cerrarlo.
        if (openedByPress.current) {
            openedByPress.current = false;
            return;
        }
        setOpen((prev) => !prev);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            // Evita que Espacio llegue al listener global de la ruleta.
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
