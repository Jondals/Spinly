/**
 * useDismiss: closes floating UI (menus, popovers) with Escape or a click outside.
 */
import { useEffect, useRef, type RefObject } from 'react';

/**
 * Closes a floating element with Escape or with a pointer down outside `insideRefs`.
 * Without refs it only listens to Escape (clicks outside are handled by the element's own backdrop).
 */
export function useDismiss(active: boolean, onDismiss: () => void, insideRefs: ReadonlyArray<RefObject<Element | null>> = []) {
    const onDismissRef = useRef(onDismiss);
    const refsRef = useRef(insideRefs);
    useEffect(() => {
        onDismissRef.current = onDismiss;
        refsRef.current = insideRefs;
    });

    useEffect(() => {
        if (!active) return undefined;
        /** Escape dismisses. */
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onDismissRef.current();
        };
        /** A pointer down outside every inside ref dismisses. */
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (refsRef.current.some((ref) => ref.current?.contains(target))) return;
            onDismissRef.current();
        };
        const listensOutside = refsRef.current.length > 0;
        document.addEventListener('keydown', onKeyDown);
        if (listensOutside) document.addEventListener('pointerdown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            if (listensOutside) document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [active]);
}
