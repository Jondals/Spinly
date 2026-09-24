import { useEffect, type RefObject } from 'react';

/**
 * Mientras `active`, las luces de la ruleta siguen a la música (music-visuals.ts, que se descarga la
 * primera vez que hace falta). Al desactivarse vuelven a su animación de siempre.
 */
export function useMusicPulse(ref: RefObject<HTMLElement | null>, active: boolean) {
    useEffect(() => {
        const element = ref.current;
        if (!active || !element) return undefined;
        let stop: (() => void) | null = null;
        let alive = true;
        void import('../scripts/music-visuals').then(({ startWheelLights }) => {
            if (alive) stop = startWheelLights(element);
        });
        return () => {
            alive = false;
            stop?.();
        };
    }, [ref, active]);
}
