import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Avatar from '../common/Avatar';
import StatusMessage from '../common/StatusMessage';
import { useTranslation } from '../i18n/LanguageProvider';
import { useDismiss } from '../../hooks/useDismiss';
import { dictMessage, type LocalMessage } from '../../scripts/strings';
import {
    createAnonymousProfile,
    ensureSession,
    fetchProfile,
    onAuthChange,
    updateProfile,
    MAX_USERNAME_LENGTH,
    type SpinlyProfile,
} from '../../scripts/profile';
import { isAllowedImageMime, isSupabaseConfigured, MAX_UPLOAD_BYTES, notConfiguredError } from '../../scripts/supabaseClient';

/**
 * Perfil anónimo (nombre y foto opcional). No hay cierre de sesión: editar el perfil
 * nunca invalida la sesión anónima.
 */
function ProfileMenu() {
    const { t, tm } = useTranslation();
    const [profile, setProfile] = useState<SpinlyProfile | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draftName, setDraftName] = useState('');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [formError, setFormError] = useState<LocalMessage | null>(null);
    const [formWarning, setFormWarning] = useState<LocalMessage | null>(null);
    const [saving, setSaving] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useDismiss(open, () => setOpen(false), [rootRef]);

    // Restaura la sesión guardada si existe; un visitante nuevo sigue en modo local.
    useEffect(() => {
        let alive = true;
        let lastLoadedId: string | null = null;

        const loadProfile = async (id: string | null) => {
            if (!alive) return;
            setUserId(id);
            if (!id) {
                lastLoadedId = null;
                setProfile(null);
                return;
            }
            if (lastLoadedId === id) return;
            lastLoadedId = id;
            const result = await fetchProfile(id);
            if (alive && lastLoadedId === id && result.ok) setProfile(result.data);
        };

        void ensureSession().then(loadProfile);
        const unsubscribe = onAuthChange((id) => { void loadProfile(id); });
        return () => {
            alive = false;
            unsubscribe();
        };
    }, []);

    const resetForm = (nextEditing: boolean) => {
        setEditing(nextEditing);
        setDraftName(profile?.username ?? '');
        setFormError(null);
        setFormWarning(null);
        setAvatarFile(null);
        setAvatarPreview(null);
    };

    const toggleOpen = () => {
        if (!open) resetForm(false);
        setOpen(!open);
    };

    const handleAvatarFile = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        setFormError(null);
        setAvatarFile(null);
        setAvatarPreview(null);
        if (!file) return;
        const invalid = !isAllowedImageMime(file.type) ? 'badFormat' : file.size > MAX_UPLOAD_BYTES ? 'photoTooBig' : null;
        if (invalid) {
            setFormError(dictMessage('errors', invalid));
            event.target.value = '';
            return;
        }
        setAvatarFile(file);
        const reader = new FileReader();
        reader.onload = () => setAvatarPreview(String(reader.result ?? ''));
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const username = draftName.trim();
        setFormError(null);
        setFormWarning(null);
        if (!username) {
            setFormError(dictMessage('errors', 'typeUsername'));
            return;
        }
        setSaving(true);
        try {
            const result = userId
                ? await updateProfile({ id: userId, username, avatar_url: profile?.avatar_url ?? null }, avatarFile)
                : await createAnonymousProfile({ username, avatarFile });
            if (!result.ok) {
                setFormError(result.error);
                return;
            }
            setProfile(result.data);
            setUserId(result.data.id);
            setDraftName(result.data.username);
            setAvatarFile(null);
            setAvatarPreview(null);
            setEditing(false);
            if (result.warning) setFormWarning(result.warning);
        } catch {
            setFormError(dictMessage('common', 'unexpected'));
        } finally {
            setSaving(false);
        }
    };

    const photoAlt = profile ? t('common', 'photoOf', { name: profile.username }) : t('common', 'noPhoto');
    const buttonLabel = open
        ? t('header', 'closeProfile')
        : profile ? t('header', 'profileOf', { name: profile.username }) : t('header', 'openProfile');

    return (
        <div className="spinly-profile" ref={rootRef}>
            <button
                type="button"
                className="spinly-profile-button"
                onClick={toggleOpen}
                aria-label={buttonLabel}
                aria-expanded={open}
                aria-haspopup="dialog"
            >
                <Avatar src={profile?.avatar_url ?? null} size="md" alt={photoAlt} />
            </button>

            {open && (
                <div className="spinly-profile-menu" role="dialog" aria-label={t('header', 'profileDialog')}>
                    {!isSupabaseConfigured && (
                        <StatusMessage tone="error">{tm(notConfiguredError())} {t('header', 'noSupabase')}</StatusMessage>
                    )}

                    {userId && profile && !editing ? (
                        <>
                            <div className="spinly-profile-head">
                                <Avatar src={profile.avatar_url} size="lg" alt={photoAlt} />
                                <span className="spinly-profile-username">{profile.username}</span>
                            </div>
                            <button type="button" className="spinly-action-btn" onClick={() => resetForm(true)}>
                                {t('header', 'editProfile')}
                            </button>
                        </>
                    ) : (
                        <form className="spinly-profile-form" onSubmit={handleSubmit}>
                            <p className="spinly-profile-title">
                                {editing ? t('header', 'editProfileTitle') : t('header', 'createProfile')}
                            </p>
                            <label className="spinly-profile-field">
                                <span>{t('header', 'username')}</span>
                                <input
                                    type="text"
                                    value={draftName}
                                    onChange={(event) => setDraftName(event.target.value)}
                                    maxLength={MAX_USERNAME_LENGTH}
                                    placeholder={t('header', 'usernamePh')}
                                    autoComplete="off"
                                    required
                                />
                            </label>
                            <label className="spinly-profile-field">
                                <span>{t('header', 'photo')}</span>
                                <input type="file" accept="image/*" onChange={handleAvatarFile} />
                            </label>
                            {avatarPreview && (
                                <Avatar src={avatarPreview} size="lg" alt={t('header', 'preview')} className="spinly-profile-preview" />
                            )}
                            {formError && <StatusMessage tone="error">{tm(formError)}</StatusMessage>}
                            {formWarning && <StatusMessage>{tm(formWarning)}</StatusMessage>}
                            <div className="spinly-profile-actions">
                                <button type="submit" className="spinly-action-btn spinly-btn-primary" disabled={saving || !isSupabaseConfigured}>
                                    {saving ? t('header', 'saving') : editing ? t('header', 'saveChanges') : t('header', 'enter')}
                                </button>
                                {editing && (
                                    <button type="button" className="spinly-action-btn" onClick={() => resetForm(false)}>
                                        {t('common', 'cancel')}
                                    </button>
                                )}
                            </div>
                        </form>
                    )}
                </div>
            )}
        </div>
    );
}

export default ProfileMenu;
