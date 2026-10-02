/**
 * Supabase client and shared service helpers. The SDK is loaded lazily, so visitors without a session
 * never download it, and every service returns a ServiceResult instead of throwing.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { dictMessage, dictMessageWith, type LocalMessage } from './strings';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

/** Without credentials the app runs 100% locally. */
export const isSupabaseConfigured: boolean = Boolean(supabaseUrl && supabaseAnonKey);

let clientPromise: Promise<SupabaseClient | null> | null = null;
let loadedClient: SupabaseClient | null = null;
const readyListeners = new Set<(client: SupabaseClient) => void>();

/**
 * Lazy client: the SDK is downloaded the first time something needs it (profile, community or a saved
 * session), never at startup. If the download fails it is retried on the next call.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
    if (!isSupabaseConfigured) return Promise.resolve(null);
    if (!clientPromise) {
        clientPromise = import('@supabase/supabase-js')
            .then(({ createClient }) => {
                const client = createClient(supabaseUrl as string, supabaseAnonKey as string);
                loadedClient = client;
                readyListeners.forEach((listener) => listener(client));
                readyListeners.clear();
                return client;
            })
            .catch(() => {
                clientPromise = null;
                return null;
            });
    }
    return clientPromise;
}

/** Calls `callback` once the client exists, without triggering its download. */
export function onSupabaseReady(callback: (client: SupabaseClient) => void): () => void {
    if (loadedClient) {
        callback(loadedClient);
        return () => undefined;
    }
    readyListeners.add(callback);
    return () => {
        readyListeners.delete(callback);
    };
}

/** Whether the SDK has already been downloaded. */
export function isSupabaseLoaded(): boolean {
    return loadedClient !== null;
}

/** supabase-js persists the session in `sb-<ref>-auth-token`; knowing whether it exists is enough. */
export function hasStoredSession(): boolean {
    if (!isSupabaseConfigured) return false;
    try {
        const ref = new URL(supabaseUrl as string).hostname.split('.')[0];
        return localStorage.getItem(`sb-${ref}-auth-token`) !== null;
    } catch {
        return false;
    }
}

/**
 * Services never throw at the UI: a network or Supabase failure never breaks local mode.
 * Messages carry every language so they can be re-translated if the language changes on screen.
 */
export type ServiceResult<T> =
    | { ok: true; data: T; warning?: LocalMessage }
    | { ok: false; error: LocalMessage };

/** Message shown when Supabase is not configured. */
export function notConfiguredError(): LocalMessage {
    return dictMessage('errors', 'notConfigured');
}

/** Turns a Supabase or network error into a friendly message (or the fallback with the raw detail). */
export function supabaseErrorMessage(fallback: LocalMessage, error: unknown): LocalMessage {
    const err = error as { code?: string; message?: string } | null;
    const message = err?.message ?? (typeof error === 'string' ? error : '');
    if (err?.code === '23505' || /duplicate key|unique constraint/i.test(message)) {
        return dictMessage('errors', 'usernameTaken');
    }
    // The handle_new_user trigger inserts into profiles (unique username): with a taken name Supabase
    // returns this generic error instead of 23505.
    if (/database error creating anonymous user/i.test(message)) {
        return dictMessage('errors', 'usernameTakenCreate');
    }
    if (/invalid login credentials/i.test(message)) return dictMessage('errors', 'badCredentials');
    if (/email (logins|signups|provider) (are|is) disabled/i.test(message)) return dictMessage('errors', 'emailProviderDisabled');
    if (err?.code === 'weak_password' || /password should (be|contain)/i.test(message)) {
        return dictMessage('errors', 'passwordWeak', { min: MIN_PASSWORD_LENGTH });
    }
    if (/anonymous/i.test(message) && /(sign|enable|disabled|not allowed)/i.test(message)) {
        return dictMessage('errors', 'anonDisabled');
    }
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
        return dictMessage('errors', 'offline');
    }
    return message ? dictMessageWith('errors', 'withDetail', { message: fallback, detail: message }) : fallback;
}

/** Normalises text before it is stored; output escaping is already done by React. */
export function normalizeText(value: string, max: number): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

// No SVG or GIF: SVG can carry scripts.
export const ALLOWED_IMAGE_MIME: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

/** Whether an uploaded image type is allowed. */
export function isAllowedImageMime(type: string): boolean {
    return ALLOWED_IMAGE_MIME.includes(type);
}

/**
 * Must match Supabase → Authentication → Email: "Minimum password length" and
 * "Password requirements" = lowercase, uppercase, digits and symbols.
 */
export const MIN_PASSWORD_LENGTH = 10;

// Maximum size of an uploaded image (avatar or wheel texture). It is shrunk before it is saved
// (image-resize.ts), so what reaches the avatars bucket or localStorage is much lighter.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;