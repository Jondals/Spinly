/**
 * Modal: an accessible dialog rendered in a portal, with focus trapping and Escape to close.
 */
import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
    labelledBy: string;
    onClose: () => void;
    backdropClassName: string;
    className: string;
    /** Element focused when it opens; by default, the first focusable one. */
    initialFocus?: RefObject<HTMLElement | null>;
    /** Content outside the card, over the backdrop (e.g. a close button in the corner). */
    outside?: ReactNode;
    children: ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog in a portal to <body>: position fixed, so it never shifts the layout. It closes with
 * Escape or a click on the backdrop, traps the focus and gives it back when it closes.
 * stopPropagation keeps global shortcuts (spin with Space, close the drawer) from reacting to keys
 * pressed inside.
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

    /** Escape closes; Tab and Shift+Tab cycle inside the dialog. */
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

    /** A click on the backdrop itself (not on the card) closes the dialog. */
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
