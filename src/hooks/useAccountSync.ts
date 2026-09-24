import { useEffect, useRef } from 'react';
import type { AccountSession } from '../scripts/profile';
import {
    fetchAccountData,
    isSwitchingAccount,
    mergeGuestData,
    readLocalData,
    readSyncMarker,
    reloadApp,
    saveAccountData,
    writeLocalData,
    writeSyncMarker,
    type AccountSnapshot,
} from '../scripts/account-data';

const SAVE_DELAY_MS = 1500;
// Recarga por datos de otro dispositivo: una sola vez por versión, aunque la marca local no se
// pudiera guardar (storage lleno), para no entrar en un bucle de recargas.
const RELOAD_GUARD_KEY = 'spinly-sync-reloaded';

// Subida pendiente, a nivel de módulo: el cierre de sesión (ProfileMenu) la vacía antes de salir.
let pendingSave: (() => Promise<boolean>) | null = null;

/** Sube ya lo que falte. false si no se pudo: cerrar sesión entonces perdería esos cambios. */
export async function flushAccountSync(): Promise<boolean> {
    const save = pendingSave;
    pendingSave = null;
    if (!save) return true;
    const saved = await save();
    // Si falló, se queda pendiente para el siguiente intento.
    if (!saved && !pendingSave) pendingSave = save;
    return saved;
}

const reloadOnce = (version: number) => {
    try {
        if (sessionStorage.getItem(RELOAD_GUARD_KEY) === String(version)) return;
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(version));
    } catch {
        // Sin sessionStorage no hay forma de protegerse del bucle: mejor no recargar.
        return;
    }
    reloadApp();
};

/**
 * Mantiene la cuenta al día en la nube. Solo cuentas con contraseña: las anónimas no pueden
 * escribir en user-data (política del bucket) ni entrar desde otro dispositivo.
 * - Al empezar la sesión compara con la nube: si allí hay algo más reciente (hecho en otro
 *   dispositivo) lo aplica y recarga; si la cuenta aún no tenía datos, sube los locales.
 * - Después, cada cambio se sube con un pequeño retardo, y al ocultarse la pestaña al momento.
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
            if (!remote.data) {
                const saved = await saveAccountData(uid, readLocalData());
                if (alive && saved.ok) writeSyncMarker(uid, saved.data);
            } else if (!synced || remote.data.updatedAt > marker.updatedAt) {
                // Otro dispositivo guardó después (o este navegador nunca sincronizó esta cuenta):
                // manda la nube, conservando lo que este navegador tenga y la nube no.
                const merged = synced ? remote.data : mergeGuestData(remote.data, readLocalData());
                writeLocalData(merged);
                const saved = synced ? { ok: true as const, data: remote.data.updatedAt } : await saveAccountData(uid, merged);
                if (saved.ok) writeSyncMarker(uid, saved.data);
                reloadOnce(remote.data.updatedAt);
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
        const save = async () => {
            const saved = await saveAccountData(uid, snapshotRef.current);
            if (saved.ok) writeSyncMarker(uid, saved.data);
            return saved.ok;
        };
        pendingSave = save;
        const timer = window.setTimeout(() => { void flushAccountSync(); }, SAVE_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [uid, options, activeTheme, activePresetId, wheelLimit, themes, presets, music]);

    // Al ocultar la pestaña (cambiar de app, cerrar) no se espera al retardo.
    useEffect(() => {
        const onHide = () => {
            if (document.visibilityState === 'hidden') void flushAccountSync();
        };
        document.addEventListener('visibilitychange', onHide);
        return () => document.removeEventListener('visibilitychange', onHide);
    }, []);
}
