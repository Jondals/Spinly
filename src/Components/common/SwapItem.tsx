/**
 * SwapItem: a list item that swaps between a card and its edit form with a smooth height animation.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';

interface SwapItemProps {
    /** true while the card is replaced by its edit form. */
    swapped: boolean;
    className: string;
    children: ReactNode;
}

// Must match the .spinly-swap-fade animation (shared.css).
const SWAP_MS = 300;

/** Whether the user asked for reduced motion. */
const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * List item that switches between card and form without jumps: it animates its height from the old
 * content to the new one and the new content fades in. The height is tracked with a ResizeObserver so
 * the animation always starts from the real size, even if it changed earlier.
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

        /** Removes the inline animation styles. */
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
        // If it changes again mid-animation, nothing is measured here: the DOM is already the new one and
        // the next change must start from the height being shown (the target height).
        return () => {
            window.clearTimeout(timer);
            clearStyles();
        };
    }, [swapped]);

    return <li ref={ref} className={className}>{children}</li>;
}

export default SwapItem;
