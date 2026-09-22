// Galería "Compartir / Comunidad": shared_themes + shared_presets con join a profiles
// para pintar nombre + foto del autor. Reutiliza WheelTheme/WheelPreset y sus sanitizers
// desde theme-types.ts: cero tipos duplicados entre lo local y lo de Supabase.
import {
    supabase,
    SUPABASE_NOT_CONFIGURED_ERROR,
    normalizeText,
    supabaseErrorMessage,
    type ServiceResult,
} from './supabaseClient';
import {
    sanitizePreset,
    sanitizeTheme,
    type WheelPreset,
    type WheelTheme,
} from '../types/theme-types';
import { getCurrentUserId } from './profile';

export type CommunityAuthor = {
    username: string;
    avatar_url: string | null;
};

export type CommunityTheme = { theme: WheelTheme; author: CommunityAuthor };
export type CommunityPreset = { preset: WheelPreset; author: CommunityAuthor };

const NO_SESSION_ERROR = 'Inicia sesión con tu nombre de usuario (icono de perfil) para compartir.';
// Autor huérfano (sin fila en profiles): siempre nombre + avatar placeholder, nunca hueco roto.
const FALLBACK_AUTHOR: CommunityAuthor = { username: 'Usuario', avatar_url: null };

// Límites de campos compartidos (cliente; la verdad última sigue siendo RLS + constraints)
const MAX_SHARED_NAME = 40;
const MAX_SHARED_DESCRIPTION = 160;
const MAX_SHARED_TAGS = 10;

type ProfileRef = { username: string; avatar_url: string | null } | null;

type SharedThemeRow = {
    id: string;
    name: string;
    description: string | null;
    style_tag: string | null;
    category: string | null;
    segments: unknown;
    border_color: string | null;
    center_color: string | null;
    pointer_color: string | null;
    created_at: string;
    author: ProfileRef;
};

type SharedPresetRow = {
    id: string;
    name: string;
    options: unknown;
    theme: unknown;
    tags: string[] | null;
    created_at: string;
    author: ProfileRef;
};

function toAuthor(author: ProfileRef): CommunityAuthor {
    if (!author || typeof author.username !== 'string' || author.username.length === 0) {
        return FALLBACK_AUTHOR;
    }
    return { username: author.username, avatar_url: author.avatar_url ?? null };
}

function rowToTheme(row: SharedThemeRow): CommunityTheme | null {
    const theme = sanitizeTheme({
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        styleTag: row.style_tag ?? undefined,
        category: row.category ?? undefined,
        segments: row.segments,
        borderColor: row.border_color ?? undefined,
        centerColor: row.center_color ?? undefined,
        pointerColor: row.pointer_color ?? undefined,
    });
    if (!theme) return null;
    return { theme, author: toAuthor(row.author) };
}

// Join a profiles (nombre + foto del autor) en la misma consulta.
const AUTHOR_JOIN = 'author:profiles(username, avatar_url)';

export async function fetchCommunityThemes(): Promise<ServiceResult<CommunityTheme[]>> {
    if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_ERROR };
    try {
        const { data, error } = await supabase
            .from('shared_themes')
            .select(
                'id, name, description, style_tag, category, segments, border_color, center_color, pointer_color, created_at, ' + AUTHOR_JOIN
            )
            .order('created_at', { ascending: false });
        if (error) return { ok: false, error: supabaseErrorMessage('No se pudo cargar la comunidad.', error) };
        const rows = (data ?? []) as unknown as SharedThemeRow[];
        return { ok: true, data: rows.map(rowToTheme).filter((item): item is CommunityTheme => item !== null) };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage('No se pudo cargar la comunidad.', error) };
    }
}

function rowToPreset(row: SharedPresetRow): CommunityPreset | null {
    const parsed = Date.parse(row.created_at);
    const preset = sanitizePreset({
        id: row.id,
        name: row.name,
        options: row.options,
        theme: row.theme,
        updatedAt: Number.isFinite(parsed) ? parsed : Date.now(),
        tags: row.tags ?? [],
    });
    if (!preset) return null;
    return { preset, author: toAuthor(row.author) };
}

export async function fetchCommunityPresets(): Promise<ServiceResult<CommunityPreset[]>> {
    if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_ERROR };
    try {
        const { data, error } = await supabase
            .from('shared_presets')
            .select('id, name, options, theme, tags, created_at, ' + AUTHOR_JOIN)
            .order('created_at', { ascending: false });
        if (error) return { ok: false, error: supabaseErrorMessage('No se pudo cargar la comunidad.', error) };
        const rows = (data ?? []) as unknown as SharedPresetRow[];
        return { ok: true, data: rows.map(rowToPreset).filter((item): item is CommunityPreset => item !== null) };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage('No se pudo cargar la comunidad.', error) };
    }
}

// Compartir un tema: author_id SIEMPRE asociado a la fila + payload sanitizado.
export async function shareTheme(theme: WheelTheme): Promise<ServiceResult<true>> {
    if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_ERROR };
    try {
        const userId = await getCurrentUserId();
        if (!userId) return { ok: false, error: NO_SESSION_ERROR };
        const name = normalizeText(theme.name, MAX_SHARED_NAME);
        if (!name) return { ok: false, error: 'El tema no tiene nombre.' };
        // sanitizeTheme valida colores (hex) y texturas (data:image raster) antes de subir
        const clean = sanitizeTheme({ ...theme, name });
        if (!clean) return { ok: false, error: 'El tema contiene datos no válidos.' };
        const { error } = await supabase.from('shared_themes').insert({
            author_id: userId,
            name: clean.name,
            description: normalizeText(theme.description ?? '', MAX_SHARED_DESCRIPTION) || null,
            style_tag: normalizeText(theme.styleTag ?? '', MAX_SHARED_NAME) || null,
            category: normalizeText(theme.category ?? '', MAX_SHARED_NAME) || null,
            segments: clean.segments,
            border_color: clean.borderColor ?? null,
            center_color: clean.centerColor ?? null,
            pointer_color: clean.pointerColor ?? null,
        });
        if (error) return { ok: false, error: supabaseErrorMessage('No se pudo compartir el tema.', error) };
        return { ok: true, data: true };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage('No se pudo compartir el tema.', error) };
    }
}

// Compartir un preset: author_id SIEMPRE asociado a la fila + payload sanitizado.
export async function sharePreset(preset: WheelPreset): Promise<ServiceResult<true>> {
    if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_ERROR };
    try {
        const userId = await getCurrentUserId();
        if (!userId) return { ok: false, error: NO_SESSION_ERROR };
        const name = normalizeText(preset.name, MAX_SHARED_NAME);
        if (!name) return { ok: false, error: 'El preset no tiene nombre.' };
        // sanitizePreset revalida opciones + tema completo (imágenes incluidas)
        const clean = sanitizePreset({ ...preset, name });
        if (!clean) return { ok: false, error: 'El preset contiene datos no válidos.' };
        const tags = (clean.tags ?? [])
            .map((tag) => normalizeText(tag, 24))
            .filter(Boolean)
            .slice(0, MAX_SHARED_TAGS);
        const { error } = await supabase.from('shared_presets').insert({
            author_id: userId,
            name: clean.name,
            options: clean.options,
            theme: clean.theme,
            tags,
        });
        if (error) return { ok: false, error: supabaseErrorMessage('No se pudo compartir el preset.', error) };
        return { ok: true, data: true };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage('No se pudo compartir el preset.', error) };
    }
}