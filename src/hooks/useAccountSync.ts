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
// Datos de otro dispositivo: se aplican (App se vuelve a montar) una sola vez por versión, aunque
// la marca local no se pudiera guardar (storage lleno), para no entrar en un bucle.
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

/** Mismos datos de cuenta, sin contar la versión ni la fecha (el saneado fija el orden de claves).
    Una cuenta sin música guardada equivale a una playlist vacía. */
const sameSnapshot = (remote: AccountData, local: AccountSnapshot): boolean => {
    const { version, updatedAt, ...data } = remote;
    const normalize = (snapshot: AccountSnapshot) => JSON.stringify({ ...snapshot, music: snapshot.music ?? { playlist: [] } });
    return normalize(data) === normalize(local);
};

const applyOnce = (version: number) => {
    try {
        if (sessionStorage.getItem(RELOAD_GUARD_KEY) === String(version)) return;
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(version));
    } catch {
        // Sin sessionStorage no hay forma de protegerse del bucle: mejor no aplicarlos.
        return;
    }
    remountApp();
};

/**
 * Mantiene la cuenta al día en la nube. Solo cuentas con contraseña: las anónimas no pueden
 * escribir en user-data (política del bucket) ni entrar desde otro dispositivo.
 * - Al empezar la sesión compara con la nube: si allí hay algo más reciente (hecho en otro
 *   dispositivo) lo aplica volviendo a montar App, sin recargar la página; si la cuenta aún no
 *   tenía datos, sube los locales.
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
            // La nube tiene exactamente lo mismo que este navegador (p. ej. la última subida acabó con la
            // pestaña ya cerrada y no llegó a anotarse): solo se pone al día la marca, sin aplicar nada.
            if (synced && remote.data && sameSnapshot(remote.data, readLocalData())) {
                writeSyncMarker(uid, remote.data.updatedAt);
                if (alive) readyRef.current = uid;
                return;
            }
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
        const save = async () => {
            // La marca se anota antes de subir: si la pestaña se cierra con la subida en marcha, al
            // volver no parece que la nube tenga algo más nuevo que aplicar. Si falla, se restaura.
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

    // Al ocultar la pestaña (cambiar de app, cerrar) no se espera al retardo.
    useEffect(() => {
        const onHide = () => {
            if (document.visibilityState === 'hidden') void flushAccountSync();
        };
        document.addEventListener('visibilitychange', onHide);
        return () => document.removeEventListener('visibilitychange', onHide);
    }, []);
}
