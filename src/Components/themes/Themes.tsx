import { useState, type Dispatch, type SetStateAction } from 'react';
import AuthorTag, { authorName } from '../common/AuthorTag';
import CollapsePanel from '../common/CollapsePanel';
import CreateRow from '../common/CreateRow';
import Icon from '../common/Icon';
import ItemActions, { countItemActions } from '../common/ItemActions';
import ItemList from '../common/ItemList';
import PanelHeader from '../common/PanelHeader';
import SegmentedToggle from '../common/SegmentedToggle';
import StatusMessage, { type Notice } from '../common/StatusMessage';
import { useTranslation } from '../i18n/LanguageProvider';
import { useCloudCooldown } from '../../hooks/useCloudCooldown';
import { useCommunity } from '../../hooks/useCommunity';
import { initialView, useDraftForm, type PanelView } from '../../hooks/useDraftForm';
import { useSessionUserId } from '../../hooks/useSessionUserId';
import { deleteSharedTheme, fetchCommunityThemes, shareTheme, updateSharedTheme } from '../../scripts/community';
import { dictMessage, seedText } from '../../scripts/strings';
import { DEFAULT_THEMES, cloneTheme, ensureSegments, type WheelTheme } from '../../types/theme-types';
import type { ThemeDraft } from '../../types/form-drafts';
import '../../css/Themes.css';

interface ThemesProps {
    activeTheme: WheelTheme | null;
    setActiveTheme: Dispatch<SetStateAction<WheelTheme | null>>;
    savedThemes: WheelTheme[];
    onSaveTheme: (theme: WheelTheme) => void;
    onDeleteTheme: (id: string) => void;
    draft: ThemeDraft | null;
    setDraft: Dispatch<SetStateAction<ThemeDraft | null>>;
}

type DraftField = 'name' | 'description' | 'styleTag' | 'category';

const FORM_ID = 'themes-form';
const EMPTY_DRAFT: ThemeDraft = { target: { mode: 'create' }, name: '', description: '', styleTag: '', category: '' };

// Los temas semilla no se pueden editar ni borrar.
const SEED_IDS = new Set(DEFAULT_THEMES.map((theme) => theme.id));

const cardClass = (base: string, actionCount: number, extra = '') =>
    `${base} spinly-panel-card${extra}${actionCount ? ` spinly-card--actions-${actionCount}` : ''}`;

function Themes({ activeTheme, setActiveTheme, savedThemes, onSaveTheme, onDeleteTheme, draft, setDraft }: ThemesProps) {
    const { lang, t, tm } = useTranslation();
    const userId = useSessionUserId();
    const cloud = useCloudCooldown();
    const [view, setView] = useState<PanelView>(() => initialView(draft));
    const [search, setSearch] = useState('');
    const [communitySearch, setCommunitySearch] = useState('');
    const [notice, setNotice] = useState<Notice | null>(null);
    const community = useCommunity(fetchCommunityThemes, view === 'community');
    const form = useDraftForm(draft, setDraft, EMPTY_DRAFT, view);
    const { shownDraft } = form;

    // Los temas semilla se localizan; los del usuario se muestran tal cual.
    const themeDescription = (theme: WheelTheme) => seedText(theme.id, 'description', lang) ?? theme.description;
    const themeCategory = (theme: WheelTheme) => seedText(theme.id, 'category', lang) ?? theme.category;

    const query = search.trim().toLowerCase();
    const mine = savedThemes.filter((theme) => theme.name.toLowerCase().includes(query));

    const communityQuery = communitySearch.trim().toLowerCase();
    const shared = community.items.filter(({ theme, author }) =>
        theme.name.toLowerCase().includes(communityQuery)
        || authorName(author, t('common', 'unknownUser')).toLowerCase().includes(communityQuery));

    const savedIds = new Set(savedThemes.map((theme) => theme.id));
    const downloaded = community.items.filter(({ theme }) => savedIds.has(theme.id)).length;

    // Los colores de flecha y luces son los del tema; sin ellos vuelven los de por defecto.
    const handleApply = (theme: WheelTheme) => {
        setActiveTheme(cloneTheme({
            ...theme,
            segments: ensureSegments(theme.segments, Math.max(theme.segments.length, 1)),
        }));
    };

    const handleDownload = (theme: WheelTheme) => {
        onSaveTheme(theme);
        setNotice({ tone: 'ok', text: dictMessage('themes', 'savedOk', { name: theme.name }) });
    };

    const handleShare = async (theme: WheelTheme) => {
        setNotice(null);
        const result = await cloud.run(theme.id, () => shareTheme(theme));
        if (!result) return;
        if (!result.ok) {
            setNotice({ tone: 'error', text: result.error });
            return;
        }
        setNotice({ tone: 'ok', text: dictMessage('themes', 'sharedOk', { name: theme.name }) });
        community.refresh();
    };

    // Editar carga el tema en la ruleta (sus colores se cambian en el editor) y abre el formulario.
    const startEdit = (theme: WheelTheme, mode: 'local' | 'cloud') => form.toggleEdit(
        mode,
        theme.id,
        () => ({
            target: { mode, id: theme.id },
            name: theme.name,
            description: themeDescription(theme) ?? '',
            styleTag: theme.styleTag ?? '',
            category: themeCategory(theme) ?? '',
        }),
        () => handleApply(theme),
    );

    const updateField = (field: DraftField, value: string) => {
        setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
    };

    const handleSubmit = async () => {
        if (!draft || !activeTheme) return;
        const { target } = draft;
        const userCount = savedThemes.filter((theme) => !SEED_IDS.has(theme.id)).length;
        const name = draft.name.trim() || t('themes', 'autoName', { n: userCount + 1 });
        // Lo visual sale de la ruleta; los campos vacíos heredan los del tema activo.
        const built: WheelTheme = {
            ...activeTheme,
            id: target.mode === 'create' ? crypto.randomUUID() : target.id,
            name,
            description: draft.description.trim() || themeDescription(activeTheme),
            styleTag: draft.styleTag.trim().toUpperCase() || activeTheme.styleTag,
            category: draft.category.trim().toUpperCase() || themeCategory(activeTheme),
        };

        if (target.mode === 'cloud') {
            // UPDATE de la misma fila; la copia local, si existe, es independiente y no se toca.
            setNotice(null);
            const result = await cloud.run(target.id, () => updateSharedTheme(target.id, built));
            if (!result) return;
            if (!result.ok) {
                setNotice({ tone: 'error', text: result.error });
                return;
            }
            setNotice({ tone: 'ok', text: dictMessage('common', 'cloudUpdated', { name }) });
            community.refresh();
        } else {
            onSaveTheme(built);
            setNotice({ tone: 'ok', text: dictMessage('themes', target.mode === 'local' ? 'updatedOk' : 'savedOk', { name }) });
        }
        form.close();
    };

    const handleDeleteLocal = (theme: WheelTheme) => {
        form.closeIfEditing('local', theme.id);
        onDeleteTheme(theme.id);
    };

    const handleDeleteCloud = async (theme: WheelTheme) => {
        setNotice(null);
        const result = await cloud.run(theme.id, () => deleteSharedTheme(theme.id));
        if (!result) return;
        if (!result.ok) {
            setNotice({ tone: 'error', text: result.error });
            return;
        }
        form.closeIfEditing('cloud', theme.id);
        community.removeLocally((entry) => entry.theme.id !== theme.id);
        setNotice({ tone: 'ok', text: dictMessage('common', 'cloudDeleted', { name: theme.name }) });
        community.refresh();
    };

    const mode = shownDraft.target.mode;
    const formTitle = mode === 'cloud' ? t('themes', 'editCloudTitle') : mode === 'local' ? t('themes', 'editTitle') : t('themes', 'newTitle');
    const submitLabel = mode === 'cloud' ? t('common', 'updateCloud') : mode === 'local' ? t('common', 'saveChanges') : t('themes', 'save');

    const isActiveTheme = (theme: WheelTheme) => view === 'mine' && activeTheme?.id === theme.id;

    const renderDetails = (theme: WheelTheme, description?: string, category?: string) => (
        <>
            <div className="presets-themes-card-head">
                <span className="presets-themes-card-name">{theme.name}</span>
                {isActiveTheme(theme) && <span className="presets-themes-active-check" aria-label={t('themes', 'active')}>✓</span>}
            </div>
            {description && <span className="presets-themes-card-desc">{description}</span>}
            <span className="presets-themes-palette">
                {theme.segments.slice(0, 5).map((segment, i) => (
                    <span key={i} className="presets-themes-palette-swatch" style={{ backgroundColor: segment.color }} aria-hidden="true" />
                ))}
            </span>
            <div className="presets-themes-card-footer">
                <span className="presets-themes-tag presets-themes-tag--style">{theme.styleTag ?? t('themes', 'fallbackStyle')}</span>
                <span className="presets-themes-tag presets-themes-tag--category">{category ?? t('themes', 'fallbackCat')}</span>
            </div>
        </>
    );

    return (
        <div className="Themes presets-themes">
            <PanelHeader
                icon="themes"
                title={t('themes', 'title')}
                badge={view === 'mine'
                    ? t('themes', 'savedCount', { n: savedThemes.length })
                    : t('common', 'communityShort', { x: downloaded, y: community.items.length })}
                badgeTitle={view === 'community' ? t('common', 'communityCount', { x: downloaded, y: community.items.length }) : undefined}
            />
            <p className="presets-themes-subtitle">{t('themes', 'subtitle')}</p>

            <SegmentedToggle<PanelView>
                ariaLabel={t('themes', 'viewLabel')}
                value={view}
                onChange={setView}
                options={[
                    { id: 'mine', label: t('themes', 'mine') },
                    { id: 'community', label: t('common', 'community') },
                ]}
            />

            {notice && <StatusMessage tone={notice.tone}>{tm(notice.text)}</StatusMessage>}

            {view === 'mine' ? (
                <>
                    <ItemList
                        search={search}
                        onSearch={setSearch}
                        searchPlaceholder={t('themes', 'searchMine')}
                        searchLabel={t('themes', 'searchMineAria')}
                        count={mine.length}
                        emptyText={t('themes', 'empty')}
                        listClassName="presets-themes-grid"
                        emptyClassName="presets-themes-empty"
                    >
                        {mine.map((theme) => {
                            const actions = SEED_IDS.has(theme.id) ? {} : {
                                onShare: () => { void handleShare(theme); },
                                onEdit: () => startEdit(theme, 'local'),
                                onDelete: () => handleDeleteLocal(theme),
                            };
                            const actionCount = countItemActions(actions);
                            return (
                                <li key={theme.id} className={cardClass('presets-themes-card', actionCount, isActiveTheme(theme) ? ' presets-themes-card--active' : '')}>
                                    <button
                                        type="button"
                                        className="presets-themes-card-inner"
                                        onClick={() => handleApply(theme)}
                                        aria-label={t('themes', 'applyAria', { name: theme.name })}
                                    >
                                        {renderDetails(theme, themeDescription(theme), themeCategory(theme))}
                                    </button>
                                    {actionCount > 0 && (
                                        <ItemActions itemName={theme.name} {...actions} editing={form.isEditing('local', theme.id)} busy={cloud.blocked} />
                                    )}
                                </li>
                            );
                        })}
                    </ItemList>

                    <CreateRow visible={form.showCreateButton}>
                        <button
                            type="button"
                            className="spinly-new-btn spinly-btn-primary"
                            onClick={form.startCreate}
                            disabled={!activeTheme}
                            aria-label={t('themes', 'saveCurrentAria')}
                            aria-expanded={false}
                            aria-controls={FORM_ID}
                        >
                            <Icon name="save" size={15} />
                            {t('themes', 'saveCurrent')}
                        </button>
                    </CreateRow>
                </>
            ) : (
                <ItemList
                    search={communitySearch}
                    onSearch={setCommunitySearch}
                    searchPlaceholder={t('common', 'searchCommunity')}
                    searchLabel={t('themes', 'searchCommunityAria')}
                    count={shared.length}
                    emptyText={t('themes', 'emptyCommunity')}
                    listClassName="presets-themes-grid"
                    emptyClassName="presets-themes-empty"
                    loading={community.loading}
                    loadingText={t('common', 'loadingCommunity')}
                    error={community.error ? tm(community.error) : null}
                >
                    {shared.map(({ theme, author, authorId }) => {
                        // Solo decide qué se muestra; la autorización real la impone RLS.
                        const actions = userId && authorId === userId ? {
                            onEdit: () => startEdit(theme, 'cloud'),
                            onDelete: () => { void handleDeleteCloud(theme); },
                        } : {};
                        const actionCount = countItemActions(actions);
                        return (
                            <li key={theme.id} className={cardClass('presets-themes-card presets-themes-card--community', actionCount)}>
                                <div className="presets-themes-card-inner">
                                    {renderDetails(theme, theme.description, theme.category)}
                                    <AuthorTag author={author} />
                                    <button
                                        type="button"
                                        className="spinly-action-btn"
                                        onClick={() => handleDownload(theme)}
                                        aria-label={t('themes', 'downloadAria', { name: theme.name })}
                                    >
                                        <Icon name="download" size={14} />
                                        {t('themes', 'download')}
                                    </button>
                                </div>
                                {actionCount > 0 && (
                                    <ItemActions itemName={theme.name} {...actions} cloud editing={form.isEditing('cloud', theme.id)} busy={cloud.blocked} />
                                )}
                            </li>
                        );
                    })}
                </ItemList>
            )}

            <CollapsePanel
                id={FORM_ID}
                open={form.open}
                title={formTitle}
                hint={mode !== 'create' ? t('themes', 'editHint') : undefined}
                submitLabel={submitLabel}
                submitDisabled={!activeTheme || (mode === 'cloud' && cloud.blocked)}
                onSubmit={() => { void handleSubmit(); }}
                onClose={form.close}
            >
                <input type="text" className="spinly-field-input" value={shownDraft.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    placeholder={t('themes', 'namePh')} aria-label={t('themes', 'namePh')} maxLength={32} />
                <textarea className="spinly-field-input spinly-field-input--textarea" value={shownDraft.description}
                    onChange={(event) => updateField('description', event.target.value)}
                    placeholder={t('themes', 'descPh')} aria-label={t('themes', 'descPh')} maxLength={120} rows={2} />
                <div className="spinly-field-row">
                    <input type="text" className="spinly-field-input" value={shownDraft.styleTag}
                        onChange={(event) => updateField('styleTag', event.target.value)}
                        placeholder={t('themes', 'stylePh')} aria-label={t('themes', 'stylePh')} maxLength={24} />
                    <input type="text" className="spinly-field-input" value={shownDraft.category}
                        onChange={(event) => updateField('category', event.target.value)}
                        placeholder={t('themes', 'catPh')} aria-label={t('themes', 'catPh')} maxLength={24} />
                </div>
            </CollapsePanel>
        </div>
    );
}

export default Themes;
