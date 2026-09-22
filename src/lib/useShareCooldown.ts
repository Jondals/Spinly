import { useEffect, useState } from 'react';

const SHARE_COOLDOWN_MS = 4000;

// Anti-spam de "Compartir": no admite una nueva petición mientras hay una en curso
// y aplica un cooldown corto tras cada intento (evita dobles clics y duplicados).
export function useShareCooldown() {
    const [busyId, setBusyId] = useState<string | null>(null);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [, setTick] = useState(0);

    // Cuando vence el cooldown, fuerza un re-render para volver a habilitar los botones
    useEffect(() => {
        if (cooldownUntil <= 0) return;
        const remaining = Math.max(0, cooldownUntil - Date.now());
        const timer = window.setTimeout(() => setTick((n) => n + 1), remaining + 30);
        return () => window.clearTimeout(timer);
    }, [cooldownUntil]);

    const blocked = busyId !== null || Date.now() < cooldownUntil;

    return {
        blocked,
        begin(id: string): boolean {
            if (busyId !== null || Date.now() < cooldownUntil) return false;
            setBusyId(id);
            return true;
        },
        finish(): void {
            setBusyId(null);
            setCooldownUntil(Date.now() + SHARE_COOLDOWN_MS);
        },
    };
}