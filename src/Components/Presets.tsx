import React, { useEffect, useRef, useState } from 'react';
import { timeAgo, type WheelPreset } from '../types/theme-types';
import type { WheelOption } from '../scripts/option-wheel';
import type { WheelTheme } from '../types/theme-types';
import Avatar from './Avatar';
import SearchBar from './SearchBar';
import SegmentedToggle from './SegmentedToggle';
import CollapsePanel from './CollapsePanel';
import CommunityCountBadge from './CommunityCountBadge';
import ItemActions, { countItemActions } from './ItemActions';
import OptionChips from './OptionChips';
import {
    deleteSharedPreset,
    fetchCommunityPresets,
    sharePreset,
    updateSharedPreset,
    type CommunityAuthor,
    type CommunityPreset,
} from '../lib/community';
import { useSessionUserId } from '../lib/useSessionUserId';
import { useShareCooldown } from '../lib/useShareCooldown';
import { useTranslation } from '../lib/i18n';
import { dictMessage, seedText, type LocalMessage } from '../lib/strings';
import { isCloudTarget, type PresetDraft } from '../types/form-drafts';
import '../css/Presets.css';

interface PresetsProps {
    savedPresets: WheelPreset[];
    activePresetId: string | null;
    currentOptions: WheelOption[];
    activeTheme: WheelTheme | null;
    onSavePreset: (name: string, tags?: string[]) => void;
    onLoadPreset: (preset: WheelPreset) => void;
    onDeletePreset: (id: string) => void;
    onUpdatePreset: (id: string, name: string, tags: string[]) => void;
    onImportPreset: (preset: WheelPreset) => void;
    // Borrador del formulario (vive en App: sobrevive al ir al Wheel Editor y volver)
    draft: PresetDraft | null;
    setDraft: React.Dispatch<React.SetStateAction<PresetDraft | null>>;
}

// LocalMessage: el aviso se re-traduce si cambia el idioma mientras está visible
type PanelNotice = { tone: 'ok' | 'error'; text: LocalMessage };
type PresetView = 'mine' | 'community';

const CREATE_PANEL_ID = 'presets-create-panel';

const EMPTY_DRAFT: PresetDraft = { target: { mode: 'create' }, name: '', tags: '' };

const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

// Los presets semilla (DEFAULT_PRESETS) nunca se pueden editar/borrar/compartir
const isDefault = (id: string) => id.startsWith('default-preset-');

const parseTags = (raw: string): string[] => (raw.trim()
    ? raw.split(',').map((tag) => tag.trim()).filter(Boolean)
    : []);

function Presets({ savedPresets, activePresetId, currentOptions, activeTheme, onSavePreset, onLoadPreset, onDeletePreset, onUpdatePreset, onImportPreset, draft, setDraft }: PresetsProps) {
    const { lang, t, tm } = useTranslation();
    const userId = useSessionUserId();
    const [search, setSearch] = useState('');
    // Si se estaba editando algo de la nube, volver directamente a la vista Comunidad
    const [view, setView] = useState<PresetView>(() => (draft && isCloudTarget(draft.target) ? 'community' : 'mine'));
    const [community, setCommunity] = useState<CommunityPreset[]>([]);
    const [communitySearch, setCommunitySearch] = useState('');
    const [loadingCommunity, setLoadingCommunity] = useState(false);
    const [communityError, setCommunityError] = useState<LocalMessage | null>(null);
    const [notice, setNotice] = useState<PanelNotice | null>(null);
    const [refreshToken, setRefreshToken] = useState(0);
    // Anti-spam compartido por TODAS las escrituras en la nube (compartir, editar, borrar)
    const cloudOps = useShareCooldown();

    // Nombre visible: los semilla se localizan; los del usuario se muestran tal cual
    const displayName = (preset: WheelPreset): string => seedText(preset.id, 'name', lang) ?? preset.name;
    // Autor huérfano (username vacío): "User"/"Usuario" en el idioma activo
    const authorName = (author: CommunityAuthor): string => author.username || t('common', 'unknownUser');

    const query = search.trim().toLowerCase();
    const filtered = savedPresets.filter((p) =>
        displayName(p).toLowerCase().includes(query) ||
        (p.tags ?? []).some((tag) => tag.toLowerCase().includes(query))
    );

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

    // Descargados = presets de la comunidad que ya están guardados en local (mismo id)
    const savedIds = new Set(savedPresets.map((p) => p.id));
    const downloadedCount = community.filter((entry) => savedIds.has(entry.preset.id)).length;

    const communityQuery = communitySearch.trim().toLowerCase();
    const communityFiltered = community.filter((entry) => {
        if (!communityQuery) return true;
        return entry.preset.name.toLowerCase().includes(communityQuery)
            || authorName(entry.author).toLowerCase().includes(communityQuery);
    });

    // Compartir: el servicio asocia SIEMPRE author_id a la fila subida.
    const handleShare = async (preset: WheelPreset) => {
        if (!cloudOps.begin(preset.id)) return;
        setNotice(null);
        const result = await sharePreset(preset);
        cloudOps.finish();
        if (result.ok) {
            setNotice({ tone: 'ok', text: dictMessage('presets', 'sharedOk', { name: preset.name }) });
            setRefreshToken((token) => token + 1);
        } else {
            setNotice({ tone: 'error', text: result.error });
        }
    };

    // "Usar" de la comunidad: lo guarda como preset propio y lo carga en la ruleta.
    const handleUseCommunity = (preset: WheelPreset) => {
        onImportPreset(preset);
        setNotice({ tone: 'ok', text: dictMessage('presets', 'usedOk', { name: preset.name }) });
    };

    // —— Formulario único: crear / editar local / editar en la nube ——
    // El último borrador se conserva mientras el acordeón se pliega (animación sin "saltos").
    const lastDraft = useRef<PresetDraft>(EMPTY_DRAFT);
    if (draft) lastDraft.current = draft;
    const shownDraft = draft ?? lastDraft.current;
    const formOpen = draft !== null && isCloudTarget(draft.target) === (view === 'community');
    const editingId = draft && draft.target.mode !== 'create' ? draft.target.id : null;
    const canSubmit = Boolean(activeTheme) && currentOptions.length > 0;

    const startCreate = () => setDraft({ ...EMPTY_DRAFT });

    // Editar = cargar el preset en la ruleta (opciones y aspecto se editan en Wheel Editor)
    // + abrir el MISMO formulario con sus datos. Pulsar otra vez Editar lo cierra.
    const startEdit = (preset: WheelPreset, mode: 'local' | 'cloud') => {
        if (draft?.target.mode === mode && editingId === preset.id) {
            setDraft(null);
            return;
        }
        onLoadPreset(preset);
        setDraft({ target: { mode, id: preset.id }, name: preset.name, tags: (preset.tags ?? []).join(', ') });
    };

    const closeForm = () => setDraft(null);

    const handleSubmit = async () => {
        if (!draft || !canSubmit || !activeTheme) return;
        const target = draft.target;
        const name = draft.name.trim() || t('presets', 'untitled');
        const tags = parseTags(draft.tags);

        if (target.mode === 'cloud') {
            // UPDATE de la MISMA fila en Supabase (mismo id y author_id), nunca un duplicado.
            // Independiente de las copias locales: no toca "Mis presets".
            if (!cloudOps.begin(target.id)) return;
            setNotice(null);
            const result = await updateSharedPreset(target.id, {
                id: target.id,
                name,
                tags,
                options: currentOptions.map((option) => ({ ...option })),
                theme: activeTheme,
                updatedAt: Date.now(),
            });
            cloudOps.finish();
            if (!result.ok) {
                setNotice({ tone: 'error', text: result.error });
                return;
            }
            setNotice({ tone: 'ok', text: dictMessage('common', 'cloudUpdated', { name }) });
            setRefreshToken((token) => token + 1);
            setDraft(null);
            return;
        }

        if (target.mode === 'local') {
            onUpdatePreset(target.id, name, tags);
            setNotice({ tone: 'ok', text: dictMessage('presets', 'updatedOk', { name }) });
        } else {
            onSavePreset(name, tags);
        }
        setDraft(null);
    };

    const handleDeleteLocal = (preset: WheelPreset) => {
        if (isDefault(preset.id)) return;
        if (draft?.target.mode === 'local' && editingId === preset.id) setDraft(null);
        onDeletePreset(preset.id);
    };

    const handleDeleteCloud = async (preset: WheelPreset) => {
        if (!cloudOps.begin(preset.id)) return;
        setNotice(null);
        const result = await deleteSharedPreset(preset.id);
        cloudOps.finish();
        if (!result.ok) {
            setNotice({ tone: 'error', text: result.error });
            return;
        }
        if (draft?.target.mode === 'cloud' && editingId === preset.id) setDraft(null);
        // Lista y contador al instante (sin recargar); luego se re-sincroniza con Supabase
        setCommunity((prev) => prev.filter((entry) => entry.preset.id !== preset.id));
        setNotice({ tone: 'ok', text: dictMessage('common', 'cloudDeleted', { name: preset.name }) });
        setRefreshToken((token) => token + 1);
    };

    const onFieldEnter = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') void handleSubmit();
    };

    const formTitle = shownDraft.target.mode === 'cloud'
        ? t('presets', 'editCloudTitle')
        : shownDraft.target.mode === 'local' ? t('presets', 'editTitle') : t('presets', 'newTitle');
    const submitLabel = shownDraft.target.mode === 'cloud'
        ? t('common', 'updateCloud')
        : shownDraft.target.mode === 'local' ? t('common', 'saveChanges') : t('presets', 'create');
    // Botón "+ Nuevo" oculto mientras el formulario de "Mis presets" está abierto
    const showCreateButton = !(draft && !isCloudTarget(draft.target));

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
                    <h2 className="presets-presets-title spinly-panel-title">{t('presets', 'title')}</h2>
                </div>
                {view === 'mine' ? (
                    <span className="presets-presets-badge spinly-badge">
                        {t('presets', 'savedCount', { n: savedPresets.length })}
                    </span>
                ) : (
                    <CommunityCountBadge className="presets-presets-badge" downloaded={downloadedCount} available={community.length} />
                )}
            </header>
            <p className="presets-presets-subtitle">{t('presets', 'subtitle')}</p>

            {/* Toggle Mis presets / Comunidad (mismo componente en Themes) */}
            <SegmentedToggle<PresetView>
                ariaLabel={t('presets', 'viewLabel')}
                value={view}
                onChange={setView}
                options={[
                    { id: 'mine', label: t('presets', 'mine') },
                    { id: 'community', label: t('common', 'community') },
                ]}
            />

            {notice && (
                <p
                    className={`spinly-status ${notice.tone === 'error' ? 'spinly-status--error' : 'spinly-status--ok'}`}
                    role="status"
                >{tm(notice.text)}</p>
            )}

            {view === 'mine' && (
            <>
            <SearchBar
                value={search}
                onChange={setSearch}
                placeholder={t('presets', 'searchMine')}
                ariaLabel={t('presets', 'searchMineAria')}
            />

            {filtered.length === 0 ? (
                <p className="presets-presets-empty">{t('presets', 'empty')}</p>
            ) : (
                <ul className="presets-presets-grid">
                    {filtered.map((preset) => {
                        const isActive = preset.id === activePresetId;
                        const name = displayName(preset);
                        const actions = isDefault(preset.id)
                            ? {}
                            : {
                                onShare: () => { void handleShare(preset); },
                                onEdit: () => startEdit(preset, 'local'),
                                onDelete: () => handleDeleteLocal(preset),
                            };
                        const actionCount = countItemActions(actions);
                        return (
                            <li
                                key={preset.id}
                                className={`presets-presets-card spinly-panel-card${isActive ? ' presets-presets-card--active' : ''}${actionCount ? ` spinly-card--actions-${actionCount}` : ''}`}
                            >
                                <div className="presets-presets-card-inner">
                                    <div className="presets-presets-card-top">
                                        <span className="presets-presets-card-badge">{t('presets', 'optionsCount', { n: preset.options.length })}</span>
                                        <span className="presets-presets-meta">
                                            {[
                                                `· ${timeAgo(preset.updatedAt, lang)}`,
                                                ...(preset.tags ?? []).map((tag) => `· ${tag}`),
                                            ].join(' ')}
                                        </span>
                                    </div>
                                    <span className="presets-presets-card-name">{name}</span>
                                    <OptionChips options={preset.options} />
                                    <div className="presets-presets-card-actions">
                                        {isActive ? (
                                            <span className="presets-presets-loaded">✓ {t('presets', 'loaded')}</span>
                                        ) : (
                                            <button
                                                type="button"
                                                className="presets-presets-load-btn spinly-btn-primary"
                                                onClick={() => onLoadPreset(preset)}
                                                aria-label={t('presets', 'loadAria', { name })}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                                    <polygon points="6 3 20 12 6 21 6 3" />
                                                </svg>
                                                {t('presets', 'load')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {actionCount > 0 && (
                                    <ItemActions
                                        itemName={name}
                                        {...actions}
                                        editing={draft?.target.mode === 'local' && editingId === preset.id}
                                        busy={cloudOps.blocked}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* "+ Nuevo" DESPUÉS de la lista: al pulsarlo, el formulario se despliega justo
                debajo (acordeón) y el botón se oculta mientras está abierto. */}
            {showCreateButton && (
                <div className="spinly-create-row">
                    <button
                        type="button"
                        className="spinly-new-btn spinly-btn-primary"
                        onClick={startCreate}
                        aria-label={t('presets', 'newAria')}
                        aria-expanded={false}
                        aria-controls={CREATE_PANEL_ID}
                    >
                        <PlusIcon /> {t('presets', 'newBtn')}
                    </button>
                </div>
            )}
            </>
            )}

            {view === 'community' && (
                <>
                    <SearchBar
                        value={communitySearch}
                        onChange={setCommunitySearch}
                        placeholder={t('common', 'searchCommunity')}
                        ariaLabel={t('presets', 'searchCommunityAria')}
                    />

                    {loadingCommunity && (
                        <p className="spinly-status" role="status">{t('common', 'loadingCommunity')}</p>
                    )}
                    {!loadingCommunity && communityError && (
                        <p className="spinly-status spinly-status--error" role="alert">{tm(communityError)}</p>
                    )}
                    {!loadingCommunity && !communityError && communityFiltered.length === 0 && (
                        <p className="presets-presets-empty">{t('presets', 'emptyCommunity')}</p>
                    )}

                    {!loadingCommunity && !communityError && communityFiltered.length > 0 && (
                        <ul className="presets-presets-grid">
                            {communityFiltered.map(({ preset, author, authorId }) => {
                                // Editar/Borrar en la nube SOLO si eres el autor (RLS lo impone igualmente)
                                const isMine = Boolean(userId) && authorId === userId;
                                const actions = isMine
                                    ? {
                                        onEdit: () => startEdit(preset, 'cloud'),
                                        onDelete: () => { void handleDeleteCloud(preset); },
                                    }
                                    : {};
                                const actionCount = countItemActions(actions);
                                return (
                                    <li
                                        key={preset.id}
                                        className={`presets-presets-card presets-presets-card--community spinly-panel-card${actionCount ? ` spinly-card--actions-${actionCount}` : ''}`}
                                    >
                                        <div className="presets-presets-card-inner">
                                            <div className="presets-presets-card-top">
                                                <span className="presets-presets-card-badge">
                                                    {t('presets', 'optionsCount', { n: preset.options.length })}
                                                </span>
                                            </div>
                                            <span className="presets-presets-card-name">{preset.name}</span>
                                            <OptionChips options={preset.options} />
                                            <span className="spinly-author" title={authorName(author)}>
                                                <Avatar src={author.avatar_url} size="sm" alt={t('common', 'photoOf', { name: authorName(author) })} />
                                                <span className="spinly-author-name">{authorName(author)}</span>
                                            </span>
                                            <div className="presets-presets-card-actions">
                                                <button
                                                    type="button"
                                                    className="spinly-action-btn"
                                                    onClick={() => handleUseCommunity(preset)}
                                                    aria-label={t('presets', 'useAria', { name: preset.name })}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                                        <polygon points="6 3 20 12 6 21 6 3" />
                                                    </svg>
                                                    {t('presets', 'use')}
                                                </button>
                                            </div>
                                        </div>
                                        {actionCount > 0 && (
                                            <ItemActions
                                                itemName={preset.name}
                                                {...actions}
                                                cloud
                                                editing={draft?.target.mode === 'cloud' && editingId === preset.id}
                                                busy={cloudOps.blocked}
                                            />
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}

            {/* Formulario ÚNICO (crear / editar local / editar en la nube): acordeón DEBAJO
                de las tarjetas de la vista donde se abrió. Mismo componente que Themes. */}
            <CollapsePanel
                id={CREATE_PANEL_ID}
                open={formOpen}
                title={formTitle}
                onClose={closeForm}
            >
                {shownDraft.target.mode !== 'create' && (
                    <p className="spinly-collapse-hint">{t('presets', 'editHint')}</p>
                )}
                <input
                    type="text"
                    className="spinly-field-input"
                    value={shownDraft.name}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                    onKeyDown={onFieldEnter}
                    placeholder={t('presets', 'namePh')}
                    aria-label={t('presets', 'namePh')}
                    maxLength={40}
                />
                <input
                    type="text"
                    className="spinly-field-input"
                    value={shownDraft.tags}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, tags: e.target.value } : prev))}
                    onKeyDown={onFieldEnter}
                    placeholder={t('presets', 'tagsPh')}
                    aria-label={t('presets', 'tagsPh')}
                    maxLength={80}
                />
                <div className="spinly-collapse-actions">
                    <button
                        type="button"
                        className="spinly-action-btn spinly-btn-primary"
                        onClick={() => { void handleSubmit(); }}
                        disabled={!canSubmit || (shownDraft.target.mode === 'cloud' && cloudOps.blocked)}
                    >{submitLabel}</button>
                    <button
                        type="button"
                        className="spinly-action-btn"
                        onClick={closeForm}
                    >{t('common', 'cancel')}</button>
                </div>
            </CollapsePanel>
        </div>
    );
}

export default Presets;
