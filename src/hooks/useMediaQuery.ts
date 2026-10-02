/**
 * useMediaQuery: subscribes a component to a CSS media query.
 */
import { useCallback, useSyncExternalStore } from 'react';

/** Whether the media query matches, kept up to date with changes (rotating a phone, resizing). */
export function useMediaQuery(query: string): boolean {
    /** Listens to changes of the media query. */
    const subscribe = useCallback((onChange: () => void) => {
        const list = typeof window !== 'undefined' ? window.matchMedia?.(query) : undefined;
        list?.addEventListener?.('change', onChange);
        return () => list?.removeEventListener?.('change', onChange);
    }, [query]);
    /** Whether the media query matches right now. */
    const read = () => (typeof window !== 'undefined' ? window.matchMedia?.(query).matches === true : false);
    return useSyncExternalStore(subscribe, read, () => false);
}
