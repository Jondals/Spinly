/**
 * Files of the uploaded songs. In the browser they live in IndexedDB (localStorage cannot hold files of
 * several MB); in the account, in the private user-data bucket at user-data/<uid>/music/<id>, with the
 * same policies as the account's JSON (only the user's own folder, and only with a password account).
 */
import { getSupabase, notConfiguredError, supabaseErrorMessage, type ServiceResult } from './supabaseClient';
import { dictMessage, type LocalMessage } from './strings';
import { USER_DATA_BUCKET, isAccountUid } from './account-data';
import { TRACK_ID_PATTERN } from './music-library';

const DB_NAME = 'spinly-music';
const STORE = 'files';

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Opens (once) the IndexedDB database of song files; null when IndexedDB is unavailable. */
function openDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (!dbPromise) {
        dbPromise = new Promise((resolve) => {
            try {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => request.result.createObjectStore(STORE);
                request.onsuccess = () => {
                    const db = request.result;
                    // Another tab deletes the database (sign-out): this one drops its connection and reopens it when needed.
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

/** Runs one request on the files store; resolves with its result, or null on any failure. */
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

/** Reads a song file from the local cache. */
export async function readTrackFile(id: string): Promise<Blob | null> {
    const result = await run<unknown>('readonly', (store) => store.get(id));
    return result instanceof Blob ? result : null;
}

/** Saves a song file locally; false if the browser does not allow it (no IndexedDB, strict private mode or no space). */
export async function saveTrackFile(id: string, file: Blob): Promise<boolean> {
    return (await run('readwrite', (store) => store.put(file, id))) !== null;
}

/** Deletes a song file from the local cache. */
export async function deleteTrackFile(id: string): Promise<void> {
    await run('readwrite', (store) => store.delete(id));
}

/** Sign-out: the browser is left as on a first visit, songs included. */
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

/** Cloud path of a song. It is built from the session's uid and a validated id, never from the file name. */
const cloudPath = (uid: string, id: string): string | null =>
    isAccountUid(uid) && TRACK_ID_PATTERN.test(id) ? `${uid}/music/${id}` : null;

/** Maps a Storage error to a user-facing message, spotting a missing bucket or a bucket without audio types. */
const cloudError = (fallback: LocalMessage, error: unknown): LocalMessage => {
    const message = String((error as { message?: unknown } | null)?.message ?? '');
    if (/bucket not found/i.test(message)) return dictMessage('errors', 'accountBucketMissing');
    // The bucket does not accept audio yet: the music SQL is missing (README).
    if (/mime type|not supported/i.test(message)) return dictMessage('errors', 'musicBucketMime');
    return supabaseErrorMessage(fallback, error);
};

/** Uploads a song to the user's private folder. */
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

/** Downloads a song from the user's private folder. */
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

/** Deletes a song from the user's private folder. */
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
