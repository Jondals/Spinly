import React, { useState, useEffect, useRef } from 'react';
import Avatar from './Avatar';
import {
    createAnonymousProfile,
    fetchProfile,
    getCurrentUserId,
    onAuthChange,
    signOutProfile,
    updateProfile,
    MAX_USERNAME_LENGTH,
    type SpinlyProfile,
} from '../lib/profile';
import {
    isAllowedImageMime,
    isSupabaseConfigured,
    MAX_UPLOAD_BYTES,
    SUPABASE_NOT_CONFIGURED_ERROR,
} from '../lib/supabaseClient';
import '../css/Header.css';

interface HeaderProps {
    isMenuOpen: boolean;
    onToggleMenu: () => void;
}

function Header({ isMenuOpen, onToggleMenu }: HeaderProps) {
    // typeof window: protegido por si el módulo se evalúa fuera del navegador (build/SSR)
    const [theme, setTheme] = useState(() => (typeof window !== 'undefined' && localStorage.getItem('spinly-theme')) || 'dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('spinly-theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
    };

    // —— Perfil: SOLO nombre de usuario (auth anónima), nunca email/contraseña ——
    const [profile, setProfile] = useState<SpinlyProfile | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draftName, setDraftName] = useState('');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [formWarning, setFormWarning] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    // Sesión (persiste en localStorage) + carga del perfil. Sin sesión → modo local intacto.
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
            if (!alive || lastLoadedId !== id) return;
            if (result.ok) setProfile(result.data);
        };

        void getCurrentUserId().then(loadProfile);
        const unsubscribe = onAuthChange((id) => { void loadProfile(id); });
        return () => {
            alive = false;
            unsubscribe();
        };
    }, []);

    // Cierre con Escape / clic fuera (mismo patrón que el resto de menús)
    useEffect(() => {
        if (!menuOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (profileRef.current?.contains(target)) return;
            setMenuOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [menuOpen]);

    const clearAvatarDraft = () => {
        setAvatarFile(null);
        setAvatarPreview(null);
    };

    const toggleProfileMenu = () => {
        setMenuOpen((prev) => {
            const next = !prev;
            if (next) {
                setEditing(false);
                setDraftName(profile?.username ?? '');
                setFormError(null);
                setFormWarning(null);
                clearAvatarDraft();
            }
            return next;
        });
    };

    const startEdit = () => {
        setEditing(true);
        setDraftName(profile?.username ?? '');
        setFormError(null);
        setFormWarning(null);
        clearAvatarDraft();
    };

    const cancelEdit = () => {
        setEditing(false);
        setDraftName(profile?.username ?? '');
        setFormError(null);
        setFormWarning(null);
        clearAvatarDraft();
    };

    const handleAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        setFormError(null);
        if (!file) {
            clearAvatarDraft();
            return;
        }
        if (!isAllowedImageMime(file.type)) {
            setFormError('Formato no permitido: usa PNG, JPEG o WEBP.');
            clearAvatarDraft();
            event.target.value = '';
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            setFormError('La foto no puede superar ~2MB.');
            clearAvatarDraft();
            event.target.value = '';
            return;
        }
        setAvatarFile(file);
        const reader = new FileReader();
        reader.onload = () => setAvatarPreview(String(reader.result ?? ''));
        reader.readAsDataURL(file);
    };

    // Confirmar: sesión anónima (solo si no hay sesión) + fila en profiles.
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const username = draftName.trim();
        setFormError(null);
        setFormWarning(null);
        if (!username) {
            setFormError('Escribe un nombre de usuario.');
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
            if (result.warning) setFormWarning(result.warning);
            clearAvatarDraft();
            setEditing(false);
        } catch {
            setFormError('Error inesperado. Tu modo local sigue funcionando.');
        } finally {
            setSaving(false);
        }
    };

    // Cerrar sesión: revoca la sesión y limpia TODO el estado local del perfil.
    // (Los temas/presets locales viven en localStorage del dispositivo, no de la cuenta:
    //  borrarlos al cerrar sesión destruiría datos del usuario; no se tocan.)
    const handleSignOut = async () => {
        setFormError(null);
        setFormWarning(null);
        setSaving(true);
        try {
            const result = await signOutProfile();
            if (!result.ok) {
                setFormError(result.error);
                return;
            }
            setProfile(null);
            setUserId(null);
            setDraftName('');
            clearAvatarDraft();
            setEditing(false);
        } catch {
            setFormError('No se pudo cerrar la sesión.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="Header">
            <img src="/Images/spinly-logo.webp" alt="logo" className='spinly-logo'/>
            <h1>Spinly</h1>

            <div className="spinly-actions">
                {/* Botón del Wheel Manager: en mobile abre el drawer (en desktop está oculto) */}
                <button
                    type="button"
                    className={`spinly-menu-button ${isMenuOpen ? 'spinly-menu-button--open' : ''}`}
                    onClick={onToggleMenu}
                    aria-label={isMenuOpen ? 'Cerrar Wheel Manager' : 'Abrir Wheel Manager'}
                    aria-expanded={isMenuOpen}
                    aria-controls="wheelmanager-body"
                >
                    <span className="hamburger-line" aria-hidden="true" />
                    <span className="hamburger-line" aria-hidden="true" />
                    <span className="hamburger-line" aria-hidden="true" />
                </button>

                <button className='spinly-theme' onClick={toggleTheme} aria-label="Cambiar tema">
                    {theme === 'dark' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 19a1 1 0 0 1 .993.883L13 20v1a1 1 0 0 1-1.993.117L11 21v-1a1 1 0 0 1 1-1m6.313-2.09.094.083.7.7a1 1 0 0 1-1.32 1.497l-.094-.083-.7-.7a1 1 0 0 1 1.218-1.567zm-11.306.083a1 1 0 0 1 .083 1.32l-.083.094-.7.7a1 1 0 0 1-1.497-1.32l.083-.094.7-.7a1 1 0 0 1 1.414 0M4 11a1 1 0 0 1 .117 1.993L4 13H3a1 1 0 0 1-.117-1.993L3 11zm17 0a1 1 0 0 1 .117 1.993L21 13h-1a1 1 0 0 1-.117-1.993L20 11zM6.213 4.81l.094.083.7.7a1 1 0 0 1-1.32 1.497l-.094-.083-.7-.7A1 1 0 0 1 6.11 4.74zm12.894.083a1 1 0 0 1 .083 1.32l-.083.094-.7.7a1 1 0 0 1-1.497-1.32l.083-.094.7-.7a1 1 0 0 1 1.414 0M12 2a1 1 0 0 1 .993.883L13 3v1a1 1 0 0 1-1.993.117L11 4V3a1 1 0 0 1 1-1m0 5a5 5 0 1 1-4.995 5.217L7 12l.005-.217A5 5 0 0 1 12 7"/></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1.992a10 10 0 1 0 9.236 13.838c.341-.82-.476-1.644-1.298-1.31a6.5 6.5 0 0 1-6.864-10.787l.077-.08c.551-.63.113-1.653-.758-1.653h-.266l-.068-.006z"/></svg>
                    )}
                </button>

                {/* Perfil: icono circular junto a los botones existentes */}
                <div className="spinly-profile" ref={profileRef}>
                    <button
                        type="button"
                        className="spinly-profile-button"
                        onClick={toggleProfileMenu}
                        aria-label={menuOpen ? 'Cerrar perfil' : profile ? `Perfil de ${profile.username}` : 'Abrir perfil'}
                        aria-expanded={menuOpen}
                        aria-haspopup="dialog"
                    >
                        <Avatar
                            src={profile?.avatar_url ?? null}
                            size="md"
                            alt={profile ? `Foto de ${profile.username}` : 'Sin foto de perfil'}
                        />
                    </button>

                    {menuOpen && (
                        <div className="spinly-profile-menu" role="dialog" aria-label="Perfil de usuario">
                            {!isSupabaseConfigured && (
                                <p className="spinly-status spinly-status--error">
                                    {SUPABASE_NOT_CONFIGURED_ERROR} El perfil y la comunidad no están disponibles.
                                </p>
                            )}

                            {userId && profile && !editing ? (
                                <>
                                    <div className="spinly-profile-head">
                                        <Avatar
                                            src={profile.avatar_url}
                                            size="lg"
                                            alt={`Foto de ${profile.username}`}
                                        />
                                        <span className="spinly-profile-username">{profile.username}</span>
                                    </div>
                                    <button type="button" className="spinly-action-btn" onClick={startEdit}>
                                        Editar perfil
                                    </button>
                                    <button type="button" className="spinly-action-btn" onClick={handleSignOut} disabled={saving}>
                                        {saving ? 'Cerrando…' : 'Cerrar sesión'}
                                    </button>
                                </>
                            ) : (
                                <form className="spinly-profile-form" onSubmit={handleSubmit}>
                                    <p className="spinly-profile-title">
                                        {editing ? 'Editar perfil' : 'Crea tu perfil'}
                                    </p>
                                    <label className="spinly-profile-field">
                                        <span>Nombre de usuario</span>
                                        <input
                                            type="text"
                                            value={draftName}
                                            onChange={(event) => setDraftName(event.target.value)}
                                            maxLength={MAX_USERNAME_LENGTH}
                                            placeholder="Tu nombre de usuario"
                                            autoComplete="off"
                                            required
                                        />
                                    </label>
                                    <label className="spinly-profile-field">
                                        <span>Foto de perfil (opcional)</span>
                                        <input type="file" accept="image/*" onChange={handleAvatarFile} />
                                    </label>
                                    {avatarPreview && (
                                        <Avatar
                                            src={avatarPreview}
                                            size="lg"
                                            alt="Vista previa de la foto"
                                            className="spinly-profile-preview"
                                        />
                                    )}
                                    {formError && (
                                        <p className="spinly-status spinly-status--error" role="alert">{formError}</p>
                                    )}
                                    {formWarning && (
                                        <p className="spinly-status" role="status">{formWarning}</p>
                                    )}
                                    <div className="spinly-profile-actions">
                                        <button
                                            type="submit"
                                            className="spinly-action-btn spinly-action-btn--primary"
                                            disabled={saving || !isSupabaseConfigured}
                                        >
                                            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Entrar'}
                                        </button>
                                        {editing && (
                                            <button type="button" className="spinly-action-btn" onClick={cancelEdit}>
                                                Cancelar
                                            </button>
                                        )}
                                    </div>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Header;