/**
 * Hooks that expose the current Supabase session to components.
 */
import { useEffect, useState } from 'react';
import { getCurrentSession, onAuthChange, type AccountSession } from '../scripts/profile';

/** Current session (user id and whether it is still anonymous), kept up to date with sign-ins, sign-outs and password changes. */
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

/** Current user id. It only decides which actions are shown; real authorization is enforced by RLS. */
export function useSessionUserId(): string | null {
    return useAccountSession()?.userId ?? null;
}
