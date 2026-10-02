/**
 * useEyeDropper: picks colors from the screen, choosing the best method the browser supports.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseScreenColor, rgbToHex } from '../scripts/color';
import { supportsScreenCapture } from '../scripts/screen-capture';

// EyeDropper API (desktop Chromium): not in TypeScript 4.9's lib.dom yet.
interface EyeDropperResult {
    sRGBHex: string;
}
interface EyeDropperInstance {
    open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>;
}
type EyeDropperConstructor = new () => EyeDropperInstance;

/** The native EyeDropper constructor, if the browser has one. */
const getEyeDropper = (): EyeDropperConstructor | undefined =>
    typeof window === 'undefined' ? undefined : (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;

/**
 * How the eyedropper picks colors in this browser, from best to worst:
 * - native: EyeDropper (desktop Chrome, Edge, Opera). Any point of the screen.
 * - screen: screen capture (desktop Firefox, Safari). The user picks a screen, window or tab and the
 *   color is taken from the frozen frame.
 * - image: an image or screenshot from the device (mobile, or a page without HTTPS).
 */
export type EyeDropperMode = 'native' | 'screen' | 'image';

/** Detects the best available mode. */
const detectMode = (): EyeDropperMode => {
    if (getEyeDropper()) return 'native';
    if (supportsScreenCapture()) return 'screen';
    return 'image';
};

/**
 * `pickNative` returns the color as hex, or null if the user cancels (Escape) or the browser prevents it.
 * The screen and image modes are handled by ColorPicker with ColorSampler.
 */
export function useEyeDropper() {
    const [mode] = useState(detectMode);
    const [picking, setPicking] = useState(false);
    const controllerRef = useRef<AbortController | null>(null);

    // If the picker closes while the eyedropper is open, it is cancelled instead of being left hanging.
    useEffect(() => () => controllerRef.current?.abort(), []);

    /** Opens the native eyedropper and resolves with the picked color (or null). */
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
