// Cuentas: nombre de usuario, contraseña y foto opcional; el usuario nunca ve un email.
// La cuenta nace anónima (signInAnonymously, uid = id de profiles) y al ponerle contraseña se
// le asigna un email interno derivado del uid. Para entrar: nombre → uid (profiles es pública)
// → email interno → signInWithPassword. Requiere "Confirm email" desactivado en Supabase.
import {
    getSupabase,
    hasStoredSession,
    isSupabaseLoaded,
    onSupabaseReady,
    supabaseErrorMessage,
    isAllowedImageMime,
    MAX_UPLOAD_BYTES,
    MIN_PASSWORD_LENGTH,
    normalizeText,
    notConfiguredError,
    type ServiceResult,
} from './supabaseClient';
import { dictMessage, dictMessageWith, type LocalMessage } from './strings';
import { shrinkImage } from './image-resize';

export type SpinlyProfile = {
    id: string;
    username: string;
    avatar_url: string | null;
};

export const MAX_USERNAME_LENGTH = 24;
export { MIN_PASSWORD_LENGTH };
// Límite de bcrypt en Supabase: lo que pase de 72 bytes se ignoraría en silencio.
const MAX_PASSWORD_LENGTH = 72;

export type AccountSession = { userId: string; isAnonymous: boolean };

/** Dominio reservado (RFC 2606): a una dirección .invalid nunca puede llegar correo. */
const loginEmail = (userId: string): string => `${userId}@spinly.invalid`;

function validateUsername(username: string): LocalMessage | null {
    if (!username) return dictMessage('errors', 'typeUsername');
    if (username.length > MAX_USERNAME_LENGTH) return dictMessage('errors', 'usernameTooLong', { max: MAX_USERNAME_LENGTH });
    return null;
}

// Los mismos conjuntos que comprueba Supabase con "lowercase, uppercase, digits and symbols".
const PASSWORD_SYMBOLS = /[!@#$%^&*()_+\-=[\]{};':"|<>?,./`~]/;

export type PasswordCheck = 'length' | 'lower' | 'upper' | 'digit' | 'symbol' | 'noName';

/**
 * Requisitos de una contraseña segura, uno a uno (el formulario los muestra en vivo).
 * noName: no puede contener el nombre de usuario, lo primero que probaría un atacante.
 */
export function passwordChecks(password: string, username = ''): Record<PasswordCheck, boolean> {
    const name = username.trim().toLowerCase();
    return {
        length: password.length >= MIN_PASSWORD_LENGTH,
        lower: /[a-z]/.test(password),
        upper: /[A-Z]/.test(password),
        digit: /[0-9]/.test(password),
        symbol: PASSWORD_SYMBOLS.test(password),
        noName: name.length < 3 || !password.toLowerCase().includes(name),
    };
}

export function validatePassword(password: string, username = ''): LocalMessage | null {
    if (Object.values(passwordChecks(password, username)).some((ok) => !ok)) {
        return dictMessage('errors', 'passwordWeak', { min: MIN_PASSWORD_LENGTH });
    }
    // Bytes en UTF-8: cada %XX de encodeURIComponent es un byte. Un surrogate suelto la hace fallar.
    let bytes = Infinity;
    try {
        bytes = encodeURIComponent(password).replace(/%[0-9A-F]{2}/gi, '_').length;
    } catch {
        // Texto no representable en UTF-8: se rechaza como demasiado largo.
    }
    if (bytes > MAX_PASSWORD_LENGTH) return dictMessage('errors', 'passwordTooLong');
    return null;
}

type SessionLike = { user: { id: string; is_anonymous?: boolean } } | null | undefined;
const toAccountSession = (session: SessionLike): AccountSession | null =>
    session ? { userId: session.user.id, isAnonymous: session.user.is_anonymous !== false } : null;

/**
 * Restaura en silencio la sesión guardada; nunca crea una nueva. Solo se crea sesión
 * desde el menú de perfil (crear cuenta o iniciar sesión).
 */
export async function ensureSession(): Promise<string | null> {
    return getCurrentUserId();
}

/** Sesión actual o null. Sin sesión guardada no descarga el SDK. */
export async function getCurrentSession(): Promise<AccountSession | null> {
    if (!isSupabaseLoaded() && !hasStoredSession()) return null;
    const supabase = await getSupabase();
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) return null;
        return toAccountSession(data.session);
    } catch {
        return null;
    }
}

export async function getCurrentUserId(): Promise<string | null> {
    return (await getCurrentSession())?.userId ?? null;
}

/** Se engancha cuando el cliente exista (al crear perfil, por ejemplo) sin forzar su descarga. */
export function onAuthChange(callback: (userId: string | null, isAnonymous: boolean) => void): () => void {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    const stopWaiting = onSupabaseReady((client) => {
        if (!active) return;
        const { data } = client.auth.onAuthStateChange((_event, session) => {
            const account = toAccountSession(session);
            callback(account?.userId ?? null, account?.isAnonymous ?? true);
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

const AVATAR_MAX_SIDE = 512;
// file_size_limit del bucket avatars (README).
const AVATAR_BUCKET_BYTES = 2 * 1024 * 1024;

// La política de Storage exige que la carpeta sea el uid del autor.
async function uploadAvatar(userId: string, file: File): Promise<ServiceResult<string>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    if (!isAllowedImageMime(file.type)) return { ok: false, error: dictMessage('errors', 'badFormat') };
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: dictMessage('errors', 'photoTooBig') };
    const uploadError = dictMessage('errors', 'uploadPhoto');
    try {
        // Se muestra como mucho a ~80 px: con 512 sobra y cabe siempre en el límite del bucket (2 MB).
        const photo = await shrinkImage(file, AVATAR_MAX_SIDE);
        if (!isAllowedImageMime(photo.type) || photo.size > AVATAR_BUCKET_BYTES) return { ok: false, error: dictMessage('errors', 'photoTooBig') };
        const extension = photo.type.split('/')[1] === 'jpeg' ? 'jpg' : photo.type.split('/')[1];
        const path = `${userId}/avatar_${Date.now()}.${extension}`;
        const { error } = await supabase.storage.from('avatars').upload(path, photo, {
            cacheControl: '3600',
            contentType: photo.type,
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

/**
 * Crea la cuenta: sesión anónima, fila de profiles y contraseña, en ese orden. Si falla solo
 * la contraseña, el perfil existe igualmente y se avisa (luego se puede poner desde el menú).
 */
export async function createAccount(input: {
    username: string;
    password: string;
    avatarFile?: File | null;
}): Promise<ServiceResult<SpinlyProfile>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const username = normalizeText(input.username, MAX_USERNAME_LENGTH);
    const invalid = validateUsername(username) ?? validatePassword(input.password, username);
    if (invalid) return { ok: false, error: invalid };
    const signInError = dictMessage('errors', 'signIn');
    try {
        const { data, error } = await supabase.auth.signInAnonymously({
            options: { data: { username } },
        });
        if (error) return { ok: false, error: supabaseErrorMessage(signInError, error) };
        const userId = data.user?.id ?? data.session?.user.id;
        if (!userId) return { ok: false, error: dictMessage('errors', 'anonSession') };
        const saved = await saveProfileRow({ id: userId, username, avatar_url: null }, input.avatarFile ?? null);
        if (!saved.ok) return saved;
        const protectedAccount = await setAccountPassword(input.password);
        if (!protectedAccount.ok) {
            return { ok: true, data: saved.data, warning: dictMessageWith('errors', 'createdWithoutPassword', { error: protectedAccount.error }) };
        }
        return saved;
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(signInError, error) };
    }
}

/**
 * Pone la contraseña a la cuenta de la sesión actual. Si aún es anónima le asigna además el
 * email interno, lo que la convierte en permanente conservando uid, perfil y lo compartido.
 * refreshSession: el JWT deja de ser anónimo al momento (el bucket user-data lo exige).
 */
export async function setAccountPassword(password: string): Promise<ServiceResult<true>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const invalid = validatePassword(password);
    if (invalid) return { ok: false, error: invalid };
    const failed = dictMessage('errors', 'setPassword');
    try {
        const { data: current } = await supabase.auth.getSession();
        const account = toAccountSession(current.session);
        if (!account) return { ok: false, error: dictMessage('errors', 'noSessionAccount') };
        const { data: updated, error } = await supabase.auth.updateUser(
            account.isAnonymous ? { email: loginEmail(account.userId), password } : { password },
        );
        if (error) return { ok: false, error: supabaseErrorMessage(failed, error) };
        // Con "Confirm email" activo el email queda pendiente de un correo que nunca llegará.
        if (account.isAnonymous && updated.user?.email !== loginEmail(account.userId)) {
            return { ok: false, error: dictMessage('errors', 'confirmEmailEnabled') };
        }
        await supabase.auth.refreshSession();
        return { ok: true, data: true };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(failed, error) };
    }
}

/**
 * Entra con nombre y contraseña. El error es el mismo si el nombre no existe o la contraseña
 * falla, para no revelar qué cuentas hay. El uid de la sesión debe ser el del nombre buscado:
 * el uid es público y otra cuenta podría haberse puesto su email interno para suplantarla.
 */
export async function signInWithUsername(usernameInput: string, password: string): Promise<ServiceResult<string>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const username = normalizeText(usernameInput, MAX_USERNAME_LENGTH);
    const badCredentials = dictMessage('errors', 'badCredentials');
    if (!username || !password) return { ok: false, error: badCredentials };
    const signInError = dictMessage('errors', 'signIn');
    try {
        const { data: row, error: lookupError } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', username)
            .maybeSingle();
        if (lookupError) return { ok: false, error: supabaseErrorMessage(signInError, lookupError) };
        const expectedId = (row as { id?: string } | null)?.id;
        if (!expectedId) return { ok: false, error: badCredentials };
        const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail(expectedId), password });
        if (error) return { ok: false, error: supabaseErrorMessage(signInError, error) };
        if (data.user?.id !== expectedId) {
            await supabase.auth.signOut({ scope: 'local' });
            return { ok: false, error: badCredentials };
        }
        return { ok: true, data: expectedId };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(signInError, error) };
    }
}

/**
 * Comprueba la contraseña actual antes de cambiarla: con una sesión robada no basta para
 * quedarse la cuenta. Sin email no hay reautenticación en el servidor; esto es lo máximo.
 */
export async function changePassword(currentPassword: string, nextPassword: string): Promise<ServiceResult<true>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    const invalid = validatePassword(nextPassword);
    if (invalid) return { ok: false, error: invalid };
    try {
        const { data } = await supabase.auth.getSession();
        const account = toAccountSession(data.session);
        if (!account || account.isAnonymous) return { ok: false, error: dictMessage('errors', 'noSessionAccount') };
        const { data: check, error } = await supabase.auth.signInWithPassword({ email: loginEmail(account.userId), password: currentPassword });
        if (error || check.user?.id !== account.userId) return { ok: false, error: dictMessage('errors', 'wrongCurrentPassword') };
        return await setAccountPassword(nextPassword);
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(dictMessage('errors', 'setPassword'), error) };
    }
}

/** Cierra la sesión solo en este dispositivo: las de otros dispositivos siguen abiertas. */
export async function signOut(): Promise<ServiceResult<true>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) return { ok: false, error: supabaseErrorMessage(dictMessage('errors', 'signOut'), error) };
        return { ok: true, data: true };
    } catch (error) {
        return { ok: false, error: supabaseErrorMessage(dictMessage('errors', 'signOut'), error) };
    }
}

export async function updateProfile(
    profile: SpinlyProfile,
    avatarFile?: File | null
): Promise<ServiceResult<SpinlyProfile>> {
    return saveProfileRow(profile, avatarFile ?? null);
}
