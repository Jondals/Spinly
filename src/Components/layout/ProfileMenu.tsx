import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Avatar from '../common/Avatar';
import Icon from '../common/Icon';
import SegmentedToggle from '../common/SegmentedToggle';
import StatusMessage from '../common/StatusMessage';
import { useTranslation } from '../i18n/LanguageProvider';
import { useDismiss } from '../../hooks/useDismiss';
import { useAccountSession } from '../../hooks/useSessionUserId';
import { flushAccountSync } from '../../hooks/useAccountSync';
import { dictMessage, type LocalMessage } from '../../scripts/strings';
import {
    changePassword,
    createAccount,
    fetchProfile,
    passwordChecks,
    setAccountPassword,
    signInWithUsername,
    signOut,
    updateProfile,
    validatePassword,
    MAX_USERNAME_LENGTH,
    MIN_PASSWORD_LENGTH,
    type PasswordCheck,
    type SpinlyProfile,
} from '../../scripts/profile';
import { adoptAccountData, beginAccountSwitch, clearLocalData, endAccountSwitch, reloadApp } from '../../scripts/account-data';
import { isAllowedImageMime, isSupabaseConfigured, MAX_UPLOAD_BYTES, notConfiguredError } from '../../scripts/supabaseClient';

/** view: perfil abierto. create / login: sin sesión. edit: nombre, foto y contraseña. protect: poner contraseña a un perfil antiguo. */
type Mode = 'view' | 'create' | 'login' | 'edit' | 'protect';
type FormMode = Exclude<Mode, 'view'>;

// Debe coincidir con la animación de salida de .spinly-profile-menu--closing (Header.css).
const CLOSE_MS = 140;

// Tras varios fallos seguidos al entrar, una pausa creciente (el límite real lo pone Supabase).
const FREE_ATTEMPTS = 3;
const LOCK_STEP_S = 5;
const MAX_LOCK_S = 30;

interface PasswordInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    autoComplete: 'new-password' | 'current-password';
    required?: boolean;
}

/** Campo de contraseña con botón para mostrarla: sin recuperación, conviene poder revisarla. */
function PasswordInput({ label, value, onChange, autoComplete, required = true }: PasswordInputProps) {
    const { t } = useTranslation();
    const id = useId();
    const [visible, setVisible] = useState(false);
    return (
        <div className="spinly-profile-field">
            <label htmlFor={id}>{label}</label>
            <div className="spinly-profile-password">
                <input
                    id={id}
                    className="spinly-field-input"
                    type={visible ? 'text' : 'password'}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    autoComplete={autoComplete}
                    autoCapitalize="off"
                    spellCheck={false}
                    required={required}
                />
                <button
                    type="button"
                    className="spinly-profile-reveal"
                    onClick={() => setVisible((prev) => !prev)}
                    aria-label={t('header', visible ? 'hidePassword' : 'showPassword')}
                    aria-pressed={visible}
                    title={t('header', visible ? 'hidePassword' : 'showPassword')}
                >
                    <Icon name={visible ? 'eyeOff' : 'eye'} size={16} />
                </button>
            </div>
        </div>
    );
}

const RULES: ReadonlyArray<{ id: PasswordCheck; label: 'ruleLength' | 'ruleLower' | 'ruleUpper' | 'ruleDigit' | 'ruleSymbol' | 'ruleNoName' }> = [
    { id: 'length', label: 'ruleLength' },
    { id: 'lower', label: 'ruleLower' },
    { id: 'upper', label: 'ruleUpper' },
    { id: 'digit', label: 'ruleDigit' },
    { id: 'symbol', label: 'ruleSymbol' },
    { id: 'noName', label: 'ruleNoName' },
];

/** Requisitos de la contraseña, marcados en vivo mientras se escribe. */
function PasswordRules({ password, username }: { password: string; username: string }) {
    const { t } = useTranslation();
    const checks = passwordChecks(password, username);
    const name = username.trim();
    // Con menos de 3 letras la regla no aplica (passwordChecks): mejor no mostrarla.
    const rules = name.length >= 3 ? RULES : RULES.filter((rule) => rule.id !== 'noName');
    return (
        <ul className="spinly-profile-rules" aria-label={t('header', 'passwordRules')}>
            {rules.map(({ id, label }) => (
                <li key={id} className={`spinly-profile-rule${checks[id] ? ' spinly-profile-rule--ok' : ''}`}>
                    <Icon name={checks[id] ? 'check' : 'close'} size={12} />
                    <span>{t('header', label, { min: MIN_PASSWORD_LENGTH, name })}</span>
                    <span className="spinly-profile-rule-state">{t('header', checks[id] ? 'ruleMet' : 'ruleMissing')}</span>
                </li>
            ))}
        </ul>
    );
}

/**
 * Cuenta con nombre de usuario y contraseña. Entrar o salir recarga la página: la app
 * arranca con los datos de la cuenta, o como nueva tras cerrar sesión.
 */
function ProfileMenu() {
    const { t, tm } = useTranslation();
    const session = useAccountSession();
    const userId = session?.userId ?? null;
    const isAnonymous = session?.isAnonymous ?? true;
    const [profile, setProfile] = useState<SpinlyProfile | null>(null);
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const closeTimer = useRef<number | null>(null);
    const [mode, setMode] = useState<Mode>('create');
    const [draftName, setDraftName] = useState('');
    const [password, setPassword] = useState('');
    const [passwordRepeat, setPasswordRepeat] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [formError, setFormError] = useState<LocalMessage | null>(null);
    const [formNotice, setFormNotice] = useState<LocalMessage | null>(null);
    const [busy, setBusy] = useState(false);
    const [failedLogins, setFailedLogins] = useState(0);
    const [locked, setLocked] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const nameId = useId();
    const photoId = useId();

    const closeMenu = () => {
        if (!open || closing) return;
        setClosing(true);
        closeTimer.current = window.setTimeout(() => {
            setOpen(false);
            setClosing(false);
        }, CLOSE_MS);
    };
    useEffect(() => () => {
        if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    }, []);

    useDismiss(open && !closing && !busy, closeMenu, [rootRef]);

    useEffect(() => {
        let alive = true;
        if (!userId) {
            setProfile(null);
            return undefined;
        }
        void fetchProfile(userId).then((result) => {
            if (alive && result.ok) setProfile(result.data);
        });
        return () => {
            alive = false;
        };
    }, [userId]);

    const clearSecrets = () => {
        setPassword('');
        setPasswordRepeat('');
        setCurrentPassword('');
    };

    const goTo = (next: Mode) => {
        setMode(next);
        setDraftName(next === 'edit' ? profile?.username ?? '' : next === 'login' || next === 'create' ? '' : draftName);
        clearSecrets();
        setFormError(null);
        setAvatarFile(null);
        setAvatarPreview(null);
    };

    const toggleOpen = () => {
        if (open) {
            closeMenu();
            return;
        }
        goTo(userId && profile ? 'view' : 'create');
        setFormNotice(null);
        setOpen(true);
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

    // Al crear cuenta el nombre es el que se está escribiendo; después, el del perfil.
    const nameForRules = mode === 'create' ? draftName : profile?.username ?? '';

    /** Contraseña nueva: segura y repetida igual; sin recuperación posible, un error tecleando sería definitivo. */
    const checkNewPassword = (): LocalMessage | null =>
        validatePassword(password, nameForRules) ?? (password !== passwordRepeat ? dictMessage('errors', 'passwordMismatch') : null);

    const run = async (action: () => Promise<void>) => {
        setFormError(null);
        setFormNotice(null);
        setBusy(true);
        try {
            await action();
        } catch {
            setFormError(dictMessage('common', 'unexpected'));
        } finally {
            setBusy(false);
        }
    };

    const handleCreate = () => run(async () => {
        const username = draftName.trim();
        if (!username) return setFormError(dictMessage('errors', 'typeUsername'));
        const invalid = checkNewPassword();
        if (invalid) return setFormError(invalid);
        const result = await createAccount({ username, password, avatarFile });
        if (!result.ok) return setFormError(result.error);
        setProfile(result.data);
        clearSecrets();
        setMode('view');
        setFormNotice(result.warning ?? dictMessage('header', 'passwordSaved'));
    });

    const lockAfterFailure = () => {
        const failures = failedLogins + 1;
        setFailedLogins(failures);
        if (failures < FREE_ATTEMPTS) return null;
        const seconds = Math.min(MAX_LOCK_S, LOCK_STEP_S * (failures - FREE_ATTEMPTS + 1));
        setLocked(true);
        window.setTimeout(() => setLocked(false), seconds * 1000);
        return dictMessage('errors', 'tooManyAttempts', { s: seconds });
    };

    const handleLogin = () => run(async () => {
        beginAccountSwitch();
        const result = await signInWithUsername(draftName, password);
        if (!result.ok) {
            endAccountSwitch();
            setPassword('');
            return setFormError(lockAfterFailure() ?? result.error);
        }
        const adopted = await adoptAccountData(result.data);
        if (!adopted.ok) {
            endAccountSwitch();
            return setFormError(adopted.error);
        }
        reloadApp();
    });

    const handleProtect = () => run(async () => {
        const invalid = checkNewPassword();
        if (invalid) return setFormError(invalid);
        const result = await setAccountPassword(password);
        if (!result.ok) return setFormError(result.error);
        clearSecrets();
        setMode('view');
        setFormNotice(dictMessage('header', 'passwordSaved'));
    });

    const handleEdit = () => run(async () => {
        if (!userId) return;
        const username = draftName.trim();
        if (!username) return setFormError(dictMessage('errors', 'typeUsername'));
        const changingPassword = !isAnonymous && password.length > 0;
        if (changingPassword) {
            const invalid = checkNewPassword();
            if (invalid) return setFormError(invalid);
        }
        const result = await updateProfile({ id: userId, username, avatar_url: profile?.avatar_url ?? null }, avatarFile);
        if (!result.ok) return setFormError(result.error);
        setProfile(result.data);
        if (changingPassword) {
            const changed = await changePassword(currentPassword, password);
            if (!changed.ok) return setFormError(changed.error);
        }
        clearSecrets();
        setMode('view');
        setFormNotice(result.warning ?? (changingPassword ? dictMessage('header', 'passwordChanged') : null));
    });

    // Lo pendiente se sube antes de salir; si no se puede, no se sale (se perdería).
    const handleSignOut = () => run(async () => {
        beginAccountSwitch();
        if (!(await flushAccountSync())) {
            endAccountSwitch();
            return setFormError(dictMessage('errors', 'signOutUnsaved'));
        }
        const result = await signOut();
        if (!result.ok) {
            endAccountSwitch();
            return setFormError(result.error);
        }
        clearLocalData();
        reloadApp();
    });

    const onSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (mode === 'create') void handleCreate();
        else if (mode === 'login') void handleLogin();
        else if (mode === 'protect') void handleProtect();
        else if (mode === 'edit') void handleEdit();
    };

    const photoAlt = profile ? t('common', 'photoOf', { name: profile.username }) : t('common', 'noPhoto');
    const buttonLabel = open
        ? t('header', 'closeProfile')
        : profile ? t('header', 'profileOf', { name: profile.username }) : t('header', 'openProfile');
    const formMode: FormMode = mode === 'view' ? 'create' : mode;
    const showView = mode === 'view' && userId && profile;
    const guestTabs = !userId && (formMode === 'create' || formMode === 'login');

    const titles: Record<FormMode, string> = {
        create: t('header', 'createProfile'),
        login: t('header', 'loginTitle'),
        edit: t('header', 'editProfileTitle'),
        protect: t('header', 'protectTitle'),
    };
    const subtitles: Record<FormMode, string> = {
        create: t('header', 'createSubtitle'),
        login: t('header', 'loginSubtitle'),
        edit: t('header', 'editSubtitle'),
        protect: t('header', 'protectHint'),
    };
    const submitLabels: Record<FormMode, string> = {
        create: t('header', 'createAccount'),
        login: t('header', 'login'),
        edit: t('header', 'saveChanges'),
        protect: t('header', 'protectButton'),
    };

    const newPasswordFields = (label: string, required: boolean) => (
        <>
            <PasswordInput label={label} value={password} onChange={setPassword} autoComplete="new-password" required={required} />
            {(required || password.length > 0) && (
                <PasswordInput label={t('header', 'passwordRepeat')} value={passwordRepeat} onChange={setPasswordRepeat} autoComplete="new-password" />
            )}
            {(required || password.length > 0) && <PasswordRules password={password} username={nameForRules} />}
            <p className="spinly-profile-hint">{t('header', 'passwordHint')}</p>
        </>
    );

    return (
        <div className="spinly-profile" ref={rootRef}>
            <button
                type="button"
                className="spinly-profile-button"
                onClick={toggleOpen}
                aria-label={buttonLabel}
                aria-expanded={open && !closing}
                aria-haspopup="dialog"
            >
                <Avatar src={profile?.avatar_url ?? null} size="md" alt={photoAlt} />
            </button>

            {open && (
                <div className={`spinly-profile-menu${closing ? ' spinly-profile-menu--closing' : ''}`} role="dialog" aria-label={t('header', 'profileDialog')}>
                    {!isSupabaseConfigured && (
                        <StatusMessage tone="error">{tm(notConfiguredError())} {t('header', 'noSupabase')}</StatusMessage>
                    )}

                    {showView ? (
                        <div key="view" className="spinly-profile-step">
                            <div className="spinly-profile-card">
                                <Avatar src={profile.avatar_url} size="lg" alt={photoAlt} className="spinly-profile-card-avatar" />
                                <span className="spinly-profile-username">{profile.username}</span>
                                <span className={`spinly-profile-badge${isAnonymous ? ' spinly-profile-badge--warn' : ''}`}>
                                    <Icon name={isAnonymous ? 'shieldAlert' : 'shieldCheck'} size={13} />
                                    {t('header', isAnonymous ? 'unprotectedBadge' : 'protectedBadge')}
                                </span>
                            </div>
                            {formNotice && <StatusMessage tone="ok">{tm(formNotice)}</StatusMessage>}
                            {formError && <StatusMessage tone="error">{tm(formError)}</StatusMessage>}
                            {isAnonymous ? (
                                <>
                                    <p className="spinly-profile-hint">{t('header', 'protectHint')}</p>
                                    <button type="button" className="spinly-action-btn spinly-btn-primary spinly-profile-submit" onClick={() => goTo('protect')}>
                                        {t('header', 'protectButton')}
                                    </button>
                                </>
                            ) : (
                                <p className="spinly-profile-sync">
                                    <Icon name="cloud" size={14} />
                                    {t('header', 'accountSynced')}
                                </p>
                            )}
                            <div className="spinly-profile-divider" />
                            <div className="spinly-profile-actions">
                                <button type="button" className="spinly-action-btn" onClick={() => goTo('edit')}>
                                    <Icon name="edit" size={14} />
                                    {t('header', 'editProfile')}
                                </button>
                                {isAnonymous ? (
                                    <button type="button" className="spinly-action-btn" onClick={() => goTo('login')}>
                                        {t('header', 'loginTitle')}
                                    </button>
                                ) : (
                                    <button type="button" className="spinly-action-btn spinly-profile-signout" onClick={() => { void handleSignOut(); }} disabled={busy} title={t('header', 'signOutHint')}>
                                        <Icon name="logout" size={14} />
                                        {busy ? t('header', 'signingOut') : t('header', 'signOut')}
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <form key={formMode} className="spinly-profile-form spinly-profile-step" onSubmit={onSubmit}>
                            {guestTabs && (
                                <SegmentedToggle<'create' | 'login'>
                                    className="spinly-profile-tabs"
                                    ariaLabel={t('header', 'accountTabs')}
                                    value={formMode === 'login' ? 'login' : 'create'}
                                    onChange={(next) => goTo(next)}
                                    options={[
                                        { id: 'create', label: t('header', 'createAccount') },
                                        { id: 'login', label: t('header', 'loginTitle') },
                                    ]}
                                />
                            )}
                            <div className="spinly-profile-intro">
                                <p className="spinly-profile-title">{titles[formMode]}</p>
                                <p className="spinly-profile-subtitle">{subtitles[formMode]}</p>
                            </div>

                            {formMode === 'login' && userId && isAnonymous && <StatusMessage>{t('header', 'loginReplacesAnon')}</StatusMessage>}

                            {formMode !== 'protect' && (
                                <div className="spinly-profile-field">
                                    <label htmlFor={nameId}>{t('header', 'username')}</label>
                                    <input
                                        id={nameId}
                                        className="spinly-field-input"
                                        type="text"
                                        value={draftName}
                                        onChange={(event) => setDraftName(event.target.value)}
                                        maxLength={MAX_USERNAME_LENGTH}
                                        placeholder={t('header', 'usernamePh')}
                                        autoComplete={formMode === 'edit' ? 'off' : 'username'}
                                        autoCapitalize="off"
                                        spellCheck={false}
                                        required
                                    />
                                </div>
                            )}

                            {formMode === 'login' && (
                                <PasswordInput label={t('header', 'password')} value={password} onChange={setPassword} autoComplete="current-password" />
                            )}
                            {(formMode === 'create' || formMode === 'protect') && newPasswordFields(t('header', 'password'), true)}

                            {(formMode === 'create' || formMode === 'edit') && (
                                <div className="spinly-profile-photo">
                                    <Avatar
                                        src={avatarPreview ?? (formMode === 'edit' ? profile?.avatar_url ?? null : null)}
                                        size="lg"
                                        alt={avatarPreview ? t('header', 'preview') : photoAlt}
                                    />
                                    <div className="spinly-profile-photo-text">
                                        <span className="spinly-profile-label">{t('header', 'photo')}</span>
                                        <label htmlFor={photoId} className="spinly-action-btn spinly-profile-photo-btn">
                                            <Icon name="image" size={14} />
                                            {t('header', avatarPreview || (formMode === 'edit' && profile?.avatar_url) ? 'changePhoto' : 'choosePhoto')}
                                        </label>
                                        <input id={photoId} className="spinly-profile-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarFile} />
                                    </div>
                                </div>
                            )}

                            {formMode === 'edit' && !isAnonymous && (
                                <fieldset className="spinly-profile-group">
                                    <legend>{t('header', 'passwordSection')}</legend>
                                    <PasswordInput
                                        label={t('header', 'passwordCurrent')}
                                        value={currentPassword}
                                        onChange={setCurrentPassword}
                                        autoComplete="current-password"
                                        required={password.length > 0}
                                    />
                                    {newPasswordFields(t('header', 'passwordNew'), false)}
                                </fieldset>
                            )}

                            {formError && <StatusMessage tone="error">{tm(formError)}</StatusMessage>}
                            {formNotice && <StatusMessage>{tm(formNotice)}</StatusMessage>}
                            <div className="spinly-profile-actions">
                                <button
                                    type="submit"
                                    className="spinly-action-btn spinly-btn-primary spinly-profile-submit"
                                    disabled={busy || locked || !isSupabaseConfigured}
                                >
                                    {busy ? (formMode === 'login' ? t('header', 'signingIn') : t('header', 'saving')) : submitLabels[formMode]}
                                </button>
                                {(formMode === 'edit' || formMode === 'protect' || (formMode === 'login' && userId)) && (
                                    <button type="button" className="spinly-action-btn" onClick={() => goTo('view')}>
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
