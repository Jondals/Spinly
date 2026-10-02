/**
 * useMusicPulse: makes a wheel's lights follow the music that is playing.
 */
import { useEffect, type RefObject } from 'react';

/**
 * While `active`, the wheel lights follow the music (music-visuals.ts, downloaded the first time it is
 * needed). When it turns off they go back to their usual animation.
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
