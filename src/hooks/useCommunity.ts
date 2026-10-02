/**
 * useCommunity: loads a community list (shared themes or presets) with its loading and error state.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ServiceResult } from '../scripts/supabaseClient';
import type { LocalMessage } from '../scripts/strings';

/**
 * Community list with its loading state. It is only fetched while the view is visible (so the
 * Supabase SDK is not downloaded needlessly): every visit reloads it, as does `refresh()` after a write.
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

    /** Fetches the list again. */
    const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

    /** Removes an item right away; the next reload confirms it with the server. */
    const removeLocally = useCallback((keep: (item: T) => boolean) => {
        setItems((prev) => prev.filter(keep));
    }, []);

    return { items, loading, error, refresh, removeLocally };
}
