import { useEffect, useState } from 'react';
import { ensureSession, onAuthChange } from './profile';

// uid de la sesión anónima actual (o null). Reactivo a login/cambios de sesión.
// Solo decide qué acciones MOSTRAR (p. ej. Editar/Borrar en tus filas de la comunidad);
// la autorización real la aplica RLS en Supabase.
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
