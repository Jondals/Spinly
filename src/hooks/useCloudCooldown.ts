import { useEffect, useState } from 'react';
import type { ServiceResult } from '../scripts/supabaseClient';

const COOLDOWN_MS = 4000;

/**
 * Una escritura en la nube a la vez y un cooldown corto tras cada intento:
 * evita dobles clics y filas duplicadas. Compartido por compartir, editar y borrar.
 */
export function useCloudCooldown() {
    const [busyId, setBusyId] = useState<string | null>(null);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [, setTick] = useState(0);

    // Re-render al vencer el cooldown para rehabilitar los botones.
    useEffect(() => {
        if (cooldownUntil <= 0) return undefined;
        const timer = window.setTimeout(() => setTick((n) => n + 1), Math.max(0, cooldownUntil - Date.now()) + 30);
        return () => window.clearTimeout(timer);
    }, [cooldownUntil]);

    const blocked = busyId !== null || Date.now() < cooldownUntil;

    /** Ejecuta la escritura si no hay otra en curso; null si se ha ignorado por el cooldown. */
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
