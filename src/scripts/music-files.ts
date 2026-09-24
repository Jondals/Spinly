// Archivos de las canciones subidas. En el navegador, IndexedDB (localStorage no admite archivos
// de varios MB); en la cuenta, el bucket privado user-data: user-data/<uid>/music/<id>, con las
// mismas políticas que el JSON de la cuenta (solo la carpeta propia y solo con contraseña).
import { getSupabase, notConfiguredError, supabaseErrorMessage, type ServiceResult } from './supabaseClient';
import { dictMessage, type LocalMessage } from './strings';
import { USER_DATA_BUCKET, isAccountUid } from './account-data';
import { TRACK_ID_PATTERN } from './music-library';

const DB_NAME = 'spinly-music';
const STORE = 'files';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (!dbPromise) {
        dbPromise = new Promise((resolve) => {
            try {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => request.result.createObjectStore(STORE);
                request.onsuccess = () => {
                    const db = request.result;
                    // Otra pestaña borra la base (cerrar sesión): esta suelta su conexión y la reabre al usarla.
                    db.onversionchange = () => {
                        db.close();
                        dbPromise = null;
                    };
                    resolve(db);
                };
                request.onerror = () => resolve(null);
                request.onblocked = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    }
    return dbPromise;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
    return openDb().then((db) => new Promise<T | null>((resolve) => {
        if (!db) {
            resolve(null);
            return;
        }
        try {
            const request = action(db.transaction(STORE, mode).objectStore(STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    }));
}

export async function readTrackFile(id: string): Promise<Blob | null> {
    const result = await run<unknown>('readonly', (store) => store.get(id));
    return result instanceof Blob ? result : null;
}

/** false si el navegador no deja guardarlo (sin IndexedDB, modo privado estricto o sin espacio). */
export async function saveTrackFile(id: string, file: Blob): Promise<boolean> {
    return (await run('readwrite', (store) => store.put(file, id))) !== null;
}

export async function deleteTrackFile(id: string): Promise<void> {
    await run('readwrite', (store) => store.delete(id));
}

/** Cerrar sesión: el navegador queda como la primera vez, también sin canciones. */
export function clearTrackFiles(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') {
            resolve();
            return;
        }
        const close = dbPromise;
        dbPromise = null;
        void (close ?? Promise.resolve(null)).then((db) => {
            db?.close();
            try {
                const request = indexedDB.deleteDatabase(DB_NAME);
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
            } catch {
                resolve();
            }
        });
    });
}

// La ruta sale del uid de la sesión y de un id validado, nunca del nombre del archivo.
const cloudPath = (uid: string, id: string): string | null =>
    isAccountUid(uid) && TRACK_ID_PATTERN.test(id) ? `${uid}/music/${id}` : null;

const cloudError = (fallback: LocalMessage, error: unknown): LocalMessage => {
    const message = String((error as { message?: unknown } | null)?.message ?? '');
    if (/bucket not found/i.test(message)) return dictMessage('errors', 'accountBucketMissing');
    // El bucket aún no admite audio: falta el SQL de la música (README).
    if (/mime type|not supported/i.test(message)) return dictMessage('errors', 'musicBucketMime');
    return supabaseErrorMessage(fallback, error);
};

export async function uploadTrackFile(uid: string, id: string, file: Blob, mime: string): Promise<ServiceResult<true>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const path = cloudPath(uid, id);
    const failed = dictMessage('errors', 'musicUpload');
    if (!path) return { ok: false, error: failed };
    try {
        const { error } = await supabase.storage.from(USER_DATA_BUCKET).upload(path, file, { upsert: true, contentType: mime, cacheControl: '31536000' });
        return error ? { ok: false, error: cloudError(failed, error) } : { ok: true, data: true };
    } catch (error) {
        return { ok: false, error: cloudError(failed, error) };
    }
}

export async function downloadTrackFile(uid: string, id: string): Promise<ServiceResult<Blob>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const path = cloudPath(uid, id);
    const failed = dictMessage('errors', 'musicDownload');
    if (!path) return { ok: false, error: failed };
    try {
        const { data, error } = await supabase.storage.from(USER_DATA_BUCKET).download(path);
        return error || !data ? { ok: false, error: cloudError(failed, error) } : { ok: true, data };
    } catch (error) {
        return { ok: false, error: cloudError(failed, error) };
    }
}

export async function deleteCloudTrackFile(uid: string, id: string): Promise<ServiceResult<true>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const path = cloudPath(uid, id);
    if (!path) return { ok: false, error: dictMessage('errors', 'musicDelete') };
    try {
        const { error } = await supabase.storage.from(USER_DATA_BUCKET).remove([path]);
        return error ? { ok: false, error: cloudError(dictMessage('errors', 'musicDelete'), error) } : { ok: true, data: true };
    } catch (error) {
        return { ok: false, error: cloudError(dictMessage('errors', 'musicDelete'), error) };
    }
}
