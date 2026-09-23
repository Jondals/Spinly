import { useEffect, useRef, type RefObject } from 'react';

/**
 * Cierra un elemento flotante con Escape o con un toque fuera de `insideRefs`.
 * Sin refs solo escucha Escape (el toque fuera lo gestiona un backdrop propio).
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
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onDismissRef.current();
        };
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
