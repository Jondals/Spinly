import React, { useEffect, useState, useRef } from 'react';
import { timeAgo, type WheelPreset } from '../types/theme-types';
import type { WheelOption } from '../scripts/option-wheel';
import type { WheelTheme } from '../types/theme-types';
import Avatar from './Avatar';
import SearchIcon from './SearchIcon';
import { fetchCommunityPresets, sharePreset, type CommunityPreset } from '../lib/community';
import { useShareCooldown } from '../lib/useShareCooldown';
import '../css/Presets.css';

interface PresetsProps {
    savedPresets: WheelPreset[];
    activePresetId: string | null;
    currentOptions: WheelOption[];
    activeTheme: WheelTheme | null;
    onSavePreset: (name: string, tags?: string[]) => void;
    onLoadPreset: (preset: WheelPreset) => void;
    onDeletePreset: (id: string) => void;
    onRenamePreset: (id: string, name: string) => void;
    onImportPreset: (preset: WheelPreset) => void;
}

type PanelNotice = { tone: 'ok' | 'error'; text: string };

const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

function Presets({ savedPresets, activePresetId, currentOptions, activeTheme, onSavePreset, onLoadPreset, onDeletePreset, onRenamePreset, onImportPreset }: PresetsProps) {
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [draftName, setDraftName] = useState('');
    const [draftTags, setDraftTags] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState('');
    const isDefault = (id: string) => id.startsWith('default-preset-');
    const filtered = savedPresets.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
    );
    const [view, setView] = useState<'mine' | 'community'>('mine');
    const [community, setCommunity] = useState<CommunityPreset[]>([]);
    const [communitySearch, setCommunitySearch] = useState('');
    const [loadingCommunity, setLoadingCommunity] = useState(false);
    const [communityError, setCommunityError] = useState<string | null>(null);
    const [notice, setNotice] = useState<PanelNotice | null>(null);
    const [refreshToken, setRefreshToken] = useState(0);
    const share = useShareCooldown();

    // Se carga SIEMPRE (montaje + cada entrada en Comunidad): así el badge
    // muestra el contador REAL de Supabase, nunca un 0 hardcodeado.
    useEffect(() => {
        let alive = true;
        setLoadingCommunity(true);
        setCommunityError(null);
        fetchCommunityPresets().then((result) => {
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

    // Compartir: el servicio asocia SIEMPRE author_id a la fila subida.
    // useShareCooldown evita el doble clic y un bucle de peticiones (4s de cooldown).
    const handleShare = async (preset: WheelPreset) => {
        if (!share.begin(preset.id)) return;
        setNotice(null);
        const result = await sharePreset(preset);
        share.finish();
        if (result.ok) {
            setNotice({ tone: 'ok', text: `"${preset.name}" compartido en la comunidad.` });
            setRefreshToken((token) => token + 1);
        } else {
            setNotice({ tone: 'error', text: result.error });
        }
    };

    // "Usar" de la comunidad: lo guarda como preset propio y lo carga en la ruleta.
    const handleUseCommunity = (preset: WheelPreset) => {
        setNotice(null);
        onImportPreset(preset);
        setNotice({ tone: 'ok', text: `"${preset.name}" cargado y guardado en Mis presets.` });
    };

    const communityFiltered = community.filter((entry) => {
        const query = communitySearch.trim().toLowerCase();
        if (!query) return true;
        return entry.preset.name.toLowerCase().includes(query)
            || entry.author.username.toLowerCase().includes(query);
    });

    const handleCreate = () => {
        setCreating(true);
        setDraftName('');
        setDraftTags('');
        setTimeout(() => inputRef.current?.focus(), 10);
    };

    const handleSaveNew = () => {
        const name = draftName.trim();
        const tags = draftTags.trim()
            ? draftTags.split(',').map((t) => t.trim()).filter(Boolean)
            : [];
        onSavePreset(name || 'Sin nombre', tags);
        setCreating(false);
        setDraftName('');
        setDraftTags('');
    };

    const handleCancelCreate = () => {
        setCreating(false);
        setDraftName('');
        setDraftTags('');
    };

    const handleDuplicate = (preset: WheelPreset) => {
        onSavePreset(`${preset.name} (copia)`, preset.tags);
    };

    const startRename = (preset: WheelPreset) => {
        setEditingId(preset.id);
        setEditDraft(preset.name);
        setTimeout(() => editInputRef.current?.focus(), 10);
    };

    const commitRename = () => {
        if (editingId) {
            const name = editDraft.trim();
            if (name) onRenamePreset(editingId, name);
        }
        setEditingId(null);
        setEditDraft('');
    };

    const cancelRename = () => {
        setEditingId(null);
        setEditDraft('');
    };

    const handleDelete = (preset: WheelPreset, e: React.MouseEvent) => {
        e.stopPropagation();
        onDeletePreset(preset.id);
    };

    return (
        <div className="Presets presets-presets">
            <header className="presets-presets-header spinly-panel-header">
                <div className="presets-presets-header-left">
                    <span className="presets-presets-icon" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                        </svg>
                    </span>
                    <h2 className="presets-presets-title spinly-panel-title">Presets Guardados</h2>
                </div>
                <span className="presets-presets-badge spinly-badge">
                    {view === 'mine' ? `${savedPresets.length} Listas` : `${community.length} en Comunidad`}
                </span>
            </header>
            <p className="presets-presets-subtitle">
                Alterna instantáneamente o crea configuraciones predefinidas para tus sorteos.
            </p>

            {/* Toggle Mis presets / Comunidad (mismo patrón en Themes) */}
            <div className="spinly-segmented" role="tablist" aria-label="Vista de presets">
                <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'mine'}
                    className={`spinly-segmented-btn${view === 'mine' ? ' spinly-segmented-btn--active' : ''}`}
                    onClick={() => setView('mine')}
                >Mis presets</button>
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
            <div className="presets-presets-toolbar">
                <label className="spinly-search">
                    <SearchIcon />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar preset..."
                    />
                </label>
                {!creating && (
                    <button
                        type="button"
                        className="presets-presets-new-btn spinly-btn-primary"
                        onClick={handleCreate}
                        aria-label="Crear nuevo preset"
                    >
                        <PlusIcon /> Nuevo
                    </button>
                )}
            </div>

            {creating && (
                <div className="presets-presets-create-form">
                    <input
                        ref={inputRef}
                        type="text"
                        className="presets-presets-create-input"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveNew();
                            if (e.key === 'Escape') handleCancelCreate();
                        }}
                        placeholder="Nombre del preset"
                        maxLength={40}
                    />
                    <input
                        type="text"
                        className="presets-presets-create-input"
                        value={draftTags}
                        onChange={(e) => setDraftTags(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNew(); }}
                        placeholder="Tags (separados por coma)"
                        maxLength={80}
                    />
                    <div className="presets-presets-create-actions">
                        <button
                            type="button"
                            className="presets-presets-create-btn"
                            onClick={handleSaveNew}
                            disabled={!activeTheme || currentOptions.length === 0}
                        >Guardar</button>
                        <button
                            type="button"
                            className="presets-presets-cancel-btn"
                            onClick={handleCancelCreate}
                        >Cancelar</button>
                    </div>
                </div>
            )}

            {filtered.length === 0 ? (
                <p className="presets-presets-empty">No se encontraron presets.</p>
            ) : (
                <ul className="presets-presets-grid">
                    {filtered.map((preset) => {
                        const isActive = preset.id === activePresetId;
                        const optionChips = preset.options.slice(0, 4);
                        const extraCount = preset.options.length - 4;
                        const isDefaultPreset = isDefault(preset.id);
                        return (
                            <li
                                key={preset.id}
                                className={`presets-presets-card spinly-panel-card ${isActive ? 'presets-presets-card--active' : ''}${isDefaultPreset ? '' : ' presets-presets-card--own'}`}
                            >
                                <div className="presets-presets-card-inner">
                                    <div className="presets-presets-card-top">
                                        <span className="presets-presets-card-badge">{preset.options.length} opciones</span>
                                        <span className="presets-presets-meta">
                                            {[
                                                `· ${timeAgo(preset.updatedAt)}`,
                                                ...(preset.tags ?? []).map((t) => `· ${t}`),
                                            ].join(' ')}
                                        </span>
                                    </div>
                                    {editingId === preset.id ? (
                                        <input
                                            ref={editInputRef}
                                            type="text"
                                            className="presets-presets-rename-input"
                                            value={editDraft}
                                            maxLength={40}
                                            onChange={(e) => setEditDraft(e.target.value)}
                                            onBlur={commitRename}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') commitRename();
                                                if (e.key === 'Escape') cancelRename();
                                            }}
                                            aria-label={`Renombrar preset ${preset.name}`}
                                        />
                                    ) : (
                                        <span className="presets-presets-card-name">{preset.name}</span>
                                    )}
                                    <div className="presets-presets-chips">
                                        {optionChips.map((opt) => (
                                            <span key={opt.id} className="presets-presets-chip">
                                                {opt.name}
                                            </span>
                                        ))}
                                        {extraCount > 0 && (
                                            <span className="presets-presets-chip presets-presets-chip--more">+{extraCount} más</span>
                                        )}
                                    </div>
                                    <div className="presets-presets-card-actions">
                                        {isActive ? (
                                            <span className="presets-presets-loaded">✓ Cargado actualmente</span>
                                        ) : (
                                            <button
                                                type="button"
                                                className="presets-presets-load-btn"
                                                onClick={() => onLoadPreset(preset)}
                                                aria-label={`Cargar preset ${preset.name}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                                    <polygon points="6 3 20 12 6 21 6 3" />
                                                </svg>
                                                Cargar en Ruleta
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {!isDefaultPreset && (
                                    <div className="presets-presets-active-icons">
                                        <button
                                            type="button"
                                            className="presets-presets-action-icon"
                                            onClick={() => handleShare(preset)}
                                            aria-label={`Compartir ${preset.name}`}
                                            title="Compartir en la comunidad"
                                            disabled={share.blocked}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                                <path d="M7 17 17 7" />
                                                <path d="M8 7h9v9" />
                                            </svg>
                                        </button>
                                        {isActive && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="presets-presets-action-icon"
                                                    onClick={() => handleDuplicate(preset)}
                                                    aria-label={`Duplicar ${preset.name}`}
                                                    title="Duplicar"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="presets-presets-action-icon"
                                                    onClick={() => startRename(preset)}
                                                    aria-label={`Editar ${preset.name}`}
                                                    title="Editar"
                                                >✎</button>
                                                <button
                                                    type="button"
                                                    className="presets-presets-action-icon"
                                                    onClick={(e) => handleDelete(preset, e)}
                                                    aria-label={`Borrar ${preset.name}`}
                                                    title="Borrar"
                                                >✕</button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
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
                                aria-label="Buscar presets en la comunidad"
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
                        <p className="presets-presets-empty">No hay presets en la comunidad todavía.</p>
                    )}

                    {!loadingCommunity && !communityError && communityFiltered.length > 0 && (
                        <ul className="presets-presets-grid">
                            {communityFiltered.map(({ preset, author }) => (
                                <li
                                    key={preset.id}
                                    className="presets-presets-card presets-presets-card--community spinly-panel-card"
                                >
                                    <div className="presets-presets-card-inner">
                                        <div className="presets-presets-card-top">
                                            <span className="presets-presets-card-badge">
                                                {preset.options.length} opciones
                                            </span>
                                        </div>
                                        <span className="presets-presets-card-name">{preset.name}</span>
                                        <div className="presets-presets-chips">
                                            {preset.options.slice(0, 4).map((opt) => (
                                                <span key={opt.id} className="presets-presets-chip">{opt.name}</span>
                                            ))}
                                            {preset.options.length > 4 && (
                                                <span className="presets-presets-chip presets-presets-chip--more">
                                                    +{preset.options.length - 4} más
                                                </span>
                                            )}
                                        </div>
                                        <span className="spinly-author" title={author.username}>
                                            <Avatar src={author.avatar_url} size="sm" alt={`Foto de ${author.username}`} />
                                            <span className="spinly-author-name">{author.username}</span>
                                        </span>
                                        <div className="presets-presets-card-actions">
                                            <button
                                                type="button"
                                                className="spinly-action-btn"
                                                onClick={() => handleUseCommunity(preset)}
                                                aria-label={`Usar preset ${preset.name}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                                    <polygon points="6 3 20 12 6 21 6 3" />
                                                </svg>
                                                Usar
                                            </button>
                                        </div>
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

export default Presets;
