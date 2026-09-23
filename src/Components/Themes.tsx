import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_THEMES, ensureSegments, type WheelTheme } from '../types/theme-types';
import Avatar from './Avatar';
import SearchBar from './SearchBar';
import SegmentedToggle from './SegmentedToggle';
import CollapsePanel from './CollapsePanel';
import CommunityCountBadge from './CommunityCountBadge';
import ItemActions, { countItemActions } from './ItemActions';
import {
    deleteSharedTheme,
    fetchCommunityThemes,
    shareTheme,
    updateSharedTheme,
    type CommunityAuthor,
    type CommunityTheme,
} from '../lib/community';
import { useSessionUserId } from '../lib/useSessionUserId';
import { useShareCooldown } from '../lib/useShareCooldown';
import { useTranslation } from '../lib/i18n';
import { dictMessage, seedText, type LocalMessage } from '../lib/strings';
import { isCloudTarget, type ThemeDraft } from '../types/form-drafts';
import '../css/Themes.css';

interface ThemesProps {
    activeTheme: WheelTheme | null;
    setActiveTheme: React.Dispatch<React.SetStateAction<WheelTheme | null>>;
    savedThemes: WheelTheme[];
    onSaveTheme: (theme: WheelTheme) => void;
    onDeleteTheme: (id: string) => void;
    // Borrador del formulario (vive en App: sobrevive al ir al Wheel Editor y volver)
    draft: ThemeDraft | null;
    setDraft: React.Dispatch<React.SetStateAction<ThemeDraft | null>>;
}

// Derivado de DEFAULT_THEMES: nunca se desincroniza de la lista real de temas.
// Los temas preestablecidos nunca se pueden editar ni borrar (solo los del usuario).
const DEFAULT_THEME_IDS = new Set(DEFAULT_THEMES.map((theme) => theme.id));

const SAVE_PANEL_ID = 'themes-save-panel';

const EMPTY_DRAFT: ThemeDraft = { target: { mode: 'create' }, name: '', description: '', styleTag: '', category: '' };

// LocalMessage: el aviso se re-traduce si cambia el idioma mientras está visible
type PanelNotice = { tone: 'ok' | 'error'; text: LocalMessage };
type ThemeView = 'mine' | 'community';
type DraftField = 'name' | 'description' | 'styleTag' | 'category';

function Themes({ activeTheme, setActiveTheme, savedThemes, onSaveTheme, onDeleteTheme, draft, setDraft }: ThemesProps) {
    const { lang, t, tm } = useTranslation();
    const userId = useSessionUserId();
    const isActive = (id: string) => activeTheme?.id === id;

    // Texto visible: los temas semilla se localizan; los del usuario se muestran tal cual
    const themeDescription = (theme: WheelTheme): string | undefined => seedText(theme.id, 'description', lang) ?? theme.description;
    const themeCategory = (theme: WheelTheme): string | undefined => seedText(theme.id, 'category', lang) ?? theme.category;
    // Autor huérfano (username vacío): "User"/"Usuario" en el idioma activo
    const authorName = (author: CommunityAuthor): string => author.username || t('common', 'unknownUser');

    // Si se estaba editando algo de la nube, volver directamente a la vista Comunidad
    const [view, setView] = useState<ThemeView>(() => (draft && isCloudTarget(draft.target) ? 'community' : 'mine'));
    const [search, setSearch] = useState('');

    // —— Comunidad (Supabase): si falla, el modo local sigue intacto ——
    const [community, setCommunity] = useState<CommunityTheme[]>([]);
    const [communitySearch, setCommunitySearch] = useState('');
    const [loadingCommunity, setLoadingCommunity] = useState(false);
    const [communityError, setCommunityError] = useState<LocalMessage | null>(null);
    const [notice, setNotice] = useState<PanelNotice | null>(null);
    const [refreshToken, setRefreshToken] = useState(0);
    // Anti-spam compartido por TODAS las escrituras en la nube (compartir, editar, borrar)
    const cloudOps = useShareCooldown();

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

    // Descargados = temas de la comunidad que ya están guardados en local (mismo id)
    const savedIds = new Set(savedThemes.map((theme) => theme.id));
    const downloadedCount = community.filter((entry) => savedIds.has(entry.theme.id)).length;

    // Buscadores en tiempo real (por nombre visible; en Comunidad también por autor)
    const query = search.trim().toLowerCase();
    const filteredThemes = savedThemes.filter((theme) => theme.name.toLowerCase().includes(query));
    const communityQuery = communitySearch.trim().toLowerCase();
    const communityFiltered = community.filter((entry) => {
        if (!communityQuery) return true;
        return entry.theme.name.toLowerCase().includes(communityQuery)
            || authorName(entry.author).toLowerCase().includes(communityQuery);
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

    // Descargar: lo guarda en "Mis temas" y lo aplica (flujo local ya validado).
    const handleDownload = (theme: WheelTheme) => {
        onSaveTheme(theme);
        setNotice({ tone: 'ok', text: dictMessage('themes', 'savedOk', { name: theme.name }) });
    };

    // Compartir: el servicio asocia SIEMPRE author_id a la fila subida.
    const handleShare = async (theme: WheelTheme) => {
        if (!cloudOps.begin(theme.id)) return;
        setNotice(null);
        const result = await shareTheme(theme);
        cloudOps.finish();
        if (result.ok) {
            setNotice({ tone: 'ok', text: dictMessage('themes', 'sharedOk', { name: theme.name }) });
            setRefreshToken((token) => token + 1);
        } else {
            setNotice({ tone: 'error', text: result.error });
        }
    };

    // —— Formulario único: crear / editar local / editar en la nube ——
    // El último borrador se conserva mientras el acordeón se pliega (animación sin "saltos").
    const lastDraft = useRef<ThemeDraft>(EMPTY_DRAFT);
    if (draft) lastDraft.current = draft;
    const shownDraft = draft ?? lastDraft.current;
    const formOpen = draft !== null && isCloudTarget(draft.target) === (view === 'community');
    const editingId = draft && draft.target.mode !== 'create' ? draft.target.id : null;

    const startCreate = () => setDraft({ ...EMPTY_DRAFT });

    // Editar = cargar el tema en la ruleta (colores/imágenes se editan en Wheel Editor)
    // + abrir el MISMO formulario con sus datos. Pulsar otra vez Editar lo cierra.
    const startEdit = (theme: WheelTheme, mode: 'local' | 'cloud') => {
        if (draft?.target.mode === mode && editingId === theme.id) {
            setDraft(null);
            return;
        }
        handleApply(theme);
        setDraft({
            target: { mode, id: theme.id },
            name: theme.name,
            description: themeDescription(theme) ?? '',
            styleTag: theme.styleTag ?? '',
            category: themeCategory(theme) ?? '',
        });
    };

    const updateField = (field: DraftField, value: string) => {
        setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
    };

    const closeForm = () => setDraft(null);

    const handleSubmit = async () => {
        if (!draft || !activeTheme) return;
        const target = draft.target;
        const userCount = savedThemes.filter((theme) => !DEFAULT_THEME_IDS.has(theme.id)).length;
        const name = draft.name.trim() || t('themes', 'autoName', { n: userCount + 1 });
        const description = draft.description.trim();
        const styleTag = draft.styleTag.trim().toUpperCase();
        const category = draft.category.trim().toUpperCase();
        // Visual = ruleta actual; campos vacíos heredan los del tema activo (idioma visible si es semilla)
        const built: WheelTheme = {
            ...activeTheme,
            id: target.mode === 'create' ? crypto.randomUUID() : target.id,
            name,
            description: description || themeDescription(activeTheme),
            styleTag: styleTag || activeTheme.styleTag,
            category: category || themeCategory(activeTheme),
        };

        if (target.mode === 'cloud') {
            // UPDATE de la MISMA fila en Supabase (mismo id y author_id), nunca un duplicado.
            // Independiente de las copias locales: no toca "Mis temas".
            if (!cloudOps.begin(target.id)) return;
            setNotice(null);
            const result = await updateSharedTheme(target.id, built);
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

        onSaveTheme(built);
        setNotice({ tone: 'ok', text: dictMessage('themes', target.mode === 'local' ? 'updatedOk' : 'savedOk', { name }) });
        setDraft(null);
    };

    const handleDeleteLocal = (theme: WheelTheme) => {
        if (DEFAULT_THEME_IDS.has(theme.id)) return;
        if (draft?.target.mode === 'local' && editingId === theme.id) setDraft(null);
        onDeleteTheme(theme.id);
    };

    const handleDeleteCloud = async (theme: WheelTheme) => {
        if (!cloudOps.begin(theme.id)) return;
        setNotice(null);
        const result = await deleteSharedTheme(theme.id);
        cloudOps.finish();
        if (!result.ok) {
            setNotice({ tone: 'error', text: result.error });
            return;
        }
        if (draft?.target.mode === 'cloud' && editingId === theme.id) setDraft(null);
        // Lista y contador al instante (sin recargar); luego se re-sincroniza con Supabase
        setCommunity((prev) => prev.filter((entry) => entry.theme.id !== theme.id));
        setNotice({ tone: 'ok', text: dictMessage('common', 'cloudDeleted', { name: theme.name }) });
        setRefreshToken((token) => token + 1);
    };

    const onFieldEnter = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') void handleSubmit();
    };

    const formTitle = shownDraft.target.mode === 'cloud'
        ? t('themes', 'editCloudTitle')
        : shownDraft.target.mode === 'local' ? t('themes', 'editTitle') : t('themes', 'newTitle');
    const submitLabel = shownDraft.target.mode === 'cloud'
        ? t('common', 'updateCloud')
        : shownDraft.target.mode === 'local' ? t('common', 'saveChanges') : t('themes', 'save');
    // Botón "Guardar tema actual" oculto mientras el formulario de "Mis temas" está abierto
    const showCreateButton = !(draft && !isCloudTarget(draft.target));

    const renderPalette = (theme: WheelTheme) => (
        <span className="presets-themes-palette">
            {theme.segments.slice(0, 5).map((seg, i) => (
                <span key={i}
                    className="presets-themes-palette-swatch"
                    style={{ backgroundColor: seg.color }}
                    aria-hidden="true"
                />
            ))}
        </span>
    );

    return (
        <div className="Themes presets-themes">
            <header className="presets-themes-header spinly-panel-header">
                <div className="presets-themes-header-left">
                    <span className="presets-themes-icon" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                        </svg>
                    </span>
                    <h2 className="presets-themes-title spinly-panel-title">{t('themes', 'title')}</h2>
                </div>
                {view === 'mine' ? (
                    <span className="presets-themes-badge spinly-badge">
                        {t('themes', 'savedCount', { n: savedThemes.length })}
                    </span>
                ) : (
                    <CommunityCountBadge className="presets-themes-badge" downloaded={downloadedCount} available={community.length} />
                )}
            </header>
            <p className="presets-themes-subtitle">{t('themes', 'subtitle')}</p>

            {/* Toggle Mis temas / Comunidad (mismo componente en Presets) */}
            <SegmentedToggle<ThemeView>
                ariaLabel={t('themes', 'viewLabel')}
                value={view}
                onChange={setView}
                options={[
                    { id: 'mine', label: t('themes', 'mine') },
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
                placeholder={t('themes', 'searchMine')}
                ariaLabel={t('themes', 'searchMineAria')}
            />

            {filteredThemes.length === 0 ? (
                <p className="presets-themes-empty">{t('themes', 'empty')}</p>
            ) : (
            <ul className="presets-themes-grid">
                {filteredThemes.map((theme) => {
                    const description = themeDescription(theme);
                    const isOwn = !DEFAULT_THEME_IDS.has(theme.id);
                    const actions = isOwn
                        ? {
                            onShare: () => { void handleShare(theme); },
                            onEdit: () => startEdit(theme, 'local'),
                            onDelete: () => handleDeleteLocal(theme),
                        }
                        : {};
                    const actionCount = countItemActions(actions);
                    return (
                        <li key={theme.id}
                            className={`presets-themes-card spinly-panel-card${isActive(theme.id) ? ' presets-themes-card--active' : ''}${actionCount ? ` spinly-card--actions-${actionCount}` : ''}`}
                        >
                            <button type="button"
                                className="presets-themes-card-inner"
                                onClick={() => handleApply(theme)}
                                aria-label={t('themes', 'applyAria', { name: theme.name })}
                            >
                                <div className="presets-themes-card-head">
                                    <span className="presets-themes-card-name">{theme.name}</span>
                                    {isActive(theme.id) && (
                                        <span className="presets-themes-active-check" aria-label={t('themes', 'active')}>✓</span>
                                    )}
                                </div>
                                {description && (
                                    <span className="presets-themes-card-desc">{description}</span>
                                )}
                                {renderPalette(theme)}
                                <div className="presets-themes-card-footer">
                                    <span className="presets-themes-tag presets-themes-tag--style">{theme.styleTag ?? t('themes', 'fallbackStyle')}</span>
                                    <span className="presets-themes-tag presets-themes-tag--category">{themeCategory(theme) ?? t('themes', 'fallbackCat')}</span>
                                </div>
                            </button>
                            {actionCount > 0 && (
                                <ItemActions
                                    itemName={theme.name}
                                    {...actions}
                                    editing={draft?.target.mode === 'local' && editingId === theme.id}
                                    busy={cloudOps.blocked}
                                />
                            )}
                        </li>
                    );
                })}
            </ul>
            )}

            {/* "Guardar tema actual" DESPUÉS de la lista (mismo patrón que "+ Nuevo" en Presets):
                despliega el formulario justo debajo y se oculta mientras está abierto. */}
            {showCreateButton && (
                <div className="spinly-create-row">
                    <button
                        type="button"
                        className="spinly-new-btn spinly-btn-primary"
                        onClick={startCreate}
                        disabled={!activeTheme}
                        aria-label={t('themes', 'saveCurrentAria')}
                        aria-expanded={false}
                        aria-controls={SAVE_PANEL_ID}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                        </svg>
                        {t('themes', 'saveCurrent')}
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
                        ariaLabel={t('themes', 'searchCommunityAria')}
                    />

                    {loadingCommunity && (
                        <p className="spinly-status" role="status">{t('common', 'loadingCommunity')}</p>
                    )}
                    {!loadingCommunity && communityError && (
                        <p className="spinly-status spinly-status--error" role="alert">{tm(communityError)}</p>
                    )}
                    {!loadingCommunity && !communityError && communityFiltered.length === 0 && (
                        <p className="presets-themes-empty">{t('themes', 'emptyCommunity')}</p>
                    )}

                    {!loadingCommunity && !communityError && communityFiltered.length > 0 && (
                        <ul className="presets-themes-grid">
                            {communityFiltered.map(({ theme, author, authorId }) => {
                                // Editar/Borrar en la nube SOLO si eres el autor (RLS lo impone igualmente)
                                const isMine = Boolean(userId) && authorId === userId;
                                const actions = isMine
                                    ? {
                                        onEdit: () => startEdit(theme, 'cloud'),
                                        onDelete: () => { void handleDeleteCloud(theme); },
                                    }
                                    : {};
                                const actionCount = countItemActions(actions);
                                return (
                                    <li
                                        key={theme.id}
                                        className={`presets-themes-card presets-themes-card--community spinly-panel-card${actionCount ? ` spinly-card--actions-${actionCount}` : ''}`}
                                    >
                                        <div className="presets-themes-card-inner">
                                            <div className="presets-themes-card-head">
                                                <span className="presets-themes-card-name">{theme.name}</span>
                                            </div>
                                            {theme.description && (
                                                <span className="presets-themes-card-desc">{theme.description}</span>
                                            )}
                                            {renderPalette(theme)}
                                            <div className="presets-themes-card-footer">
                                                <span className="presets-themes-tag presets-themes-tag--style">{theme.styleTag ?? t('themes', 'fallbackStyle')}</span>
                                                <span className="presets-themes-tag presets-themes-tag--category">{theme.category ?? t('themes', 'fallbackCat')}</span>
                                            </div>
                                            <span className="spinly-author" title={authorName(author)}>
                                                <Avatar src={author.avatar_url} size="sm" alt={t('common', 'photoOf', { name: authorName(author) })} />
                                                <span className="spinly-author-name">{authorName(author)}</span>
                                            </span>
                                            <button
                                                type="button"
                                                className="spinly-action-btn"
                                                onClick={() => handleDownload(theme)}
                                                aria-label={t('themes', 'downloadAria', { name: theme.name })}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                    <polyline points="7 10 12 15 17 10" />
                                                    <line x1="12" y1="15" x2="12" y2="3" />
                                                </svg>
                                                {t('themes', 'download')}
                                            </button>
                                        </div>
                                        {actionCount > 0 && (
                                            <ItemActions
                                                itemName={theme.name}
                                                {...actions}
                                                cloud
                                                editing={draft?.target.mode === 'cloud' && editingId === theme.id}
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
                de las tarjetas de la vista donde se abrió. Mismo componente que Presets. */}
            <CollapsePanel
                id={SAVE_PANEL_ID}
                open={formOpen}
                title={formTitle}
                onClose={closeForm}
            >
                {shownDraft.target.mode !== 'create' && (
                    <p className="spinly-collapse-hint">{t('themes', 'editHint')}</p>
                )}
                <input type="text" className="spinly-field-input" value={shownDraft.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    onKeyDown={onFieldEnter}
                    placeholder={t('themes', 'namePh')} aria-label={t('themes', 'namePh')} maxLength={32} />
                <textarea className="spinly-field-input spinly-field-input--textarea" value={shownDraft.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder={t('themes', 'descPh')} aria-label={t('themes', 'descPh')} maxLength={120} rows={2} />
                <div className="spinly-field-row">
                    <input type="text" className="spinly-field-input" value={shownDraft.styleTag}
                        onChange={(e) => updateField('styleTag', e.target.value)}
                        onKeyDown={onFieldEnter}
                        placeholder={t('themes', 'stylePh')} aria-label={t('themes', 'stylePh')} maxLength={24} />
                    <input type="text" className="spinly-field-input" value={shownDraft.category}
                        onChange={(e) => updateField('category', e.target.value)}
                        onKeyDown={onFieldEnter}
                        placeholder={t('themes', 'catPh')} aria-label={t('themes', 'catPh')} maxLength={24} />
                </div>
                <div className="spinly-collapse-actions">
                    <button type="button" className="spinly-action-btn spinly-btn-primary"
                        onClick={() => { void handleSubmit(); }}
                        disabled={!activeTheme || (shownDraft.target.mode === 'cloud' && cloudOps.blocked)}
                    >{submitLabel}</button>
                    <button type="button" className="spinly-action-btn"
                        onClick={closeForm}
                    >{t('common', 'cancel')}</button>
                </div>
            </CollapsePanel>
        </div>
    );
}

export default Themes;
