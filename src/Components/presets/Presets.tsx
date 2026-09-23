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
import OptionChips from './OptionChips';
import { useTranslation } from '../i18n/LanguageProvider';
import { useCloudCooldown } from '../../hooks/useCloudCooldown';
import { useCommunity } from '../../hooks/useCommunity';
import { initialView, useDraftForm, type PanelView } from '../../hooks/useDraftForm';
import { useSessionUserId } from '../../hooks/useSessionUserId';
import { deleteSharedPreset, fetchCommunityPresets, sharePreset, updateSharedPreset } from '../../scripts/community';
import { dictMessage, seedText } from '../../scripts/strings';
import type { WheelOption } from '../../scripts/option-wheel';
import { timeAgo, type WheelPreset, type WheelTheme } from '../../types/theme-types';
import type { PresetDraft } from '../../types/form-drafts';
import '../../css/Presets.css';

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
    draft: PresetDraft | null;
    setDraft: Dispatch<SetStateAction<PresetDraft | null>>;
}

const FORM_ID = 'presets-form';
const EMPTY_DRAFT: PresetDraft = { target: { mode: 'create' }, name: '', tags: '' };

// Los presets semilla no se pueden editar, borrar ni compartir.
const isSeed = (id: string) => id.startsWith('default-preset-');

const parseTags = (raw: string): string[] => raw.split(',').map((tag) => tag.trim()).filter(Boolean);

const cardClass = (base: string, actionCount: number, extra = '') =>
    `${base} spinly-panel-card${extra}${actionCount ? ` spinly-card--actions-${actionCount}` : ''}`;

function Presets({ savedPresets, activePresetId, currentOptions, activeTheme, onSavePreset, onLoadPreset, onDeletePreset, onUpdatePreset, onImportPreset, draft, setDraft }: PresetsProps) {
    const { lang, t, tm } = useTranslation();
    const userId = useSessionUserId();
    const cloud = useCloudCooldown();
    const [view, setView] = useState<PanelView>(() => initialView(draft));
    const [search, setSearch] = useState('');
    const [communitySearch, setCommunitySearch] = useState('');
    const [notice, setNotice] = useState<Notice | null>(null);
    const community = useCommunity(fetchCommunityPresets, view === 'community');
    const form = useDraftForm(draft, setDraft, EMPTY_DRAFT, view);
    const { shownDraft } = form;

    // Los presets semilla se localizan; los del usuario se muestran tal cual.
    const displayName = (preset: WheelPreset): string => seedText(preset.id, 'name', lang) ?? preset.name;

    const query = search.trim().toLowerCase();
    const mine = savedPresets.filter((preset) =>
        displayName(preset).toLowerCase().includes(query)
        || (preset.tags ?? []).some((tag) => tag.toLowerCase().includes(query)));

    const communityQuery = communitySearch.trim().toLowerCase();
    const shared = community.items.filter(({ preset, author }) =>
        preset.name.toLowerCase().includes(communityQuery)
        || authorName(author, t('common', 'unknownUser')).toLowerCase().includes(communityQuery));

    const savedIds = new Set(savedPresets.map((preset) => preset.id));
    const downloaded = community.items.filter(({ preset }) => savedIds.has(preset.id)).length;
    const canSubmit = Boolean(activeTheme) && currentOptions.length > 0;

    const handleShare = async (preset: WheelPreset) => {
        setNotice(null);
        const result = await cloud.run(preset.id, () => sharePreset(preset));
        if (!result) return;
        if (!result.ok) {
            setNotice({ tone: 'error', text: result.error });
            return;
        }
        setNotice({ tone: 'ok', text: dictMessage('presets', 'sharedOk', { name: preset.name }) });
        community.refresh();
    };

    const handleUse = (preset: WheelPreset) => {
        onImportPreset(preset);
        setNotice({ tone: 'ok', text: dictMessage('presets', 'usedOk', { name: preset.name }) });
    };

    // Editar carga el preset en la ruleta (sus opciones se cambian en el editor) y abre el formulario.
    const startEdit = (preset: WheelPreset, mode: 'local' | 'cloud') => form.toggleEdit(
        mode,
        preset.id,
        () => ({ target: { mode, id: preset.id }, name: preset.name, tags: (preset.tags ?? []).join(', ') }),
        () => onLoadPreset(preset),
    );

    const handleSubmit = async () => {
        if (!draft || !canSubmit || !activeTheme) return;
        const { target } = draft;
        const name = draft.name.trim() || t('presets', 'untitled');
        const tags = parseTags(draft.tags);

        if (target.mode === 'cloud') {
            // UPDATE de la misma fila; la copia local, si existe, es independiente y no se toca.
            setNotice(null);
            const result = await cloud.run(target.id, () => updateSharedPreset(target.id, {
                id: target.id,
                name,
                tags,
                options: currentOptions.map((option) => ({ ...option })),
                theme: activeTheme,
                updatedAt: Date.now(),
            }));
            if (!result) return;
            if (!result.ok) {
                setNotice({ tone: 'error', text: result.error });
                return;
            }
            setNotice({ tone: 'ok', text: dictMessage('common', 'cloudUpdated', { name }) });
            community.refresh();
        } else if (target.mode === 'local') {
            onUpdatePreset(target.id, name, tags);
            setNotice({ tone: 'ok', text: dictMessage('presets', 'updatedOk', { name }) });
        } else {
            onSavePreset(name, tags);
        }
        form.close();
    };

    const handleDeleteLocal = (preset: WheelPreset) => {
        form.closeIfEditing('local', preset.id);
        onDeletePreset(preset.id);
    };

    const handleDeleteCloud = async (preset: WheelPreset) => {
        setNotice(null);
        const result = await cloud.run(preset.id, () => deleteSharedPreset(preset.id));
        if (!result) return;
        if (!result.ok) {
            setNotice({ tone: 'error', text: result.error });
            return;
        }
        form.closeIfEditing('cloud', preset.id);
        community.removeLocally((entry) => entry.preset.id !== preset.id);
        setNotice({ tone: 'ok', text: dictMessage('common', 'cloudDeleted', { name: preset.name }) });
        community.refresh();
    };

    const mode = shownDraft.target.mode;
    const formTitle = mode === 'cloud' ? t('presets', 'editCloudTitle') : mode === 'local' ? t('presets', 'editTitle') : t('presets', 'newTitle');
    const submitLabel = mode === 'cloud' ? t('common', 'updateCloud') : mode === 'local' ? t('common', 'saveChanges') : t('presets', 'create');
    const optionsBadge = (preset: WheelPreset) => (
        <span className="presets-presets-card-badge">{t('presets', 'optionsCount', { n: preset.options.length })}</span>
    );

    return (
        <div className="Presets presets-presets">
            <PanelHeader
                icon="presets"
                title={t('presets', 'title')}
                badge={view === 'mine'
                    ? t('presets', 'savedCount', { n: savedPresets.length })
                    : t('common', 'communityShort', { x: downloaded, y: community.items.length })}
                badgeTitle={view === 'community' ? t('common', 'communityCount', { x: downloaded, y: community.items.length }) : undefined}
            />
            <p className="presets-presets-subtitle">{t('presets', 'subtitle')}</p>

            <SegmentedToggle<PanelView>
                ariaLabel={t('presets', 'viewLabel')}
                value={view}
                onChange={setView}
                options={[
                    { id: 'mine', label: t('presets', 'mine') },
                    { id: 'community', label: t('common', 'community') },
                ]}
            />

            {notice && <StatusMessage tone={notice.tone}>{tm(notice.text)}</StatusMessage>}

            {view === 'mine' ? (
                <>
                    <ItemList
                        search={search}
                        onSearch={setSearch}
                        searchPlaceholder={t('presets', 'searchMine')}
                        searchLabel={t('presets', 'searchMineAria')}
                        count={mine.length}
                        emptyText={t('presets', 'empty')}
                        listClassName="presets-presets-grid"
                        emptyClassName="presets-presets-empty"
                    >
                        {mine.map((preset) => {
                            const isActive = preset.id === activePresetId;
                            const name = displayName(preset);
                            const actions = isSeed(preset.id) ? {} : {
                                onShare: () => { void handleShare(preset); },
                                onEdit: () => startEdit(preset, 'local'),
                                onDelete: () => handleDeleteLocal(preset),
                            };
                            const actionCount = countItemActions(actions);
                            return (
                                <li key={preset.id} className={cardClass('presets-presets-card', actionCount, isActive ? ' presets-presets-card--active' : '')}>
                                    <div className="presets-presets-card-inner">
                                        <div className="presets-presets-card-top">
                                            {optionsBadge(preset)}
                                            <span className="presets-presets-meta">
                                                {[`· ${timeAgo(preset.updatedAt, lang)}`, ...(preset.tags ?? []).map((tag) => `· ${tag}`)].join(' ')}
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
                                                    <Icon name="play" size={14} />
                                                    {t('presets', 'load')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {actionCount > 0 && (
                                        <ItemActions itemName={name} {...actions} editing={form.isEditing('local', preset.id)} busy={cloud.blocked} />
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
                            aria-label={t('presets', 'newAria')}
                            aria-expanded={false}
                            aria-controls={FORM_ID}
                        >
                            <Icon name="plus" /> {t('presets', 'newBtn')}
                        </button>
                    </CreateRow>
                </>
            ) : (
                <ItemList
                    search={communitySearch}
                    onSearch={setCommunitySearch}
                    searchPlaceholder={t('common', 'searchCommunity')}
                    searchLabel={t('presets', 'searchCommunityAria')}
                    count={shared.length}
                    emptyText={t('presets', 'emptyCommunity')}
                    listClassName="presets-presets-grid"
                    emptyClassName="presets-presets-empty"
                    loading={community.loading}
                    loadingText={t('common', 'loadingCommunity')}
                    error={community.error ? tm(community.error) : null}
                >
                    {shared.map(({ preset, author, authorId }) => {
                        // Solo decide qué se muestra; la autorización real la impone RLS.
                        const actions = userId && authorId === userId ? {
                            onEdit: () => startEdit(preset, 'cloud'),
                            onDelete: () => { void handleDeleteCloud(preset); },
                        } : {};
                        const actionCount = countItemActions(actions);
                        return (
                            <li key={preset.id} className={cardClass('presets-presets-card presets-presets-card--community', actionCount)}>
                                <div className="presets-presets-card-inner">
                                    <div className="presets-presets-card-top">{optionsBadge(preset)}</div>
                                    <span className="presets-presets-card-name">{preset.name}</span>
                                    <OptionChips options={preset.options} />
                                    <AuthorTag author={author} />
                                    <div className="presets-presets-card-actions">
                                        <button
                                            type="button"
                                            className="spinly-action-btn"
                                            onClick={() => handleUse(preset)}
                                            aria-label={t('presets', 'useAria', { name: preset.name })}
                                        >
                                            <Icon name="play" size={14} />
                                            {t('presets', 'use')}
                                        </button>
                                    </div>
                                </div>
                                {actionCount > 0 && (
                                    <ItemActions itemName={preset.name} {...actions} cloud editing={form.isEditing('cloud', preset.id)} busy={cloud.blocked} />
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
                hint={mode !== 'create' ? t('presets', 'editHint') : undefined}
                submitLabel={submitLabel}
                submitDisabled={!canSubmit || (mode === 'cloud' && cloud.blocked)}
                onSubmit={() => { void handleSubmit(); }}
                onClose={form.close}
            >
                <input
                    type="text"
                    className="spinly-field-input"
                    value={shownDraft.name}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                    placeholder={t('presets', 'namePh')}
                    aria-label={t('presets', 'namePh')}
                    maxLength={40}
                />
                <input
                    type="text"
                    className="spinly-field-input"
                    value={shownDraft.tags}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, tags: event.target.value } : prev))}
                    placeholder={t('presets', 'tagsPh')}
                    aria-label={t('presets', 'tagsPh')}
                    maxLength={80}
                />
            </CollapsePanel>
        </div>
    );
}

export default Presets;
