import { useEffect, useState } from 'react';
import { ensureSession, onAuthChange } from '../scripts/profile';

// Solo decide qué acciones se muestran; la autorización real la aplica RLS.
export function useSessionUserId(): string | null {
    const [userId, setUserId] = useState<string | null>(null);
    useEffect(() => {
        let alive = true;
        void ensureSession().then((id) => { if (alive) setUserId(id); });
        const unsubscribe = onAuthChange((id) => { if (alive) setUserId(id); });
        return () => {
            alive = false;
            unsubscribe();
        };
    }, []);
    return userId;
}
