import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { isSoundEnabled, playTick, setSoundEnabled, subscribeSound } from '../scripts/sound';

const MIN_TICK_GAP_MS = 28;

/** Preferencia de sonido (activado por defecto), compartida por la ruleta y los botones. */
export function useSoundPreference() {
    const enabled = useSyncExternalStore(subscribeSound, isSoundEnabled, () => true);
    return { enabled, toggle: () => setSoundEnabled(!enabled) };
}

/** Ángulo real del disco a mitad de la transición CSS, leído de su matriz de transformación. */
function currentAngle(element: HTMLElement): number {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
}

/**
 * Un "tic" cada vez que una separación entre sectores pasa bajo la flecha. Se sigue el
 * giro real frame a frame, así el ritmo acompaña la desaceleración de la animación.
 */
export function useSpinTicks(discRef: RefObject<HTMLElement | null>, spinning: boolean, sectorCount: number, enabled: boolean) {
    useEffect(() => {
        const disc = discRef.current;
        if (!spinning || !enabled || !disc || sectorCount < 2 || typeof DOMMatrixReadOnly === 'undefined') return undefined;
        const sectorAngle = 360 / sectorCount;
        let previous = currentAngle(disc);
        let travelled = 0;
        let lastTick = 0;
        let frame = 0;

        const step = (time: number) => {
            const angle = currentAngle(disc);
            let delta = angle - previous;
            if (delta < -180) delta += 360;
            if (delta > 180) delta -= 360;
            previous = angle;
            const before = Math.floor(travelled / sectorAngle);
            travelled += Math.abs(delta);
            if (Math.floor(travelled / sectorAngle) !== before && time - lastTick > MIN_TICK_GAP_MS) {
                lastTick = time;
                playTick();
            }
            frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [discRef, spinning, sectorCount, enabled]);
}
