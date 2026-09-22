import React, { useEffect, useState } from 'react';
import { DEFAULT_THEMES, ensureSegments, type WheelTheme } from '../types/theme-types';
import Avatar from './Avatar';
import SearchIcon from './SearchIcon';
import { fetchCommunityThemes, shareTheme, type CommunityTheme } from '../lib/community';
import { getCurrentUserId, onAuthChange } from '../lib/profile';
import { useShareCooldown } from '../lib/useShareCooldown';
import '../css/Themes.css';

interface ThemesProps {
    activeTheme: WheelTheme | null;
    setActiveTheme: React.Dispatch<React.SetStateAction<WheelTheme | null>>;
    savedThemes: WheelTheme[];
    onSaveTheme: (theme: WheelTheme) => void;
    onDeleteTheme: (id: string) => void;
}

// Derivado de DEFAULT_THEMES: nunca se desincroniza de la lista real de temas.
const DEFAULT_THEME_IDS = new Set(DEFAULT_THEMES.map((theme) => theme.id));

type PanelNotice = { tone: 'ok' | 'error'; text: string };

function Themes({ activeTheme, setActiveTheme, savedThemes, onSaveTheme, onDeleteTheme }: ThemesProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [nameInput, setNameInput] = useState('');
    const [descriptionInput, setDescriptionInput] = useState('');
    const [styleTagInput, setStyleTagInput] = useState('');
    const [categoryInput, setCategoryInput] = useState('');
    const isActive = (id: string) => activeTheme?.id === id;

    // —— Comunidad (Supabase): si falla, el modo local sigue intacto ——
    const [view, setView] = useState<'mine' | 'community'>('mine');
    const [community, setCommunity] = useState<CommunityTheme[]>([]);
    const [communitySearch, setCommunitySearch] = useState('');
    const [loadingCommunity, setLoadingCommunity] = useState(false);
    const [communityError, setCommunityError] = useState<string | null>(null);
    const [notice, setNotice] = useState<PanelNotice | null>(null);
    const [refreshToken, setRefreshToken] = useState(0);
    const share = useShareCooldown();

    // "Compartir" solo se muestra en temas propios Y con sesión iniciada (igual que Presets)
    const [hasSession, setHasSession] = useState(false);
    useEffect(() => {
        let alive = true;
        void getCurrentUserId().then((id) => { if (alive) setHasSession(Boolean(id)); });
        const unsubscribe = onAuthChange((id) => { if (alive) setHasSession(Boolean(id)); });
        return () => {
            alive = false;
            unsubscribe();
        };
    }, []);

    // Se carga SIEMPRE (montaje + cada entrada en Comunidad): así el badge
    // muestra el contador REAL de Supabase, nunca un 0 hardcodeado.
    useEffect(() => {
        let alive = true;
        setLoadingCommunity(true);
        setCommunityError(null);
        fetchCommunityThemes().then((result) => {
            if (!alive) return;
            setLoadingCommunity(false);
            if (result.ok) {
                setCommunity(result.data);
            } else {
                setCommunity([]);
                setCommunityError(result.error);
            }
        });
        return () => {
            alive = false;
        };
    }, [view, refreshToken]);

    // Descargar: lo guarda en "Mis temas" y lo aplica (flujo local ya validado).
    const handleDownload = (theme: WheelTheme) => {
        setNotice(null);
        onSaveTheme(theme);
        setNotice({ tone: 'ok', text: `"${theme.name}" guardado en Mis temas.` });
    };

    // Compartir: el servicio asocia SIEMPRE author_id a la fila subida.
    // useShareCooldown evita el doble clic y un bucle de peticiones (4s de cooldown).
    const handleShare = async (theme: WheelTheme) => {
        if (!share.begin(theme.id)) return;
        setNotice(null);
        const result = await shareTheme(theme);
        share.finish();
        if (result.ok) {
            setNotice({ tone: 'ok', text: `"${theme.name}" compartido en la comunidad.` });
            setRefreshToken((token) => token + 1);
        } else {
            setNotice({ tone: 'error', text: result.error });
        }
    };

    const communityFiltered = community.filter((entry) => {
        const query = communitySearch.trim().toLowerCase();
        if (!query) return true;
        return entry.theme.name.toLowerCase().includes(query)
            || entry.author.username.toLowerCase().includes(query);
    });

    const handleApply = (theme: WheelTheme) => {
        setActiveTheme((prev) => ({
            ...theme,
            borderColor: theme.borderColor ?? prev?.borderColor,
            centerColor: theme.centerColor ?? prev?.centerColor,
            pointerColor: theme.pointerColor ?? prev?.pointerColor,
            segments: ensureSegments(theme.segments, Math.max(theme.segments.length, 1)),
        }));
    };

    const handleSaveCurrent = () => {
        if (!activeTheme) return;
        const name = nameInput.trim() || `Tema ${savedThemes.filter((t) => !DEFAULT_THEME_IDS.has(t.id)).length + 1}`;
        const description = descriptionInput.trim();
        const styleTag = styleTagInput.trim().toUpperCase();
        const category = categoryInput.trim().toUpperCase();

        onSaveTheme({
            ...activeTheme,
            id: crypto.randomUUID(),
            name,
            description: description || activeTheme.description,
            styleTag: styleTag || activeTheme.styleTag,
            category: category || activeTheme.category,
        });

        setNameInput('');
        setDescriptionInput('');
        setStyleTagInput('');
        setCategoryInput('');
    };

    return (
        <div className="Themes presets-themes">
            <header className="presets-themes-header spinly-panel-header">
                <div className="presets-themes-header-left">
                    <span className="presets-themes-icon" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                        </svg>
                    </span>
                    <h2 className="presets-themes-title spinly-panel-title">Temas Visuales</h2>
                </div>
                <span className="presets-themes-badge spinly-badge">
                    {view === 'mine' ? `${savedThemes.length} Disponibles` : `${community.length} en Comunidad`}
                </span>
            </header>
            <p className="presets-themes-subtitle">
                Ajusta la paleta cromática, texturas y contraste de la ruleta en vivo.
            </p>

            {/* Toggle Mis temas / Comunidad (mismo patrón en Presets) */}
            <div className="spinly-segmented" role="tablist" aria-label="Vista de temas">
                <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'mine'}
                    className={`spinly-segmented-btn${view === 'mine' ? ' spinly-segmented-btn--active' : ''}`}
                    onClick={() => setView('mine')}
                >Mis temas</button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'community'}
                    className={`spinly-segmented-btn${view === 'community' ? ' spinly-segmented-btn--active' : ''}`}
                    onClick={() => setView('community')}
                >Comunidad</button>
            </div>

            {notice && (
                <p
                    className={`spinly-status ${notice.tone === 'error' ? 'spinly-status--error' : 'spinly-status--ok'}`}
                    role="status"
                >{notice.text}</p>
            )}

            {view === 'mine' && (
            <>
            <ul className="presets-themes-grid">
                {savedThemes.map((theme) => (
                    <li key={theme.id}
                        className={`presets-themes-card spinly-panel-card ${isActive(theme.id) ? 'presets-themes-card--active' : ''}`}
                        onMouseEnter={() => setHoveredId(theme.id)}
                        onMouseLeave={() => setHoveredId(null)}
                    >
                        <button type="button"
                            className="presets-themes-card-inner"
                            onClick={() => handleApply(theme)}
                            aria-label={`Aplicar tema ${theme.name}`}
                        >
                            <div className="presets-themes-card-head">
                                <span className="presets-themes-card-name">{theme.name}</span>
                                {isActive(theme.id) && (
                                    <span className="presets-themes-active-check" aria-label="Tema activo">✓</span>
                                )}
                            </div>
                            {theme.description && (
                                <span className="presets-themes-card-desc">{theme.description}</span>
                            )}
                            <span className="presets-themes-palette">
                                {theme.segments.slice(0, 5).map((seg, i) => (
                                    <span key={i}
                                        className="presets-themes-palette-swatch"
                                        style={{ backgroundColor: seg.color }}
                                        aria-hidden="true"
                                    />
                                ))}
                            </span>
                            <div className="presets-themes-card-footer">
                                <span className="presets-themes-tag presets-themes-tag--style">{theme.styleTag ?? 'ESTILO'}</span>
                                <span className="presets-themes-tag presets-themes-tag--category">{theme.category ?? 'CATEGORÍA'}</span>
                            </div>
                        </button>
                        {!DEFAULT_THEME_IDS.has(theme.id) && hoveredId === theme.id && (
                            <div className="presets-themes-tools">
                                {hasSession && (
                                    <button type="button"
                                        className="presets-themes-share"
                                        onClick={() => handleShare(theme)}
                                        title="Compartir en la nube"
                                        aria-label={`Compartir tema ${theme.name}`}
                                        disabled={share.blocked}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                            <polyline points="16 16 12 12 8 16" />
                                            <line x1="12" y1="12" x2="12" y2="21" />
                                            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                                        </svg>
                                    </button>
                                )}
                                <button type="button"
                                    className="presets-themes-delete"
                                    onClick={() => onDeleteTheme(theme.id)}
                                    aria-label={`Borrar tema ${theme.name}`}
                                >✕</button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
            <div className="presets-themes-save">
                <input type="text" className="presets-themes-input" value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Nombre del tema (opcional)" maxLength={32} />
                <textarea className="presets-themes-input presets-themes-textarea" value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    placeholder="Descripción (opcional)" maxLength={120} rows={2} />
                <div className="presets-themes-tag-inputs">
                    <input type="text" className="presets-themes-input presets-themes-tag-input" value={styleTagInput}
                        onChange={(e) => setStyleTagInput(e.target.value)}
                        placeholder="Etiqueta de estilo" maxLength={24} />
                    <input type="text" className="presets-themes-input presets-themes-tag-input" value={categoryInput}
                        onChange={(e) => setCategoryInput(e.target.value)}
                        placeholder="Categoría" maxLength={24} />
                </div>
                <button type="button" className="presets-themes-save-btn spinly-btn-primary"
                    onClick={handleSaveCurrent} disabled={!activeTheme}
                    aria-label="Guardar tema visual actual en local"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Guardar tema actual
                </button>
            </div>
            </>
            )}

            {view === 'community' && (
                <>
                    <div className="spinly-toolbar">
                        <label className="spinly-search">
                            <SearchIcon />
                            <input
                                type="text"
                                value={communitySearch}
                                onChange={(e) => setCommunitySearch(e.target.value)}
                                placeholder="Buscar por nombre o autor..."
                                aria-label="Buscar temas en la comunidad"
                            />
                        </label>
                    </div>

                    {loadingCommunity && (
                        <p className="spinly-status" role="status">Cargando comunidad…</p>
                    )}
                    {!loadingCommunity && communityError && (
                        <p className="spinly-status spinly-status--error" role="alert">{communityError}</p>
                    )}
                    {!loadingCommunity && !communityError && communityFiltered.length === 0 && (
                        <p className="presets-themes-empty">No hay temas en la comunidad todavía.</p>
                    )}

                    {!loadingCommunity && !communityError && communityFiltered.length > 0 && (
                        <ul className="presets-themes-grid">
                            {communityFiltered.map(({ theme, author }) => (
                                <li
                                    key={theme.id}
                                    className="presets-themes-card presets-themes-card--community spinly-panel-card"
                                >
                                    <div className="presets-themes-card-inner">
                                        <div className="presets-themes-card-head">
                                            <span className="presets-themes-card-name">{theme.name}</span>
                                        </div>
                                        {theme.description && (
                                            <span className="presets-themes-card-desc">{theme.description}</span>
                                        )}
                                        <span className="presets-themes-palette">
                                            {theme.segments.slice(0, 5).map((seg, i) => (
                                                <span
                                                    key={i}
                                                    className="presets-themes-palette-swatch"
                                                    style={{ backgroundColor: seg.color }}
                                                    aria-hidden="true"
                                                />
                                            ))}
                                        </span>
                                        <div className="presets-themes-card-footer">
                                            <span className="presets-themes-tag presets-themes-tag--style">{theme.styleTag ?? 'ESTILO'}</span>
                                            <span className="presets-themes-tag presets-themes-tag--category">{theme.category ?? 'CATEGORÍA'}</span>
                                        </div>
                                        <span className="spinly-author" title={author.username}>
                                            <Avatar src={author.avatar_url} size="sm" alt={`Foto de ${author.username}`} />
                                            <span className="spinly-author-name">{author.username}</span>
                                        </span>
                                        <button
                                            type="button"
                                            className="spinly-action-btn"
                                            onClick={() => handleDownload(theme)}
                                            aria-label={`Descargar tema ${theme.name}`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                <polyline points="7 10 12 15 17 10" />
                                                <line x1="12" y1="15" x2="12" y2="3" />
                                            </svg>
                                            Descargar
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </div>
    );
}

export default Themes;