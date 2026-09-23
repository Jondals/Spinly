import { useEffect, useState } from 'react';

export type ColorScheme = 'dark' | 'light';

const SCHEME_KEY = 'spinly-theme';

function readStoredScheme(): ColorScheme {
    try {
        return localStorage.getItem(SCHEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
}

/** Modo claro/oscuro de la interfaz (no confundir con los temas visuales de la ruleta). */
export function useColorScheme() {
    const [scheme, setScheme] = useState<ColorScheme>(readStoredScheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', scheme);
        try {
            localStorage.setItem(SCHEME_KEY, scheme);
        } catch {
            // Sin acceso a storage: el modo se mantiene en memoria.
        }
    }, [scheme]);

    return { scheme, toggle: () => setScheme((prev) => (prev === 'dark' ? 'light' : 'dark')) };
}
