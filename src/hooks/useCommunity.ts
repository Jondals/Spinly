import { useCallback, useEffect, useState } from 'react';
import type { ServiceResult } from '../scripts/supabaseClient';
import type { LocalMessage } from '../scripts/strings';

/**
 * Lista de la comunidad con su estado de carga. Solo se pide con la vista visible
 * (así el SDK de Supabase no se descarga sin necesidad): cada entrada recarga, igual
 * que `refresh()` tras una escritura.
 */
export function useCommunity<T>(fetchItems: () => Promise<ServiceResult<T[]>>, enabled: boolean) {
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<LocalMessage | null>(null);
    const [refreshToken, setRefreshToken] = useState(0);

    useEffect(() => {
        if (!enabled) return undefined;
        let alive = true;
        setLoading(true);
        setError(null);
        void fetchItems().then((result) => {
            if (!alive) return;
            setLoading(false);
            setItems(result.ok ? result.data : []);
            setError(result.ok ? null : result.error);
        });
        return () => {
            alive = false;
        };
    }, [fetchItems, enabled, refreshToken]);

    const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

    /** Quita un elemento al instante; la siguiente recarga confirma con el servidor. */
    const removeLocally = useCallback((keep: (item: T) => boolean) => {
        setItems((prev) => prev.filter(keep));
    }, []);

    return { items, loading, error, refresh, removeLocally };
}
