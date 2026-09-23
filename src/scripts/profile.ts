// Perfil anónimo: nombre de usuario y foto opcional, sin email ni contraseña.
// signInAnonymously() crea la sesión y la fila de profiles usa su uid como id.
import {
    getSupabase,
    hasStoredSession,
    isSupabaseLoaded,
    onSupabaseReady,
    supabaseErrorMessage,
    isAllowedImageMime,
    MAX_UPLOAD_BYTES,
    normalizeText,
    notConfiguredError,
    type ServiceResult,
} from './supabaseClient';
import { dictMessage, dictMessageWith, type LocalMessage } from './strings';

export type SpinlyProfile = {
    id: string;
    username: string;
    avatar_url: string | null;
};

export const MAX_USERNAME_LENGTH = 24;

function validateUsername(username: string): LocalMessage | null {
    if (!username) return dictMessage('errors', 'typeUsername');
    if (username.length > MAX_USERNAME_LENGTH) return dictMessage('errors', 'usernameTooLong', { max: MAX_USERNAME_LENGTH });
    return null;
}

/**
 * Restaura en silencio la sesión anónima guardada; nunca crea una nueva. La única
 * forma de crear sesión es createAnonymousProfile (formulario de perfil).
 */
export async function ensureSession(): Promise<string | null> {
    return getCurrentUserId();
}

/** uid de la sesión actual o null. Sin sesión guardada no descarga el SDK. */
export async function getCurrentUserId(): Promise<string | null> {
    if (!isSupabaseLoaded() && !hasStoredSession()) return null;
    const supabase = await getSupabase();
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) return null;
        return data.session?.user.id ?? null;
    } catch {
        return null;
    }
}

/** Se engancha cuando el cliente exista (al crear perfil, por ejemplo) sin forzar su descarga. */
export function onAuthChange(callback: (userId: string | null) => void): () => void {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    const stopWaiting = onSupabaseReady((client) => {
        if (!active) return;
        const { data } = client.auth.onAuthStateChange((_event, session) => {
            callback(session?.user.id ?? null);
        });
        unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
        active = false;
        stopWaiting();
        unsubscribe?.();
    };
}

/** data = null si hay sesión pero todavía no hay fila de perfil. */
export async function fetchProfile(userId: string): Promise<ServiceResult<SpinlyProfile | null>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const readError = dictMessage('errors', 'readProfile');
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', userId)
            .maybeSingle();
        if (error) return { ok: false, error: supabaseErrorMessage(readError, error) };
        const row = data as { id: string; username: string; avatar_url: string | null } | null;
        if (!row) return { ok: true, data: null };
        return { ok: true, data: { id: row.id, username: row.username, avatar_url: row.avatar_url ?? null } };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(readError, error) };
    }
}

// La política de Storage exige que la carpeta sea el uid del autor.
async function uploadAvatar(userId: string, file: File): Promise<ServiceResult<string>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    if (!isAllowedImageMime(file.type)) return { ok: false, error: dictMessage('errors', 'badFormat') };
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: dictMessage('errors', 'photoTooBig') };
    const uploadError = dictMessage('errors', 'uploadPhoto');
    try {
        const extension = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const path = `${userId}/avatar_${Date.now()}.${extension}`;
        const { error } = await supabase.storage.from('avatars').upload(path, file, {
            cacheControl: '3600',
            contentType: file.type,
        });
        if (error) return { ok: false, error: supabaseErrorMessage(uploadError, error) };
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        if (!data?.publicUrl) return { ok: false, error: dictMessage('errors', 'photoUrl') };
        return { ok: true, data: data.publicUrl };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(uploadError, error) };
    }
}

async function saveProfileRow(
    base: SpinlyProfile,
    avatarFile: File | null
): Promise<ServiceResult<SpinlyProfile>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const username = normalizeText(base.username, MAX_USERNAME_LENGTH);
    const invalid = validateUsername(username);
    if (invalid) return { ok: false, error: invalid };

    let avatarUrl = base.avatar_url;
    let warning: LocalMessage | undefined;
    if (avatarFile) {
        const uploaded = await uploadAvatar(base.id, avatarFile);
        if (uploaded.ok) avatarUrl = uploaded.data;
        else warning = dictMessageWith('errors', 'savedWithoutPhoto', { error: uploaded.error });
    }

    const { error } = await supabase.from('profiles').upsert({
        id: base.id,
        username: username,
        avatar_url: avatarUrl,
    });
    if (error) return { ok: false, error: supabaseErrorMessage(dictMessage('errors', 'saveProfile'), error) };

    const profile: SpinlyProfile = { id: base.id, username: username, avatar_url: avatarUrl };
    return warning ? { ok: true, data: profile, warning } : { ok: true, data: profile };
}

export async function createAnonymousProfile(input: {
    username: string;
    avatarFile?: File | null;
}): Promise<ServiceResult<SpinlyProfile>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const username = normalizeText(input.username, MAX_USERNAME_LENGTH);
    const invalid = validateUsername(username);
    if (invalid) return { ok: false, error: invalid };
    const signInError = dictMessage('errors', 'signIn');
    try {
        const { data, error } = await supabase.auth.signInAnonymously({
            options: { data: { username } },
        });
        if (error) return { ok: false, error: supabaseErrorMessage(signInError, error) };
        const userId = data.user?.id ?? data.session?.user.id;
        if (!userId) return { ok: false, error: dictMessage('errors', 'anonSession') };
        return await saveProfileRow({ id: userId, username, avatar_url: null }, input.avatarFile ?? null);
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(signInError, error) };
    }
}

// No hay signOut en la app: editar nunca invalida la sesión anónima.
export async function updateProfile(
    profile: SpinlyProfile,
    avatarFile?: File | null
): Promise<ServiceResult<SpinlyProfile>> {
    return saveProfileRow(profile, avatarFile ?? null);
}
