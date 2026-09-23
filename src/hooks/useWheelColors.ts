import { useEffect } from 'react';
import type { WheelTheme } from '../types/theme-types';

/**
 * Colores de flecha y luces del tema activo como variables CSS en <html>: así también los
 * heredan los diálogos en portal (editor de imagen). Sin color propio se quitan y
 * mandan los valores por defecto (index.css).
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
