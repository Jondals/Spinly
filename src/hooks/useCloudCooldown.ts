/**
 * useCloudCooldown: serialises cloud writes and adds a short cooldown after each one.
 */
import { useEffect, useState } from 'react';
import type { ServiceResult } from '../scripts/supabaseClient';

const COOLDOWN_MS = 4000;

/**
 * One cloud write at a time and a short cooldown after each attempt: it prevents double clicks and
 * duplicated rows. Shared by share, edit and delete.
 */
export function useCloudCooldown() {
    const [busyId, setBusyId] = useState<string | null>(null);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [, setTick] = useState(0);

    // Re-render when the cooldown ends so the buttons are enabled again.
    useEffect(() => {
        if (cooldownUntil <= 0) return undefined;
        const timer = window.setTimeout(() => setTick((n) => n + 1), Math.max(0, cooldownUntil - Date.now()) + 30);
        return () => window.clearTimeout(timer);
    }, [cooldownUntil]);

    const blocked = busyId !== null || Date.now() < cooldownUntil;

    /** Runs the write if no other one is in progress; null if it was ignored because of the cooldown. */
    const run = async <T,>(id: string, action: () => Promise<ServiceResult<T>>): Promise<ServiceResult<T> | null> => {
        if (blocked) return null;
        setBusyId(id);
        try {
            return await action();
        } finally {
            setBusyId(null);
            setCooldownUntil(Date.now() + COOLDOWN_MS);
        }
    };

    return { blocked, run };
}
