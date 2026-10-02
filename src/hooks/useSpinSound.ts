/**
 * Sound hooks for the wheels: the sound preference and the ticks while a wheel spins.
 */
import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { getSoundVolume, isSoundEnabled, playTick, setSoundEnabled, setSoundVolume, subscribeSound } from '../scripts/sound';

const MIN_TICK_GAP_MS = 28;

/** Sound preference (on by default), shared by the wheel and the buttons. */
export function useSoundPreference() {
    const enabled = useSyncExternalStore(subscribeSound, isSoundEnabled, () => true);
    const volume = useSyncExternalStore(subscribeSound, getSoundVolume, () => 1);
    return {
        enabled,
        volume,
        toggle: () => setSoundEnabled(!enabled),
        /** Desktop slider: at 0 it mutes the sounds (keeping the previous volume), above 0 it turns them on. */
        setVolume: (next: number) => {
            if (next <= 0) {
                setSoundEnabled(false);
                return;
            }
            setSoundVolume(next);
            setSoundEnabled(true);
        },
    };
}

/** The disc's real angle in the middle of the CSS transition, read from its transform matrix. */
function currentAngle(element: HTMLElement): number {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
}

/**
 * A "tick" every time a border between sectors passes under the pointer. The real rotation is followed
 * frame by frame, so the rhythm follows the animation as it slows down.
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

        /** Animation frame: plays a tick every time the disc crosses a sector border. */
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
