import { useCallback, useEffect, useRef, useState } from 'react';
import { parseScreenColor, rgbToHex } from '../scripts/color';
import { supportsScreenCapture } from '../scripts/screen-capture';

// EyeDropper API (Chromium de escritorio): aún no está en lib.dom de TypeScript 4.9.
interface EyeDropperResult {
    sRGBHex: string;
}
interface EyeDropperInstance {
    open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>;
}
type EyeDropperConstructor = new () => EyeDropperInstance;

const getEyeDropper = (): EyeDropperConstructor | undefined =>
    typeof window === 'undefined' ? undefined : (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;

/**
 * Cómo toma colores la pipeta en este navegador, de mejor a peor:
 * - native: EyeDropper (Chrome, Edge, Opera de escritorio). Cualquier punto de la pantalla.
 * - screen: captura de pantalla (Firefox, Safari de escritorio). El usuario elige pantalla,
 *   ventana o pestaña y el color se toma sobre el fotograma congelado.
 * - image: una imagen o captura de pantalla del dispositivo (móvil, o página sin HTTPS).
 */
export type EyeDropperMode = 'native' | 'screen' | 'image';

const detectMode = (): EyeDropperMode => {
    if (getEyeDropper()) return 'native';
    if (supportsScreenCapture()) return 'screen';
    return 'image';
};

/**
 * `pickNative` devuelve el color en hex, o null si el usuario cancela (Escape) o el navegador
 * lo impide. Los modos screen e image los resuelve ColorPicker con ColorSampler.
 */
export function useEyeDropper() {
    const [mode] = useState(detectMode);
    const [picking, setPicking] = useState(false);
    const controllerRef = useRef<AbortController | null>(null);

    // Si el selector se cierra con la pipeta abierta, se cancela en lugar de quedar colgada.
    useEffect(() => () => controllerRef.current?.abort(), []);

    const pickNative = useCallback(async (): Promise<string | null> => {
        const EyeDropper = getEyeDropper();
        if (!EyeDropper || controllerRef.current) return null;
        const controller = new AbortController();
        controllerRef.current = controller;
        setPicking(true);
        try {
            const { sRGBHex } = await new EyeDropper().open({ signal: controller.signal });
            const rgb = parseScreenColor(sRGBHex);
            return rgb ? rgbToHex(rgb) : null;
        } catch {
            return null;
        } finally {
            controllerRef.current = null;
            if (!controller.signal.aborted) setPicking(false);
        }
    }, []);

    return { mode, picking, pickNative };
}
