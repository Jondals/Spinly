// Comunidad: shared_themes y shared_presets con el autor (profiles) en la misma consulta.
// Reutiliza los tipos y sanitizers locales: no hay modelos duplicados.
import {
    getSupabase,
    notConfiguredError,
    normalizeText,
    supabaseErrorMessage,
    type ServiceResult,
} from './supabaseClient';
import { dictMessage, type LocalMessage } from './strings';
import {
    sanitizePreset,
    sanitizeTheme,
    type WheelPreset,
    type WheelTheme,
} from '../types/theme-types';
import { getCurrentUserId } from './profile';

// username vacío = autor sin fila en profiles; la UI muestra un nombre genérico.
export type CommunityAuthor = {
    username: string;
    avatar_url: string | null;
};

// authorId solo decide qué acciones se muestran; la autorización la impone RLS.
export type CommunityTheme = { theme: WheelTheme; author: CommunityAuthor; authorId: string };
export type CommunityPreset = { preset: WheelPreset; author: CommunityAuthor; authorId: string };

const noSessionError = () => dictMessage('errors', 'noSession');
const loadCommunityError = () => dictMessage('errors', 'loadCommunity');
const fallbackAuthor = (): CommunityAuthor => ({ username: '', avatar_url: null });

// Límites de cliente; la verdad última son RLS y las constraints de la base de datos.
const MAX_SHARED_NAME = 40;
const MAX_SHARED_DESCRIPTION = 160;
const MAX_SHARED_TAGS = 10;

type ProfileRef = { username: string; avatar_url: string | null } | null;

type SharedThemeRow = {
    id: string;
    author_id: string;
    name: string;
    description: string | null;
    style_tag: string | null;
    category: string | null;
    segments: unknown;
    border_color: string | null;
    center_color: string | null;
    pointer_color: string | null;
    light_color?: string | null;
    created_at: string;
    author: ProfileRef;
};

type SharedPresetRow = {
    id: string;
    author_id: string;
    name: string;
    options: unknown;
    theme: unknown;
    tags: string[] | null;
    created_at: string;
    author: ProfileRef;
};

function toAuthor(author: ProfileRef): CommunityAuthor {
    if (!author || typeof author.username !== 'string' || author.username.length === 0) {
        return fallbackAuthor();
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
        lightColor: row.light_color ?? undefined,
    });
    if (!theme) return null;
    return { theme, author: toAuthor(row.author), authorId: String(row.author_id ?? '') };
}

const AUTHOR_JOIN = 'author:profiles(username, avatar_url)';

export async function fetchCommunityThemes(): Promise<ServiceResult<CommunityTheme[]>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    try {
        const { data, error } = await supabase
            .from('shared_themes')
            // `*` y no una lista: light_color puede no existir aún (supabase-update-policies.sql)
            // y pedir una columna inexistente haría fallar toda la lectura.
            .select('*, ' + AUTHOR_JOIN)
            .order('created_at', { ascending: false });
        if (error) return { ok: false, error: supabaseErrorMessage(loadCommunityError(), error) };
        const rows = (data ?? []) as unknown as SharedThemeRow[];
        return { ok: true, data: rows.map(rowToTheme).filter((item): item is CommunityTheme => item !== null) };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(loadCommunityError(), error) };
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
    return { preset, author: toAuthor(row.author), authorId: String(row.author_id ?? '') };
}

export async function fetchCommunityPresets(): Promise<ServiceResult<CommunityPreset[]>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    try {
        const { data, error } = await supabase
            .from('shared_presets')
            .select('id, author_id, name, options, theme, tags, created_at, ' + AUTHOR_JOIN)
            .order('created_at', { ascending: false });
        if (error) return { ok: false, error: supabaseErrorMessage(loadCommunityError(), error) };
        const rows = (data ?? []) as unknown as SharedPresetRow[];
        return { ok: true, data: rows.map(rowToPreset).filter((item): item is CommunityPreset => item !== null) };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(loadCommunityError(), error) };
    }
}

// Mismo payload saneado para insert y update: editar no puede colar lo que el alta bloquea.
type Payload<T> = { ok: true; row: T } | { ok: false; error: LocalMessage };

function themePayload(theme: WheelTheme): Payload<Record<string, unknown>> {
    const name = normalizeText(theme.name, MAX_SHARED_NAME);
    if (!name) return { ok: false, error: dictMessage('errors', 'themeNoName') };
    const clean = sanitizeTheme({ ...theme, name });
    if (!clean) return { ok: false, error: dictMessage('errors', 'themeInvalid') };
    return {
        ok: true,
        row: {
            name: clean.name,
            description: normalizeText(theme.description ?? '', MAX_SHARED_DESCRIPTION) || null,
            style_tag: normalizeText(theme.styleTag ?? '', MAX_SHARED_NAME) || null,
            category: normalizeText(theme.category ?? '', MAX_SHARED_NAME) || null,
            segments: clean.segments,
            border_color: clean.borderColor ?? null,
            center_color: clean.centerColor ?? null,
            pointer_color: clean.pointerColor ?? null,
            // Solo si hay valor: sin la columna creada, compartir temas sin luces sigue funcionando.
            ...(clean.lightColor ? { light_color: clean.lightColor } : {}),
        },
    };
}

function presetPayload(preset: WheelPreset): Payload<Record<string, unknown>> {
    const name = normalizeText(preset.name, MAX_SHARED_NAME);
    if (!name) return { ok: false, error: dictMessage('errors', 'presetNoName') };
    const clean = sanitizePreset({ ...preset, name });
    if (!clean) return { ok: false, error: dictMessage('errors', 'presetInvalid') };
    const tags = (clean.tags ?? [])
        .map((tag) => normalizeText(tag, 24))
        .filter(Boolean)
        .slice(0, MAX_SHARED_TAGS);
    return { ok: true, row: { name: clean.name, options: clean.options, theme: clean.theme, tags } };
}

export async function shareTheme(theme: WheelTheme): Promise<ServiceResult<true>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const shareError = dictMessage('errors', 'shareTheme');
    try {
        const userId = await getCurrentUserId();
        if (!userId) return { ok: false, error: noSessionError() };
        const payload = themePayload(theme);
        if (!payload.ok) return { ok: false, error: payload.error };
        const { error } = await supabase.from('shared_themes').insert({ ...payload.row, author_id: userId });
        if (error) return { ok: false, error: supabaseErrorMessage(shareError, error) };
        return { ok: true, data: true };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(shareError, error) };
    }
}

export async function sharePreset(preset: WheelPreset): Promise<ServiceResult<true>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const shareError = dictMessage('errors', 'sharePreset');
    try {
        const userId = await getCurrentUserId();
        if (!userId) return { ok: false, error: noSessionError() };
        const payload = presetPayload(preset);
        if (!payload.ok) return { ok: false, error: payload.error };
        const { error } = await supabase.from('shared_presets').insert({ ...payload.row, author_id: userId });
        if (error) return { ok: false, error: supabaseErrorMessage(shareError, error) };
        return { ok: true, data: true };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(shareError, error) };
    }
}

type SharedTable = 'shared_themes' | 'shared_presets';

// author_id nunca va en el payload, así que no se puede reasignar. RLS en UPDATE/DELETE
// no da error, filtra: .select('id') devuelve las filas tocadas y 0 significa bloqueado.
async function updateOwnRow(table: SharedTable, id: string, row: Record<string, unknown>, fallback: LocalMessage): Promise<ServiceResult<true>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    try {
        const userId = await getCurrentUserId();
        if (!userId) return { ok: false, error: noSessionError() };
        const { data, error } = await supabase
            .from(table)
            .update(row)
            .eq('id', id)
            .eq('author_id', userId)
            .select('id');
        if (error) return { ok: false, error: supabaseErrorMessage(fallback, error) };
        if (!data || data.length === 0) return { ok: false, error: dictMessage('errors', 'cloudUpdateBlocked') };
        return { ok: true, data: true };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(fallback, error) };
    }
}

async function deleteOwnRow(table: SharedTable, id: string, fallback: LocalMessage): Promise<ServiceResult<true>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    try {
        const userId = await getCurrentUserId();
        if (!userId) return { ok: false, error: noSessionError() };
        const { data, error } = await supabase
            .from(table)
            .delete()
            .eq('id', id)
            .eq('author_id', userId)
            .select('id');
        if (error) return { ok: false, error: supabaseErrorMessage(fallback, error) };
        if (!data || data.length === 0) return { ok: false, error: dictMessage('errors', 'cloudDeleteBlocked') };
        return { ok: true, data: true };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(fallback, error) };
    }
}

export async function updateSharedTheme(id: string, theme: WheelTheme): Promise<ServiceResult<true>> {
    const payload = themePayload(theme);
    if (!payload.ok) return { ok: false, error: payload.error };
    return updateOwnRow('shared_themes', id, payload.row, dictMessage('errors', 'cloudUpdate'));
}

export async function updateSharedPreset(id: string, preset: WheelPreset): Promise<ServiceResult<true>> {
    const payload = presetPayload(preset);
    if (!payload.ok) return { ok: false, error: payload.error };
    return updateOwnRow('shared_presets', id, payload.row, dictMessage('errors', 'cloudUpdate'));
}

export async function deleteSharedTheme(id: string): Promise<ServiceResult<true>> {
    return deleteOwnRow('shared_themes', id, dictMessage('errors', 'cloudDelete'));
}

export async function deleteSharedPreset(id: string): Promise<ServiceResult<true>> {
    return deleteOwnRow('shared_presets', id, dictMessage('errors', 'cloudDelete'));
}
