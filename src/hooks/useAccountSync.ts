/**
 * useAccountSync: keeps the signed-in account's data in sync with its private JSON file in Supabase Storage.
 */
import { useEffect, useRef } from 'react';
import type { AccountSession } from '../scripts/profile';
import {
    fetchAccountData,
    isSwitchingAccount,
    mergeGuestData,
    readLocalData,
    readSyncMarker,
    remountApp,
    saveAccountData,
    writeLocalData,
    writeSyncMarker,
    type AccountData,
    type AccountSnapshot,
} from '../scripts/account-data';

const SAVE_DELAY_MS = 1500;
// Data from another device is applied (App is remounted) only once per version, even if the local marker
// could not be saved (full storage), to avoid a loop.
const RELOAD_GUARD_KEY = 'spinly-sync-reloaded';

// Pending upload, at module level: signing out (ProfileMenu) flushes it before leaving.
let pendingSave: (() => Promise<boolean>) | null = null;

/** Uploads whatever is pending right now. false if it failed: signing out would then lose those changes. */
export async function flushAccountSync(): Promise<boolean> {
    const save = pendingSave;
    pendingSave = null;
    if (!save) return true;
    const saved = await save();
    // If it failed, it stays pending for the next attempt.
    if (!saved && !pendingSave) pendingSave = save;
    return saved;
}

/** Same account data, ignoring version and date (sanitizing fixes the key order).
    An account without saved music counts as an empty playlist. */
const sameSnapshot = (remote: AccountData, local: AccountSnapshot): boolean => {
    const { version, updatedAt, ...data } = remote;
    /** Comparable JSON of a snapshot (missing music = empty playlist). */
    const normalize = (snapshot: AccountSnapshot) => JSON.stringify({ ...snapshot, music: snapshot.music ?? { playlist: [] } });
    return normalize(data) === normalize(local);
};

/** Remounts App to apply cloud data, at most once per version (guarded in sessionStorage). */
const applyOnce = (version: number) => {
    try {
        if (sessionStorage.getItem(RELOAD_GUARD_KEY) === String(version)) return;
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(version));
    } catch {
        // Without sessionStorage there is no protection against a loop: better not to apply them.
        return;
    }
    remountApp();
};

/**
 * Keeps the account up to date in the cloud. Password accounts only: anonymous ones cannot write to
 * user-data (bucket policy) nor sign in from another device.
 * - When the session starts it compares with the cloud: if there is something newer there (made on
 *   another device) it applies it by remounting App, without reloading the page; if the account had no
 *   data yet, it uploads the local data.
 * - After that, every change is uploaded after a short delay, and immediately when the tab is hidden.
 */
export function useAccountSync(session: AccountSession | null, snapshot: AccountSnapshot) {
    const uid = session && !session.isAnonymous ? session.userId : null;
    const readyRef = useRef<string | null>(null);
    const snapshotRef = useRef(snapshot);
    snapshotRef.current = snapshot;

    useEffect(() => {
        readyRef.current = null;
        if (!uid || isSwitchingAccount()) return undefined;
        let alive = true;
        void (async () => {
            const remote = await fetchAccountData(uid);
            if (!alive || !remote.ok || isSwitchingAccount()) return;
            const marker = readSyncMarker();
            const synced = marker?.uid === uid;
            // The cloud has exactly what this browser has (e.g. the last upload finished after the tab was
            // closed and was never recorded): only the marker is updated, nothing is applied.
            if (synced && remote.data && sameSnapshot(remote.data, readLocalData())) {
                writeSyncMarker(uid, remote.data.updatedAt);
                if (alive) readyRef.current = uid;
                return;
            }
            if (!remote.data) {
                const saved = await saveAccountData(uid, readLocalData());
                if (alive && saved.ok) writeSyncMarker(uid, saved.data);
            } else if (!synced || remote.data.updatedAt > marker.updatedAt) {
                // Another device saved later (or this browser never synced this account): the cloud wins,
                // keeping whatever this browser has that the cloud does not.
                const merged = synced ? remote.data : mergeGuestData(remote.data, readLocalData());
                writeLocalData(merged);
                const saved = synced ? { ok: true as const, data: remote.data.updatedAt } : await saveAccountData(uid, merged);
                if (saved.ok) writeSyncMarker(uid, saved.data);
                applyOnce(remote.data.updatedAt);
                return;
            }
            if (alive) readyRef.current = uid;
        })();
        return () => {
            alive = false;
        };
    }, [uid]);

    const { options, activeTheme, activePresetId, wheelLimit, themes, presets, music } = snapshot;
    useEffect(() => {
        if (!uid || readyRef.current !== uid || isSwitchingAccount()) return undefined;
        /** Uploads the latest snapshot. */
        const save = async () => {
            // The marker is written before uploading: if the tab closes mid-upload, coming back does not look
            // like the cloud has something newer to apply. If the upload fails, it is restored.
            const previous = readSyncMarker();
            const updatedAt = Date.now();
            writeSyncMarker(uid, updatedAt);
            const saved = await saveAccountData(uid, snapshotRef.current, updatedAt);
            if (!saved.ok && previous) writeSyncMarker(previous.uid, previous.updatedAt);
            return saved.ok;
        };
        pendingSave = save;
        const timer = window.setTimeout(() => { void flushAccountSync(); }, SAVE_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [uid, options, activeTheme, activePresetId, wheelLimit, themes, presets, music]);

    // When the tab is hidden (switching apps, closing) the delay is skipped.
    useEffect(() => {
        /** Uploads pending changes as soon as the tab is hidden. */
        const onHide = () => {
            if (document.visibilityState === 'hidden') void flushAccountSync();
        };
        document.addEventListener('visibilitychange', onHide);
        return () => document.removeEventListener('visibilitychange', onHide);
    }, []);
}
