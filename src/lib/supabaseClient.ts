// Cliente de Supabase: las credenciales llegan por variables de entorno.
// Sin variables configuradas la app sigue funcionando 100% local (modo offline).
// El proyecto es Create React App (react-scripts): el prefijo correcto es REACT_APP_.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { dictMessage, dictMessageWith, type LocalMessage } from './strings';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const isSupabaseConfigured: boolean = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
    ? createClient(supabaseUrl as string, supabaseAnonKey as string)
    : null;

// Resultado uniforme de todos los servicios: nunca lanzamos excepciones hacia la UI,
// así un fallo de red/Supabase jamás rompe el modo 100% local.
// Errores/avisos como LocalMessage (todos los idiomas): la UI los pinta con tm()
// y se re-traducen al cambiar de idioma aunque ya estén en pantalla.
export type ServiceResult<T> =
    | { ok: true; data: T; warning?: LocalMessage }
    | { ok: false; error: LocalMessage };

export function notConfiguredError(): LocalMessage {
    return dictMessage('errors', 'notConfigured');
}

// Traduce errores de Supabase/RED a mensajes claros para el usuario.
export function supabaseErrorMessage(fallback: LocalMessage, error: unknown): LocalMessage {
    const err = error as { code?: string; message?: string } | null;
    const message = err?.message ?? (typeof error === 'string' ? error : '');
    if (err?.code === '23505' || /duplicate key|unique constraint/i.test(message)) {
        return dictMessage('errors', 'usernameTaken');
    }
    // El trigger handle_new_user inserta en profiles(username unique): si el nombre
    // ya existe, Supabase devuelve este error genérico en vez del 23505.
    if (/database error creating anonymous user/i.test(message)) {
        return dictMessage('errors', 'usernameTakenCreate');
    }
    if (/anonymous/i.test(message) && /(sign|enable|disabled|not allowed)/i.test(message)) {
        return dictMessage('errors', 'anonDisabled');
    }
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
        return dictMessage('errors', 'offline');
    }
    // Error desconocido: mensaje localizado + el detalle técnico del servidor entre paréntesis
    return message ? dictMessageWith('errors', 'withDetail', { message: fallback, detail: message }) : fallback;
}

// Texto limpio para enviar a Supabase: colapsa espacios, recorta y limita longitud.
// (React escapa en render; esto sanitiza el DATO antes de persistirlo.)
export function normalizeText(value: string, max: number): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

// MIME whitelist estricta para subidas (avatar y texturas): nada de gif/svg arbitrarios.
export const ALLOWED_IMAGE_MIME: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

export function isAllowedImageMime(type: string): boolean {
    return ALLOWED_IMAGE_MIME.includes(type);
}

// Límite de tamaño compartido por avatar (Storage) y texturas (localStorage ~5MB).
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;