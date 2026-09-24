// Playlist de música: las canciones que sube cada usuario, sin ninguna de serie. Aquí solo el
// modelo, el saneado y la persistencia local de la lista; los archivos van en IndexedDB y en la
// nube (music-files.ts) y el sonido en music-engine.ts.

export type MusicTrack = { id: string; name: string; mime: string; size: number };

export type MusicLibrary = { playlist: MusicTrack[] };

/** Lista de la cuenta: viaja con ella y se borra al cerrar sesión. */
export const MUSIC_STORAGE_KEY = 'spinly-music';
/** Canciones subidas en este navegador que aún no están en la nube (invitado o subida fallida). */
export const MUSIC_PENDING_KEY = 'spinly-music-pending';

export const MAX_UPLOADS = 10;
// Igual que file_size_limit del bucket user-data.
export const MAX_TRACK_BYTES = 10 * 1024 * 1024;
export const MAX_TRACK_NAME = 80;

// Tipos que acepta el bucket (allowed_mime_types). Cada archivo se normaliza a uno de ellos.
export const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/flac'] as const;

const MIME_ALIASES: Record<string, string> = {
    'audio/mp3': 'audio/mpeg',
    'audio/x-m4a': 'audio/mp4',
    'audio/m4a': 'audio/mp4',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/vnd.wave': 'audio/wav',
    'audio/x-flac': 'audio/flac',
    'audio/opus': 'audio/ogg',
};

// Algunos sistemas no dan tipo para ciertos formatos (p. ej. .flac en Windows): se deduce de la extensión.
const MIME_BY_EXTENSION: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    opus: 'audio/ogg',
    wav: 'audio/wav',
    webm: 'audio/webm',
    flac: 'audio/flac',
};

export const AUDIO_ACCEPT = ['audio/*', ...Object.keys(MIME_BY_EXTENSION).map((ext) => `.${ext}`)].join(',');

/** Tipo admitido del archivo, o null si no es un audio que la app acepte. */
export function audioMimeOf(file: { name: string; type: string }): string | null {
    const declared = file.type.toLowerCase().split(';')[0].trim();
    const normalized = MIME_ALIASES[declared] ?? declared;
    if ((AUDIO_MIME_TYPES as readonly string[]).includes(normalized)) return normalized;
    const extension = file.name.toLowerCase().split('.').pop() ?? '';
    return MIME_BY_EXTENSION[extension] ?? null;
}

// Sin caracteres de control: el nombre se pinta tal cual en la lista y en la pantalla de bloqueo.
const printable = (text: string): string => Array.from(text).filter((char) => char.charCodeAt(0) >= 32).join('');

/** Nombre visible a partir del archivo: sin extensión y acotado. */
export function trackNameFromFile(fileName: string): string {
    const base = printable(fileName.replace(/\.[^./\\]+$/, '')).trim();
    return (base || printable(fileName).trim() || 'Audio').slice(0, MAX_TRACK_NAME);
}

// Los ids forman la ruta del archivo en la nube: solo caracteres seguros, nunca "/" ni "..".
export const TRACK_ID_PATTERN = /^[a-z0-9-]{8,64}$/i;

/** Primera visita o tras cerrar sesión: sin canciones, cada uno sube las suyas. */
export const createDefaultLibrary = (): MusicLibrary => ({ playlist: [] });

function sanitizeTrack(raw: unknown): MusicTrack | null {
    if (!raw || typeof raw !== 'object') return null;
    const t = raw as Record<string, unknown>;
    if (typeof t.id !== 'string' || !TRACK_ID_PATTERN.test(t.id)) return null;
    if (typeof t.name !== 'string' || typeof t.mime !== 'string' || typeof t.size !== 'number') return null;
    const mime = (AUDIO_MIME_TYPES as readonly string[]).includes(t.mime) ? t.mime : null;
    const name = printable(t.name).trim().slice(0, MAX_TRACK_NAME);
    if (!mime || !name || !Number.isFinite(t.size) || t.size <= 0 || t.size > MAX_TRACK_BYTES) return null;
    return { id: t.id, name, mime, size: Math.round(t.size) };
}

/** Todo lo que llega del storage o de la nube: ids únicos, tipos admitidos y tope de canciones. */
export function sanitizeMusicLibrary(raw: unknown): MusicLibrary | null {
    const list = (raw as { playlist?: unknown } | null)?.playlist;
    if (!Array.isArray(list)) return null;
    const seen = new Set<string>();
    const playlist: MusicTrack[] = [];
    for (const item of list) {
        const track = sanitizeTrack(item);
        if (!track || seen.has(track.id)) continue;
        seen.add(track.id);
        playlist.push(track);
        if (playlist.length === MAX_UPLOADS) break;
    }
    return { playlist };
}

/** Al entrar en la cuenta: su lista manda y se le añaden las canciones de este navegador que no tenga. */
export function mergeMusicLibraries(account: MusicLibrary, guest: MusicLibrary): MusicLibrary {
    const ids = new Set(account.playlist.map((track) => track.id));
    const extra = guest.playlist.filter((track) => !ids.has(track.id));
    return sanitizeMusicLibrary({ playlist: [...account.playlist, ...extra] }) ?? account;
}

const readJson = (key: string): unknown => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

/** Sin lista guardada (primera visita o tras cerrar sesión): vacía. */
export function readMusicLibrary(): MusicLibrary {
    return sanitizeMusicLibrary(readJson(MUSIC_STORAGE_KEY)) ?? createDefaultLibrary();
}

export function writeMusicLibrary(library: MusicLibrary): boolean {
    try {
        localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(library));
        return true;
    } catch {
        return false;
    }
}

export function readPendingUploads(): string[] {
    const raw = readJson(MUSIC_PENDING_KEY);
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && TRACK_ID_PATTERN.test(id)) : [];
}

export function writePendingUploads(ids: readonly string[]): void {
    try {
        if (ids.length) localStorage.setItem(MUSIC_PENDING_KEY, JSON.stringify(ids));
        else localStorage.removeItem(MUSIC_PENDING_KEY);
    } catch {
        // Sin storage: se reintentará mientras la pestaña siga abierta.
    }
}

// Preferencias del dispositivo, como el idioma: no viajan con la cuenta.
const MUSIC_ON_KEY = 'spinly-music-on';
const MUSIC_VOLUME_KEY = 'spinly-music-volume';
export const DEFAULT_MUSIC_VOLUME = 0.6;

export function readMusicPreference(): { on: boolean; volume: number } {
    try {
        const volume = Number(localStorage.getItem(MUSIC_VOLUME_KEY));
        return {
            on: localStorage.getItem(MUSIC_ON_KEY) === 'on',
            volume: localStorage.getItem(MUSIC_VOLUME_KEY) !== null && Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 1) : DEFAULT_MUSIC_VOLUME,
        };
    } catch {
        return { on: false, volume: DEFAULT_MUSIC_VOLUME };
    }
}

export function writeMusicPreference(pref: { on?: boolean; volume?: number }): void {
    try {
        if (pref.on !== undefined) localStorage.setItem(MUSIC_ON_KEY, pref.on ? 'on' : 'off');
        if (pref.volume !== undefined) localStorage.setItem(MUSIC_VOLUME_KEY, String(Math.round(pref.volume * 100) / 100));
    } catch {
        // Sin storage: la preferencia dura lo que la pestaña.
    }
}
