import { useLayoutEffect, useRef, type ReactNode } from 'react';

interface SwapItemProps {
    /** true mientras la tarjeta está sustituida por su formulario de edición. */
    swapped: boolean;
    className: string;
    children: ReactNode;
}

// Debe coincidir con la animación de .spinly-swap-fade (shared.css).
const SWAP_MS = 300;

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Elemento de lista que cambia entre tarjeta y formulario sin saltos: anima su alto desde
 * el contenido anterior al nuevo y el contenido nuevo entra con un fundido. El alto se
 * sigue con ResizeObserver para partir siempre del tamaño real, aunque haya cambiado antes.
 */
function SwapItem({ swapped, className, children }: SwapItemProps) {
    const ref = useRef<HTMLLIElement>(null);
    const lastHeight = useRef(0);
    const animating = useRef(false);
    const mounted = useRef(false);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        lastHeight.current = el.offsetHeight;
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => {
            if (!animating.current) lastHeight.current = el.offsetHeight;
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        if (!mounted.current) {
            mounted.current = true;
            return undefined;
        }
        const from = lastHeight.current;
        const to = el.offsetHeight;
        lastHeight.current = to;
        if (prefersReducedMotion() || !from || from === to) return undefined;

        animating.current = true;
        el.classList.add('spinly-swap-fade');
        el.style.height = `${from}px`;
        el.style.overflow = 'hidden';
        void el.offsetHeight;
        el.style.transition = `height ${SWAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        el.style.height = `${to}px`;

        const clearStyles = () => {
            animating.current = false;
            el.classList.remove('spinly-swap-fade');
            el.style.removeProperty('height');
            el.style.removeProperty('overflow');
            el.style.removeProperty('transition');
        };
        const timer = window.setTimeout(() => {
            clearStyles();
            lastHeight.current = el.offsetHeight;
        }, SWAP_MS + 50);
        // Si vuelve a cambiar a mitad de animación, no se mide aquí: el DOM ya es el nuevo y
        // el siguiente cambio debe partir del alto que se estaba mostrando (el de destino).
        return () => {
            window.clearTimeout(timer);
            clearStyles();
        };
    }, [swapped]);

    return <li ref={ref} className={className}>{children}</li>;
}

export default SwapItem;
