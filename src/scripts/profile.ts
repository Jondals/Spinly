/**
 * Accounts: a username, a password and an optional photo; the user never sees an email.
 * An account is born anonymous (signInAnonymously, uid = profiles id) and, when it gets a password, it
 * is given an internal email derived from the uid. Signing in: name → uid (profiles is public) →
 * internal email → signInWithPassword. Requires "Confirm email" to be off in Supabase.
 */
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
// Supabase's bcrypt limit: anything past 72 bytes would be silently ignored.
const MAX_PASSWORD_LENGTH = 72;

export type AccountSession = { userId: string; isAnonymous: boolean };

/** Reserved domain (RFC 2606): an .invalid address can never receive mail. */
const loginEmail = (userId: string): string => `${userId}@spinly.invalid`;

/** Checks that a username is present and not too long. */
function validateUsername(username: string): LocalMessage | null {
    if (!username) return dictMessage('errors', 'typeUsername');
    if (username.length > MAX_USERNAME_LENGTH) return dictMessage('errors', 'usernameTooLong', { max: MAX_USERNAME_LENGTH });
    return null;
}

// The same character sets Supabase checks with "lowercase, uppercase, digits and symbols".
const PASSWORD_SYMBOLS = /[!@#$%^&*()_+\-=[\]{};':"|<>?,./`~]/;

export type PasswordCheck = 'length' | 'lower' | 'upper' | 'digit' | 'symbol' | 'noName';

/**
 * Requirements of a strong password, one by one (the form shows them live).
 * noName: it cannot contain the username, the first thing an attacker would try.
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

/** Validates a new password: every requirement met and at most 72 UTF-8 bytes. */
export function validatePassword(password: string, username = ''): LocalMessage | null {
    if (Object.values(passwordChecks(password, username)).some((ok) => !ok)) {
        return dictMessage('errors', 'passwordWeak', { min: MIN_PASSWORD_LENGTH });
    }
    // UTF-8 bytes: each %XX of encodeURIComponent is one byte. A lone surrogate makes it throw.
    let bytes = Infinity;
    try {
        bytes = encodeURIComponent(password).replace(/%[0-9A-F]{2}/gi, '_').length;
    } catch {
        // Text that cannot be encoded as UTF-8: rejected as too long.
    }
    if (bytes > MAX_PASSWORD_LENGTH) return dictMessage('errors', 'passwordTooLong');
    return null;
}

type SessionLike = { user: { id: string; is_anonymous?: boolean } } | null | undefined;
/** Reduces a Supabase session to the app's AccountSession. */
const toAccountSession = (session: SessionLike): AccountSession | null =>
    session ? { userId: session.user.id, isAnonymous: session.user.is_anonymous !== false } : null;

/**
 * Silently restores the saved session; it never creates a new one. Sessions are only created from the
 * profile menu (create an account or sign in).
 */
export async function ensureSession(): Promise<string | null> {
    return getCurrentUserId();
}

/** Current session or null. Without a saved session it does not download the SDK. */
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

/** Current user id or null. */
export async function getCurrentUserId(): Promise<string | null> {
    return (await getCurrentSession())?.userId ?? null;
}

/** Subscribes to auth changes once the client exists (e.g. after creating a profile) without forcing its download. */
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

/** Reads a profile. data = null if there is a session but no profile row yet. */
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
// file_size_limit of the avatars bucket (README).
const AVATAR_BUCKET_BYTES = 2 * 1024 * 1024;

/** Uploads a profile photo and returns its public URL. The Storage policy requires the folder to be the author's uid. */
async function uploadAvatar(userId: string, file: File): Promise<ServiceResult<string>> {
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: notConfiguredError() };
    if (!isAllowedImageMime(file.type)) return { ok: false, error: dictMessage('errors', 'badFormat') };
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: dictMessage('errors', 'photoTooBig') };
    const uploadError = dictMessage('errors', 'uploadPhoto');
    try {
        // It is shown at ~80 px at most: 512 is plenty and always fits the bucket limit (2 MB).
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

/** Validates the name, uploads the photo if any and upserts the profiles row. */
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
 * Creates the account: anonymous session, profiles row and password, in that order. If only the
 * password fails, the profile exists anyway and a warning is shown (it can be set later from the menu).
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
 * Sets the password of the current session's account. If it is still anonymous it also gets the
 * internal email, which makes it permanent while keeping its uid, profile and shared items.
 * refreshSession: the JWT stops being anonymous right away (the user-data bucket requires it).
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
        // With "Confirm email" on, the email would wait for a message that never arrives.
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
 * Signs in with a name and a password. The error is the same whether the name does not exist or the
 * password is wrong, so it does not reveal which accounts exist. The session's uid must match the
 * looked-up name: uids are public and another account could have set that internal email to impersonate it.
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
 * Checks the current password before changing it, so a stolen session is not enough to take over the
 * account. Without email there is no server-side reauthentication; this is the most that can be done.
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

/** Signs out on this device only: sessions on other devices stay open. */
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

/** Saves profile changes (name and, optionally, a new photo). */
export async function updateProfile(
    profile: SpinlyProfile,
    avatarFile?: File | null
): Promise<ServiceResult<SpinlyProfile>> {
    return saveProfileRow(profile, avatarFile ?? null);
}
