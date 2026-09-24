import { useEffect, useState } from 'react';
import { getCurrentSession, onAuthChange, type AccountSession } from '../scripts/profile';

/** Sesión actual (uid y si aún es anónima), al día con entradas, salidas y cambios de contraseña. */
export function useAccountSession(): AccountSession | null {
    const [session, setSession] = useState<AccountSession | null>(null);
    useEffect(() => {
        let alive = true;
        void getCurrentSession().then((current) => { if (alive) setSession(current); });
        const unsubscribe = onAuthChange((userId, isAnonymous) => {
            if (alive) setSession(userId ? { userId, isAnonymous } : null);
        });
        return () => {
            alive = false;
            unsubscribe();
        };
    }, []);
    return session;
}

// Solo decide qué acciones se muestran; la autorización real la aplica RLS.
export function useSessionUserId(): string | null {
    return useAccountSession()?.userId ?? null;
}
