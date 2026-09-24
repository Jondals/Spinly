import type { SupabaseClient } from '@supabase/supabase-js';
import { dictMessage, dictMessageWith, type LocalMessage } from './strings';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

/** Sin credenciales la app funciona 100% en local. */
export const isSupabaseConfigured: boolean = Boolean(supabaseUrl && supabaseAnonKey);

let clientPromise: Promise<SupabaseClient | null> | null = null;
let loadedClient: SupabaseClient | null = null;
const readyListeners = new Set<(client: SupabaseClient) => void>();

/**
 * Cliente perezoso: el SDK se descarga la primera vez que algo lo necesita
 * (perfil, comunidad o una sesión guardada), nunca en el arranque. Si la descarga
 * falla se reintenta en la siguiente llamada.
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

/** Llama a `callback` cuando exista el cliente, sin provocar su descarga. */
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

export function isSupabaseLoaded(): boolean {
    return loadedClient !== null;
}

/** supabase-js persiste la sesión en `sb-<ref>-auth-token`; basta con saber si existe. */
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
 * Los servicios nunca lanzan hacia la UI: un fallo de red o de Supabase no rompe el modo local.
 * Los mensajes van en todos los idiomas para re-traducirse si cambia el idioma en pantalla.
 */
export type ServiceResult<T> =
    | { ok: true; data: T; warning?: LocalMessage }
    | { ok: false; error: LocalMessage };

export function notConfiguredError(): LocalMessage {
    return dictMessage('errors', 'notConfigured');
}

export function supabaseErrorMessage(fallback: LocalMessage, error: unknown): LocalMessage {
    const err = error as { code?: string; message?: string } | null;
    const message = err?.message ?? (typeof error === 'string' ? error : '');
    if (err?.code === '23505' || /duplicate key|unique constraint/i.test(message)) {
        return dictMessage('errors', 'usernameTaken');
    }
    // El trigger handle_new_user inserta en profiles (username unique): con un nombre repetido
    // Supabase devuelve este error genérico en vez del 23505.
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

/** Normaliza el dato antes de persistirlo; el escapado de salida ya lo hace React. */
export function normalizeText(value: string, max: number): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

// Sin SVG ni GIF: el SVG puede llevar scripts.
export const ALLOWED_IMAGE_MIME: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

export function isAllowedImageMime(type: string): boolean {
    return ALLOWED_IMAGE_MIME.includes(type);
}

/**
 * Debe coincidir con Supabase → Authentication → Email: "Minimum password length" y
 * "Password requirements" = minúsculas, mayúsculas, dígitos y símbolos.
 */
export const MIN_PASSWORD_LENGTH = 10;

// Compartido por avatar (Storage) y texturas (localStorage ~5MB).
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;