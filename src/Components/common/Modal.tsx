import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
    labelledBy: string;
    onClose: () => void;
    backdropClassName: string;
    className: string;
    /** Elemento que recibe el foco al abrir; por defecto, el primero enfocable. */
    initialFocus?: RefObject<HTMLElement | null>;
    /** Contenido fuera de la tarjeta, sobre el fondo (p. ej. un botón de cierre en la esquina). */
    outside?: ReactNode;
    children: ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal en un portal a <body>: position fixed, así que nunca desplaza el layout.
 * Cierra con Escape o tocando el fondo, atrapa el foco y lo devuelve al cerrarse.
 * stopPropagation impide que los atajos globales (girar con Espacio, cerrar el drawer)
 * reaccionen a las teclas pulsadas dentro.
 */
function Modal({ labelledBy, onClose, backdropClassName, className, initialFocus, outside, children }: ModalProps) {
    const backdropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const target = initialFocus?.current ?? backdropRef.current?.querySelector<HTMLElement>(FOCUSABLE);
        target?.focus({ preventScroll: true });
        return () => {
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        };
    }, [initialFocus]);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
        }
        if (event.key !== 'Tab' || !backdropRef.current) return;
        const focusables = Array.from(backdropRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
    };

    return createPortal(
        <div ref={backdropRef} className={backdropClassName} onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
            {outside}
            <div className={className} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
                {children}
            </div>
        </div>,
        document.body,
    );
}

export default Modal;
