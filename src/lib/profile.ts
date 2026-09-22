// Perfil SOLO con nombre de usuario + foto opcional: NUNCA email ni contraseña.
// Flujo: signInAnonymously() → fila en profiles (id = uid de la sesión anónima).
import {
    supabase,
    supabaseErrorMessage,
    isAllowedImageMime,
    MAX_UPLOAD_BYTES,
    normalizeText,
    SUPABASE_NOT_CONFIGURED_ERROR,
    type ServiceResult,
} from './supabaseClient';

export type SpinlyProfile = {
    id: string;
    username: string;
    avatar_url: string | null;
};

export const MAX_USERNAME_LENGTH = 24;

function validateUsername(username: string): string | null {
    if (!username) return 'Escribe un nombre de usuario.';
    if (username.length > MAX_USERNAME_LENGTH) return `Máximo ${MAX_USERNAME_LENGTH} caracteres.`;
    return null;
}

// uid de la sesión actual (anónima) o null si no hay sesión / Supabase apagado.
// La sesión anónima persiste en localStorage: al recargar se mantiene el "login".
export async function getCurrentUserId(): Promise<string | null> {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) return null;
        return data.session?.user.id ?? null;
    } catch {
        return null;
    }
}

// Suscripción a cambios de sesión (mismo patrón reactivo que el resto de la app).
export function onAuthChange(callback: (userId: string | null) => void): () => void {
    if (!supabase) return () => undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        callback(session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
}

// Lee la fila del perfil; data = null si la sesión existe pero aún no hay fila.
export async function fetchProfile(userId: string): Promise<ServiceResult<SpinlyProfile | null>> {
    if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_ERROR };
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', userId)
            .maybeSingle();
        if (error) return { ok: false, error: supabaseErrorMessage('No se pudo leer el perfil.', error) };
        const row = data as { id: string; username: string; avatar_url: string | null } | null;
        if (!row) return { ok: true, data: null };
        return { ok: true, data: { id: row.id, username: row.username, avatar_url: row.avatar_url ?? null } };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage('No se pudo leer el perfil.', error) };
    }
}

// Sube la foto al bucket público "avatars" (carpeta = uid, según la política de Storage).
async function uploadAvatar(userId: string, file: File): Promise<ServiceResult<string>> {
    if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_ERROR };
    if (!isAllowedImageMime(file.type)) return { ok: false, error: 'Formato no permitido: usa PNG, JPEG o WEBP.' };
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'La foto no puede superar ~2MB.' };
    try {
        const extension = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const path = `${userId}/avatar_${Date.now()}.${extension}`;
        const { error } = await supabase.storage.from('avatars').upload(path, file, {
            cacheControl: '3600',
            contentType: file.type,
        });
        if (error) return { ok: false, error: supabaseErrorMessage('No se pudo subir la foto.', error) };
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        if (!data?.publicUrl) return { ok: false, error: 'No se pudo obtener la URL de la foto.' };
        return { ok: true, data: data.publicUrl };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage('No se pudo subir la foto.', error) };
    }
}

// Guarda/actualiza la fila en profiles (alta y edición comparten el mismo camino).
async function saveProfileRow(
    base: SpinlyProfile,
    avatarFile: File | null
): Promise<ServiceResult<SpinlyProfile>> {
    if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_ERROR };
    const username = normalizeText(base.username, MAX_USERNAME_LENGTH);
    const invalid = validateUsername(username);
    if (invalid) return { ok: false, error: invalid };

    let avatarUrl = base.avatar_url;
    let warning: string | undefined;
    if (avatarFile) {
        const uploaded = await uploadAvatar(base.id, avatarFile);
        if (uploaded.ok) avatarUrl = uploaded.data;
        else warning = `${uploaded.error} Se guardó el perfil sin foto nueva.`;
    }

    const { error } = await supabase.from('profiles').upsert({
        id: base.id,
        username: username,
        avatar_url: avatarUrl,
    });
    if (error) return { ok: false, error: supabaseErrorMessage('No se pudo guardar el perfil.', error) };

    const profile: SpinlyProfile = { id: base.id, username: username, avatar_url: avatarUrl };
    return warning ? { ok: true, data: profile, warning } : { ok: true, data: profile };
}

// Primera vez SIN sesión: sesión anónima (sin email) + fila en profiles.
export async function createAnonymousProfile(input: {
    username: string;
    avatarFile?: File | null;
}): Promise<ServiceResult<SpinlyProfile>> {
    if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_ERROR };
    const username = normalizeText(input.username, MAX_USERNAME_LENGTH);
    const invalid = validateUsername(username);
    if (invalid) return { ok: false, error: invalid };
    try {
        const { data, error } = await supabase.auth.signInAnonymously({
            options: { data: { username } },
        });
        if (error) return { ok: false, error: supabaseErrorMessage('No se pudo iniciar sesión.', error) };
        const userId = data.user?.id ?? data.session?.user.id;
        if (!userId) return { ok: false, error: 'No se pudo crear la sesión anónima.' };
        return await saveProfileRow({ id: userId, username, avatar_url: null }, input.avatarFile ?? null);
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage('No se pudo iniciar sesión.', error) };
    }
}

// "Editar perfil": mismo formulario con sesión ya iniciada, sin email en ningún punto.
export async function updateProfile(
    profile: SpinlyProfile,
    avatarFile?: File | null
): Promise<ServiceResult<SpinlyProfile>> {
    if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_ERROR };
    return saveProfileRow(profile, avatarFile ?? null);
}

// Cerrar sesión: revoca la sesión anónima local. El estado de UI (perfil, userId,
// borradores) lo limpia Header al recibir el evento SIGNED_OUT del listener.
export async function signOutProfile(): Promise<ServiceResult<true>> {
    if (!supabase) return { ok: false, error: SUPABASE_NOT_CONFIGURED_ERROR };
    try {
        const { error } = await supabase.auth.signOut();
        if (error) return { ok: false, error: supabaseErrorMessage('No se pudo cerrar la sesión.', error) };
        return { ok: true, data: true };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage('No se pudo cerrar la sesión.', error) };
    }
}