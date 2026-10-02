/**
 * useColorScheme: the interface's light / dark mode, persisted in localStorage.
 */
import { useEffect, useState } from 'react';

export type ColorScheme = 'dark' | 'light';

const SCHEME_KEY = 'spinly-theme';

/** Reads the saved mode (dark by default or when storage is unavailable). */
function readStoredScheme(): ColorScheme {
    try {
        return localStorage.getItem(SCHEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
}

/** Light/dark mode of the interface (not to be confused with the wheel's visual themes). */
export function useColorScheme() {
    const [scheme, setScheme] = useState<ColorScheme>(readStoredScheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', scheme);
        try {
            localStorage.setItem(SCHEME_KEY, scheme);
        } catch {
            // No storage access: the mode is kept in memory.
        }
    }, [scheme]);

    return { scheme, toggle: () => setScheme((prev) => (prev === 'dark' ? 'light' : 'dark')) };
}
