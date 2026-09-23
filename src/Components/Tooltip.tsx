import React, { useEffect, useId, useRef, useState } from 'react';

interface TooltipProps {
    content: React.ReactNode;
    children: React.ReactNode;
    ariaLabel: string;
    className?: string;
}

// Mantener pulsado (táctil) para abrir, igual que el gesto nativo de "tooltip" en móvil
const LONG_PRESS_MS = 400;

// Tooltip ligero y reutilizable (sin librerías):
// - Ratón: aparece al pasar por encima (CSS, solo en dispositivos con hover real).
// - Teclado: foco + Enter/Espacio lo fija; Escape lo cierra.
// - Táctil: toque o mantener pulsado lo abre; tocar fuera lo cierra.
// La burbuja es position:absolute → nunca desplaza el layout.
function Tooltip({ content, children, ariaLabel, className = '' }: TooltipProps) {
    const [open, setOpen] = useState(false);
    const bubbleId = useId();
    const rootRef = useRef<HTMLSpanElement>(null);
    const pressTimer = useRef<number | null>(null);
    const openedByPress = useRef(false);

    // Abierto: se cierra al tocar/clicar fuera o con Escape (mismo patrón que el resto de menús)
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (rootRef.current?.contains(event.target as Node)) return;
            setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

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
        // El click que sigue a una pulsación larga no debe volver a cerrarlo
        if (openedByPress.current) {
            openedByPress.current = false;
            return;
        }
        setOpen((prev) => !prev);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            // Evita que la barra espaciadora gire la ruleta (listener global en Wheel)
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
