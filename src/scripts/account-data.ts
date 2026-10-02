/**
 * Account data (wheel, themes, presets and playlist) in one private JSON per user, in the user-data
 * Storage bucket: user-data/<uid>/spinly.json. The bucket policies only allow reading and writing the
 * user's own folder, and writing only to password accounts.
 * Device preferences (language, light/dark, sound) do not travel with the account.
 */
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
    /** Music playlist. null for accounts saved before it existed. */
    music: MusicLibrary | null;
};

/** What is synced: everything but updatedAt and version. */
export type AccountSnapshot = Omit<AccountData, 'version' | 'updatedAt'>;

export const USER_DATA_BUCKET = 'user-data';
const BUCKET = USER_DATA_BUCKET;
// Matches the bucket's file_size_limit: a clear message is better than a server error.
const MAX_ACCOUNT_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYNC_KEY = 'spinly-account-sync';

/** Tournament in progress (tournament mode): it lives in this browser, but is cleared on sign-out like the rest. */
export const TOURNAMENT_STORAGE_KEY = 'spinly-tournament';

/** localStorage keys that belong to the account; they are cleared on sign-out. */
const DATA_KEYS = [
    TOURNAMENT_STORAGE_KEY,
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

/** A uid shaped like a Supabase uid: cloud paths are only ever built from one. */
export const isAccountUid = (uid: string): boolean => UUID.test(uid);

/** Cloud path of the account file. It always comes from the session's uid, never from user data. */
const objectPath = (uid: string): string | null => (UUID.test(uid) ? `${uid}/spinly.json` : null);

/** Parses JSON; null if it is missing or broken. */
const parse = (raw: string | null): unknown => {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

/** A sanitized list, read either from an array or from `raw[key]` (older format). */
const listOf = <T>(raw: unknown, key: string, clean: (item: unknown) => T | null): T[] => {
    const list = Array.isArray(raw) ? raw : (raw as Record<string, unknown> | null)?.[key];
    if (!Array.isArray(list)) return [];
    return list.map(clean).filter((item): item is T => item !== null);
};

/** A valid option limit, or null. */
const cleanLimit = (raw: unknown): number | null => {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) && n !== 0 ? Math.min(Math.max(Math.round(n), MIN_OPTIONS), MAX_WHEEL_OPTIONS) : null;
};

/** Everything coming from storage or the cloud goes through the same sanitizers as the app. */
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

/** Snapshot of the account data stored in this browser. */
export function readLocalData(): AccountSnapshot {
    /** Reads a localStorage key (null if storage is unavailable). */
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

/** Writes a snapshot to localStorage (removing keys with no value). */
export function writeLocalData(data: AccountSnapshot): void {
    const entries: Array<[string, string | null]> = [
        [OPTIONS_STORAGE_KEY, data.options.length >= MIN_OPTIONS ? JSON.stringify(data.options) : null],
        [ACTIVE_THEME_STORAGE_KEY, data.activeTheme ? JSON.stringify(data.activeTheme) : null],
        [ACTIVE_PRESET_STORAGE_KEY, data.activePresetId],
        [WHEEL_LIMIT_STORAGE_KEY, data.wheelLimit !== null ? String(data.wheelLimit) : null],
        [THEMES_STORAGE_KEY, JSON.stringify(data.themes)],
        [PRESETS_STORAGE_KEY, JSON.stringify(data.presets)],
        // No list in the account (it predates music): this browser goes back to the default one.
        [MUSIC_STORAGE_KEY, data.music ? JSON.stringify(data.music) : null],
    ];
    for (const [key, value] of entries) {
        try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch {
            // No space or no access: whatever was there stays; the cloud is still the good copy.
        }
    }
}

/** Leaves the browser as on a first visit: the app starts with its defaults. */
export function clearLocalData(): void {
    for (const key of DATA_KEYS) {
        try {
            localStorage.removeItem(key);
        } catch {
            // No storage access: there is nothing to delete.
        }
    }
}

/** Marker of the last sync in this browser: which account and when. */
export function readSyncMarker(): { uid: string; updatedAt: number } | null {
    try {
        const raw = parse(localStorage.getItem(SYNC_KEY)) as { uid?: unknown; updatedAt?: unknown } | null;
        if (raw && typeof raw.uid === 'string' && typeof raw.updatedAt === 'number') return { uid: raw.uid, updatedAt: raw.updatedAt };
    } catch {
        // No storage access: treated as never synced.
    }
    return null;
}

/** Saves the sync marker. */
export function writeSyncMarker(uid: string, updatedAt: number): void {
    try {
        localStorage.setItem(SYNC_KEY, JSON.stringify({ uid, updatedAt }));
    } catch {
        // No storage access: the next start will compare with the cloud again.
    }
}

/**
 * On sign-in, what the guest had in this browser is added to the account (union by id; on the same id
 * the account wins). The wheel and the active theme are the account's.
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

/** Downloads the account file. data = null if the account has no saved data yet (new, or older than sync). */
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

/** Uploads the account file; resolves with the updatedAt it was saved with. */
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
        // cacheControl 0: the check at startup must never read an old cached copy.
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
 * After signing in: the account plus the guest's data goes to this browser and to the cloud.
 * If the account had no data (older than sync), the local data becomes its data.
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

/** Signing in or out: the app starts again from localStorage. */
export function reloadApp(): void {
    window.location.reload();
}

// New data from another device: remounting App is enough, since it reads localStorage on mount.
// Reloading the page would look like a flash right after the splash screen.
let remount: (() => void) | null = null;

/** Registers (or clears) the function that remounts App (set by index.tsx). */
export function setAppRemount(handler: (() => void) | null): void {
    remount = handler;
}

/** Remounts App to apply new data; without a registered root (outside index.tsx) it reloads. */
export function remountApp(): void {
    if (remount) remount();
    else reloadApp();
}

// During an account switch (sign in or out) the page reloads: nothing else must be uploaded.
let switchingAccount = false;
/** Marks the start of an account switch. */
export const beginAccountSwitch = (): void => {
    switchingAccount = true;
};
/** The switch failed (credentials, network): the previous session stays and syncs again. */
export const endAccountSwitch = (): void => {
    switchingAccount = false;
};
/** Whether an account switch is in progress. */
export const isSwitchingAccount = (): boolean => switchingAccount;
