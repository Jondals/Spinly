/**
 * useWheelColors: publishes the active theme's pointer and light colors as CSS variables.
 */
import { useEffect } from 'react';
import type { WheelTheme } from '../types/theme-types';

/**
 * Pointer and light colors of the active theme as CSS variables on <html>, so dialogs rendered in a
 * portal (the image editor) inherit them too. Without a color of its own they are removed and the
 * defaults (index.css) apply.
 */
export function useWheelColors(theme: WheelTheme | null | undefined) {
    const pointer = theme?.pointerColor;
    const lights = theme?.lightColor;

    useEffect(() => {
        const root = document.documentElement.style;
        const vars: Record<string, string | undefined> = {
            '--wheel-pointer-color': pointer,
            '--wheel-light-color': lights,
        };
        for (const [name, value] of Object.entries(vars)) {
            if (value) root.setProperty(name, value);
            else root.removeProperty(name);
        }
    }, [pointer, lights]);
}
