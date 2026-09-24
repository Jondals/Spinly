// Datos de la cuenta (ruleta, temas y preajustes) en un JSON privado por usuario, en el bucket
// user-data de Storage: user-data/<uid>/spinly.json. Las políticas del bucket solo dejan
// leer y escribir la carpeta propia, y escribir solo a cuentas con contraseña.
// Las preferencias del dispositivo (idioma, claro/oscuro, sonido) no viajan con la cuenta.
import { getSupabase, notConfiguredError, supabaseErrorMessage, type ServiceResult } from './supabaseClient';
import { dictMessage } from './strings';
import { MAX_WHEEL_OPTIONS, MIN_OPTIONS, type WheelOption } from './option-wheel';
import {
    MUSIC_PENDING_KEY,
    MUSIC_STORAGE_KEY,
    mergeMusicLibraries,
    sanitizeMusicLibrary,
    type MusicLibrary,
} from './music-library';
import {
    ACTIVE_PRESET_STORAGE_KEY,
    ACTIVE_THEME_STORAGE_KEY,
    HIDDEN_DEFAULTS_STORAGE_KEY,
    OPTIONS_STORAGE_KEY,
    PRESETS_STORAGE_KEY,
    THEMES_STORAGE_KEY,
    WHEEL_LIMIT_STORAGE_KEY,
    sanitizeOptions,
    sanitizePreset,
    sanitizeTheme,
    type WheelPreset,
    type WheelTheme,
} from '../types/theme-types';

export type AccountData = {
    version: 1;
    updatedAt: number;
    options: WheelOption[];
    activeTheme: WheelTheme | null;
    activePresetId: string | null;
    wheelLimit: number | null;
    themes: WheelTheme[];
    presets: WheelPreset[];
    /** Playlist de música. null en cuentas guardadas antes de que existiera. */
    music: MusicLibrary | null;
};

/** Lo que se sincroniza: sin updatedAt ni versión. */
export type AccountSnapshot = Omit<AccountData, 'version' | 'updatedAt'>;

export const USER_DATA_BUCKET = 'user-data';
const BUCKET = USER_DATA_BUCKET;
// Coincide con file_size_limit del bucket: mejor un aviso claro que un error del servidor.
const MAX_ACCOUNT_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYNC_KEY = 'spinly-account-sync';

/** Claves de localStorage que pertenecen a la cuenta; se borran al cerrar sesión. */
const DATA_KEYS = [
    OPTIONS_STORAGE_KEY,
    THEMES_STORAGE_KEY,
    ACTIVE_THEME_STORAGE_KEY,
    PRESETS_STORAGE_KEY,
    ACTIVE_PRESET_STORAGE_KEY,
    WHEEL_LIMIT_STORAGE_KEY,
    HIDDEN_DEFAULTS_STORAGE_KEY,
    MUSIC_STORAGE_KEY,
    MUSIC_PENDING_KEY,
    SYNC_KEY,
];

/** uid con forma de uid de Supabase: las rutas de la nube solo se construyen con uno así. */
export const isAccountUid = (uid: string): boolean => UUID.test(uid);

// La ruta sale siempre del uid de la sesión, nunca de datos del usuario.
const objectPath = (uid: string): string | null => (UUID.test(uid) ? `${uid}/spinly.json` : null);

const parse = (raw: string | null): unknown => {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const listOf = <T>(raw: unknown, key: string, clean: (item: unknown) => T | null): T[] => {
    const list = Array.isArray(raw) ? raw : (raw as Record<string, unknown> | null)?.[key];
    if (!Array.isArray(list)) return [];
    return list.map(clean).filter((item): item is T => item !== null);
};

const cleanLimit = (raw: unknown): number | null => {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) && n !== 0 ? Math.min(Math.max(Math.round(n), MIN_OPTIONS), MAX_WHEEL_OPTIONS) : null;
};

/** Todo lo que llega del storage o de la nube pasa por los mismos sanitizers que la app. */
export function sanitizeAccountData(raw: unknown): AccountData | null {
    if (!raw || typeof raw !== 'object') return null;
    const d = raw as Record<string, unknown>;
    const options = sanitizeOptions(d.options, 'account').slice(0, MAX_WHEEL_OPTIONS);
    return {
        version: 1,
        updatedAt: typeof d.updatedAt === 'number' && Number.isFinite(d.updatedAt) ? d.updatedAt : 0,
        options: options.length >= MIN_OPTIONS ? options : [],
        activeTheme: sanitizeTheme(d.activeTheme),
        activePresetId: typeof d.activePresetId === 'string' ? d.activePresetId : null,
        wheelLimit: cleanLimit(d.wheelLimit),
        themes: listOf(d.themes, 'savedThemes', sanitizeTheme).filter((theme) => !theme.id.startsWith('preset-')),
        presets: listOf(d.presets, 'savedPresets', sanitizePreset).filter((preset) => !preset.id.startsWith('default-preset-')),
        music: sanitizeMusicLibrary(d.music),
    };
}

export function readLocalData(): AccountSnapshot {
    const get = (key: string) => {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    };
    const clean = sanitizeAccountData({
        options: parse(get(OPTIONS_STORAGE_KEY)),
        activeTheme: parse(get(ACTIVE_THEME_STORAGE_KEY)),
        activePresetId: get(ACTIVE_PRESET_STORAGE_KEY),
        wheelLimit: get(WHEEL_LIMIT_STORAGE_KEY),
        themes: parse(get(THEMES_STORAGE_KEY)),
        presets: parse(get(PRESETS_STORAGE_KEY)),
        music: parse(get(MUSIC_STORAGE_KEY)),
    });
    const { version, updatedAt, ...snapshot } = clean as AccountData;
    return snapshot;
}

export function writeLocalData(data: AccountSnapshot): void {
    const entries: Array<[string, string | null]> = [
        [OPTIONS_STORAGE_KEY, data.options.length >= MIN_OPTIONS ? JSON.stringify(data.options) : null],
        [ACTIVE_THEME_STORAGE_KEY, data.activeTheme ? JSON.stringify(data.activeTheme) : null],
        [ACTIVE_PRESET_STORAGE_KEY, data.activePresetId],
        [WHEEL_LIMIT_STORAGE_KEY, data.wheelLimit !== null ? String(data.wheelLimit) : null],
        [THEMES_STORAGE_KEY, JSON.stringify(data.themes)],
        [PRESETS_STORAGE_KEY, JSON.stringify(data.presets)],
        // Sin lista en la cuenta (anterior a la música): este navegador vuelve a la de por defecto.
        [MUSIC_STORAGE_KEY, data.music ? JSON.stringify(data.music) : null],
    ];
    for (const [key, value] of entries) {
        try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch {
            // Sin espacio o sin acceso: se queda lo que hubiera; la nube sigue siendo la copia buena.
        }
    }
}

/** Deja el navegador como la primera vez: la app arranca con sus valores por defecto. */
export function clearLocalData(): void {
    for (const key of DATA_KEYS) {
        try {
            localStorage.removeItem(key);
        } catch {
            // Sin acceso a storage: no hay nada que borrar.
        }
    }
}

/** Marca de la última sincronización en este navegador: de qué cuenta es y de cuándo. */
export function readSyncMarker(): { uid: string; updatedAt: number } | null {
    try {
        const raw = parse(localStorage.getItem(SYNC_KEY)) as { uid?: unknown; updatedAt?: unknown } | null;
        if (raw && typeof raw.uid === 'string' && typeof raw.updatedAt === 'number') return { uid: raw.uid, updatedAt: raw.updatedAt };
    } catch {
        // Sin acceso a storage: se trata como si no hubiera sincronizado nunca.
    }
    return null;
}

export function writeSyncMarker(uid: string, updatedAt: number): void {
    try {
        localStorage.setItem(SYNC_KEY, JSON.stringify({ uid, updatedAt }));
    } catch {
        // Sin acceso a storage: la próxima apertura volverá a comparar con la nube.
    }
}

/**
 * Al entrar en la cuenta, lo que el invitado tenía en este navegador se añade a la cuenta
 * (unión por id; ante un mismo id gana la cuenta). La ruleta y el tema activo son los de la cuenta.
 */
export function mergeGuestData(account: AccountSnapshot, guest: AccountSnapshot): AccountSnapshot {
    const themeIds = new Set(account.themes.map((theme) => theme.id));
    const presetIds = new Set(account.presets.map((preset) => preset.id));
    const music = account.music && guest.music ? mergeMusicLibraries(account.music, guest.music) : account.music ?? guest.music;
    return {
        ...account,
        themes: [...account.themes, ...guest.themes.filter((theme) => !themeIds.has(theme.id))],
        presets: [...account.presets, ...guest.presets.filter((preset) => !presetIds.has(preset.id))],
        music,
    };
}

/** data = null si la cuenta aún no tiene datos guardados (cuenta nueva o anterior a la sincronización). */
export async function fetchAccountData(uid: string): Promise<ServiceResult<AccountData | null>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const path = objectPath(uid);
    const failed = dictMessage('errors', 'accountRead');
    if (!path) return { ok: false, error: failed };
    try {
        const { data, error } = await supabase.storage.from(BUCKET).download(path);
        if (error) {
            const message = String(error.message ?? '');
            if (/bucket not found/i.test(message)) return { ok: false, error: dictMessage('errors', 'accountBucketMissing') };
            if (/not found|404/i.test(message)) return { ok: true, data: null };
            return { ok: false, error: supabaseErrorMessage(failed, error) };
        }
        return { ok: true, data: sanitizeAccountData(parse(await data.text())) };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(failed, error) };
    }
}

export async function saveAccountData(uid: string, snapshot: AccountSnapshot, updatedAt = Date.now()): Promise<ServiceResult<number>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const path = objectPath(uid);
    const failed = dictMessage('errors', 'accountSave');
    if (!path) return { ok: false, error: failed };
    const data: AccountData = { version: 1, updatedAt, ...snapshot };
    const body = JSON.stringify(data);
    if (new Blob([body]).size > MAX_ACCOUNT_BYTES) return { ok: false, error: dictMessage('errors', 'accountTooBig') };
    try {
        // cacheControl 0: la comprobación al abrir la app nunca debe leer una copia antigua de caché.
        const { error } = await supabase.storage.from(BUCKET).upload(path, new Blob([body], { type: 'application/json' }), {
            upsert: true,
            contentType: 'application/json',
            cacheControl: '0',
        });
        if (error) {
            if (/bucket not found/i.test(String(error.message ?? ''))) return { ok: false, error: dictMessage('errors', 'accountBucketMissing') };
            return { ok: false, error: supabaseErrorMessage(failed, error) };
        }
        return { ok: true, data: updatedAt };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(failed, error) };
    }
}

/**
 * Tras iniciar sesión: la cuenta más lo del invitado pasa a este navegador y a la nube.
 * Si la cuenta no tenía datos (anterior a la sincronización), lo local se convierte en ellos.
 */
export async function adoptAccountData(uid: string): Promise<ServiceResult<true>> {
    const remote = await fetchAccountData(uid);
    if (!remote.ok) return remote;
    const guest = readLocalData();
    const merged = remote.data ? mergeGuestData(remote.data, guest) : guest;
    writeLocalData(merged);
    const saved = await saveAccountData(uid, merged);
    if (!saved.ok) return saved;
    writeSyncMarker(uid, saved.data);
    return { ok: true, data: true };
}

/** Entrar o salir de la cuenta: la app arranca de nuevo desde localStorage. */
export function reloadApp(): void {
    window.location.reload();
}

// Datos nuevos de otro dispositivo: basta con volver a montar App, que lee localStorage al
// montarse. Recargar la página se vería como un parpadeo justo al acabar la pantalla de carga.
let remount: (() => void) | null = null;

export function setAppRemount(handler: (() => void) | null): void {
    remount = handler;
}

/** Sin raíz registrada (fuera de index.tsx) recurre a recargar. */
export function remountApp(): void {
    if (remount) remount();
    else reloadApp();
}

// Durante un cambio de cuenta (entrar o salir) la página se recarga: no debe subirse nada más.
let switchingAccount = false;
export const beginAccountSwitch = (): void => {
    switchingAccount = true;
};
/** El cambio falló (credenciales, red): la sesión que hubiera sigue y vuelve a sincronizarse. */
export const endAccountSwitch = (): void => {
    switchingAccount = false;
};
export const isSwitchingAccount = (): boolean => switchingAccount;
