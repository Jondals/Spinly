import { useCallback, useSyncExternalStore } from 'react';

/** Si la media query se cumple, al día con los cambios (girar el móvil, redimensionar). */
export function useMediaQuery(query: string): boolean {
    const subscribe = useCallback((onChange: () => void) => {
        const list = typeof window !== 'undefined' ? window.matchMedia?.(query) : undefined;
        list?.addEventListener?.('change', onChange);
        return () => list?.removeEventListener?.('change', onChange);
    }, [query]);
    const read = () => (typeof window !== 'undefined' ? window.matchMedia?.(query).matches === true : false);
    return useSyncExternalStore(subscribe, read, () => false);
}
