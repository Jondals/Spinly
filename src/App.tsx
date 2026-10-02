/**
 * App: the root component. It owns the wheel's options, the active theme, the user's themes, presets and
 * playlist (persisted in localStorage and synced with the account), and lays out the header, the section
 * menu, the active panel, the wheel and tournament mode.
 */
import React, { lazy, startTransition, Suspense, useState, useEffect, type ComponentType } from 'react';
import Header from './Components/layout/Header';
import WheelManager, { type WheelSectionId } from './Components/layout/WheelManager';
import WheelEditor from './Components/editor/WheelEditor';
import Wheel, { type WheelColorField } from './Components/wheel/Wheel';
import CustomCursor from './Components/common/CustomCursor';
import { hideSplash } from './scripts/splash';
import MusicProvider from './Components/music/MusicProvider';
import { readMusicLibrary, writeMusicLibrary, type MusicLibrary } from './scripts/music-library';
import { useTranslation } from './Components/i18n/LanguageProvider';
import { useButtonSounds } from './hooks/useButtonSounds';
import { useAccountSync } from './hooks/useAccountSync';
import { useAccountSession } from './hooks/useSessionUserId';
import { createDefaultOptions, relabelDefaultOptions, DEFAULT_WHEEL_LIMIT, MAX_WHEEL_OPTIONS, MIN_OPTIONS, type WheelOption } from './scripts/option-wheel';
import {
    ACTIVE_PRESET_STORAGE_KEY,
    ACTIVE_THEME_STORAGE_KEY,
    DEFAULT_PRESETS,
    DEFAULT_THEMES,
    HIDDEN_DEFAULTS_STORAGE_KEY,
    OPTIONS_STORAGE_KEY,
    PRESETS_STORAGE_KEY,
    THEMES_STORAGE_KEY,
    clonePreset,
    cloneTheme,
    ensureSegments,
    sanitizeOptions,
    sanitizePreset,
    sanitizeTheme,
    type WheelPreset,
    type WheelTheme,
} from './types/theme-types';

import { pickText, STRINGS } from './scripts/strings';
import type { PresetDraft, ThemeDraft } from './types/form-drafts';
import './css/index.css';

type StorageWhat = 'whatThemes' | 'whatActiveTheme' | 'whatPresets';

// Old pointer and rim colors of the seed themes: if still untouched they are replaced with the seed's
// current ones; colors the user picked are kept.
const LEGACY_SEED_COLORS: Record<string, { pointerColor: string; borderColor: string }> = {
    'theme-obsidian': { pointerColor: '#818cf8', borderColor: '#0b0f19' },
    'theme-neon': { pointerColor: '#ffffff', borderColor: '#0b0f19' },
};
/** Upgrades a seed theme saved with the old default colors. */
const withoutLegacySeedColors = (theme: WheelTheme): WheelTheme => {
    const legacy = LEGACY_SEED_COLORS[theme.id];
    const seed = DEFAULT_THEMES.find((item) => item.id === theme.id);
    if (!legacy || !seed) return theme;
    return {
        ...theme,
        pointerColor: !theme.pointerColor || theme.pointerColor === legacy.pointerColor ? seed.pointerColor : theme.pointerColor,
        lightColor: theme.lightColor ?? seed.lightColor,
        borderColor: theme.borderColor === legacy.borderColor ? undefined : theme.borderColor,
        centerColor: undefined,
    };
};

/**
 * A lazy() that is replaced by the real component once its module has been downloaded. A lazy component
 * mounting for the first time always suspends, and React holds back content arriving after a fallback for
 * ~300 ms: switching panels felt jerky even when they were already preloaded.
 */
function preloadable<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
    // The module is stored and `default` is read at render time, like React.lazy does: reading it when the
    // promise resolves breaks hot reload if the module is still being evaluated.
    let module: { default: ComponentType<P> } | null = null;
    const Lazy = lazy(load);
    // A preload failure (network, hot reload) is not an error: the panel retries when it opens.
    const preload = () => load().then((loaded) => { module = loaded; }, () => undefined);
    return { preload, get Component(): ComponentType<P> { return module?.default ?? Lazy; } };
}

const PresetsPanel = preloadable(() => import('./Components/presets/Presets'));
const ThemesPanel = preloadable(() => import('./Components/themes/Themes'));
const TournamentPanel = preloadable(() => import('./Components/tournament/Tournament'));

/** Preloads the secondary panels when the browser is idle after the first paint. */
function prefetchPanels(): () => void {
    /** Starts preloading every secondary panel. */
    const run = () => {
        void PresetsPanel.preload();
        void ThemesPanel.preload();
        void TournamentPanel.preload();
    };
    if ('requestIdleCallback' in window) {
        const id = window.requestIdleCallback(run, { timeout: 4000 });
        return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, 2000);
    return () => clearTimeout(id);
}

/**
 * Behind the splash screen the app mounts in two steps: first the header and the wheel and, once they are
 * painted, the menu, the panel and the cursor. Mounting everything at once was a single long task (mostly
 * layout) that blocked the main thread; this way it is two short ones, hidden by the splash.
 * Without a splash in front (remounting after an account switch, or in tests), everything mounts at once.
 */
function useStagedMount(): boolean {
    const [ready, setReady] = useState(() => !document.getElementById('spinly-splash'));
    useEffect(() => {
        if (ready) return undefined;
        let timer = 0;
        const frame = requestAnimationFrame(() => {
            timer = window.setTimeout(() => startTransition(() => setReady(true)), 0);
        });
        return () => {
            cancelAnimationFrame(frame);
            window.clearTimeout(timer);
        };
    }, [ready]);
    return ready;
}

// "Option"/"Opción": identifies options that still have their untouched default name.
const DEFAULT_OPTION_LABELS = Object.values(STRINGS.options.defaultName);

/** Root component: state, persistence, account sync and layout. */
function App() {
    const { lang, t } = useTranslation();
    const ready = useStagedMount();
    // The wheel comes back as it was left; the 4 default options only appear the first time.
    const [options, setOptions] = useState<WheelOption[]>(() => {
        try {
            const stored = localStorage.getItem(OPTIONS_STORAGE_KEY);
            const clean = stored ? sanitizeOptions(JSON.parse(stored), 'stored').slice(0, MAX_WHEEL_OPTIONS) : [];
            if (clean.length >= MIN_OPTIONS) return clean;
        } catch {
            // Broken or inaccessible storage: start with the default options.
        }
        return createDefaultOptions(t('options', 'defaultName'));
    });
    const [activeSection, setActiveSection] = useState<WheelSectionId>('options');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        const label = pickText('options', 'defaultName', lang);
        setOptions((prev) => relabelDefaultOptions(prev, DEFAULT_OPTION_LABELS, label));
    }, [lang]);
    // The key of what failed is stored rather than the text, so the warning is translated if the language changes.
    const [storageWarning, setStorageWarning] = useState<StorageWhat | null>(null);
    // No transition on the initial load: only from the first interaction on.
    const [isMenuAnimated, setIsMenuAnimated] = useState(false);
    // Drafts live here rather than in the panel so they survive a trip to the editor.
    const [themeDraft, setThemeDraft] = useState<ThemeDraft | null>(null);
    const [presetDraft, setPresetDraft] = useState<PresetDraft | null>(null);

    const [activeTheme, setActiveTheme] = useState<WheelTheme | null>(() => {
        if (typeof window === 'undefined') return DEFAULT_THEMES[0] ?? null;
        try {
            const stored = localStorage.getItem(ACTIVE_THEME_STORAGE_KEY);
            if (stored) {
                const clean = sanitizeTheme(JSON.parse(stored));
                if (clean) return withoutLegacySeedColors(clean);
            }
            // Old format: { activeTheme, savedThemes }.
            const legacy = localStorage.getItem(THEMES_STORAGE_KEY);
            if (legacy) {
                const data = JSON.parse(legacy);
                const candidate = Array.isArray(data) ? null : data?.activeTheme;
                const cleanLegacy = sanitizeTheme(candidate);
                if (cleanLegacy) return cleanLegacy;
            }
        } catch {
            // Broken storage: the defaults are used.
        }
        return DEFAULT_THEMES[0] ?? null;
    });

    const [userThemes, setUserThemes] = useState<WheelTheme[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const stored = localStorage.getItem(THEMES_STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                const list = Array.isArray(data) ? data : data?.savedThemes;
                if (Array.isArray(list)) {
                    return (list as unknown[])
                        .map((t) => sanitizeTheme(t))
                        .filter((t): t is WheelTheme => t !== null && !t.id.startsWith('preset-'));
                }
            }
        } catch {
            // Broken storage: the defaults are used.
        }
        return [];
    });
    // Sample themes and presets can be deleted: which ones is remembered so they stay hidden.
    const [hiddenDefaults, setHiddenDefaults] = useState<string[]>(() => {
        try {
            const raw: unknown = JSON.parse(localStorage.getItem(HIDDEN_DEFAULTS_STORAGE_KEY) ?? '[]');
            return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
        } catch {
            return [];
        }
    });
    useEffect(() => {
        try {
            localStorage.setItem(HIDDEN_DEFAULTS_STORAGE_KEY, JSON.stringify(hiddenDefaults));
        } catch {
            // No storage access: forgotten on reload.
        }
    }, [hiddenDefaults]);
    /** Hides a sample theme or preset. */
    const hideDefault = (id: string) => setHiddenDefaults((prev) => (prev.includes(id) ? prev : [...prev, id]));

    const savedThemes: WheelTheme[] = [...DEFAULT_THEMES.filter((theme) => !hiddenDefaults.includes(theme.id)), ...userThemes];

    const [userPresets, setUserPresets] = useState<WheelPreset[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                const list = Array.isArray(data) ? data : data?.savedPresets;
                if (Array.isArray(list)) {
                    const out: WheelPreset[] = [];
                    for (const raw of list as unknown[]) {
                        // Formats older than WheelPreset are ignored.
                        if (raw && typeof raw === 'object' && Array.isArray((raw as { options?: unknown }).options)) {
                            const clean = sanitizePreset(raw);
                            if (clean && !clean.id.startsWith('default-preset-')) out.push(clean);
                        }
                    }
                    return out;
                }
            }
        } catch {
            // Broken storage: the defaults are used.
        }
        return [];
    });
    const savedPresets: WheelPreset[] = [...DEFAULT_PRESETS.filter((preset) => !hiddenDefaults.includes(preset.id)), ...userPresets];

    const [activePresetId, setActivePresetId] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            const stored = localStorage.getItem(ACTIVE_PRESET_STORAGE_KEY);
            if (stored && typeof stored === 'string') return stored;
        } catch {
            // No storage access (private mode): the state stays in memory.
        }
        return null;
    });

    // Always 14 on open (it can go up to 25 in the editor, for this visit only). Never below the current
    // number of options: a saved wheel with more than 14 stays editable.
    const [wheelLimit, setWheelLimit] = useState<number>(() => Math.max(DEFAULT_WHEEL_LIMIT, options.length));

    // A preset with more options than the limit raises it just enough, without persisting it.
    useEffect(() => {
        setWheelLimit((prev) => Math.max(prev, options.length));
    }, [options.length]);

    /** Shows a warning when storage is full. setItem fails before writing, so whatever was saved stays intact. */
    const reportStorageError = (error: unknown, what: StorageWhat): void => {
        const name = (error as { name?: string } | null)?.name;
        const code = (error as { code?: number } | null)?.code;
        const message = String((error as { message?: string } | null)?.message ?? error);
        const isQuota = name === 'QuotaExceededError' || code === 22 || /quota|exceed/i.test(message);
        if (isQuota) setStorageWarning(what);
    };

    useEffect(() => {
        try {
            localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
        } catch {
            // No storage access (private mode): the wheel stays in memory.
        }
    }, [options]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify(userThemes));
        } catch (error) {
            reportStorageError(error, 'whatThemes');
        }
    }, [userThemes]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            if (activeTheme) localStorage.setItem(ACTIVE_THEME_STORAGE_KEY, JSON.stringify(activeTheme));
        } catch (error) {
            reportStorageError(error, 'whatActiveTheme');
        }
    }, [activeTheme]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(userPresets));
        } catch (error) {
            reportStorageError(error, 'whatPresets');
        }
    }, [userPresets]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            if (activePresetId) localStorage.setItem(ACTIVE_PRESET_STORAGE_KEY, activePresetId);
            else localStorage.removeItem(ACTIVE_PRESET_STORAGE_KEY);
        } catch {
            // No storage access (private mode): the state stays in memory.
        }
    }, [activePresetId]);

    /** Switches section (and closes the mobile drawer). */
    const handleSectionChange = (section: WheelSectionId): void => {
        setActiveSection(section);
        setIsMenuOpen(false);
    };

    /** Saves (or updates) a theme and applies it. */
    const handleSaveTheme = (theme: WheelTheme) => {
        const full: WheelTheme = {
            ...theme,
            segments: ensureSegments(theme.segments, Math.max(options.length, 1)),
        };
        setUserThemes((prev) => {
            if (prev.some((t) => t.id === full.id)) {
                return prev.map((t) => (t.id === full.id ? full : t));
            }
            return [...prev, full];
        });
        setActiveTheme(full);
    };

    /** Deletes a user theme, or hides a sample one. */
    const handleDeleteTheme = (id: string) => {
        if (DEFAULT_THEMES.some((theme) => theme.id === id)) hideDefault(id);
        else setUserThemes((prev) => prev.filter((t) => t.id !== id));
    };

    /** Applies a theme, expanding its palette to the number of options; option names are untouched. */
    const handleSetActiveTheme: React.Dispatch<React.SetStateAction<WheelTheme | null>> = (value) => {
        const base = typeof value === 'function'
            ? (value as (p: WheelTheme | null) => WheelTheme | null)(activeTheme)
            : value;
        if (!base) {
            setActiveTheme(null);
            return;
        }
        const expanded = ensureSegments(base.segments, Math.max(options.length, 1));
        setActiveTheme({ ...base, segments: expanded });
    };

    /** Saves the current wheel (options + theme) as a new preset. */
    const handleSavePreset = (name: string, tags?: string[]) => {
        if (!activeTheme) return;
        const preset: WheelPreset = {
            id: crypto.randomUUID(),
            name: name.trim() || t('presets', 'untitled'),
            options: options.map((o) => ({ ...o })),
            theme: cloneTheme(activeTheme),
            updatedAt: Date.now(),
            tags: tags && tags.length > 0 ? tags : [],
        };
        setUserPresets((prev) => [preset, ...prev]);
        setActivePresetId(preset.id);
    };

    /** Loads a preset's options and theme onto the wheel. */
    const handleLoadPreset = (preset: WheelPreset) => {
        setOptions(preset.options.map((o) => ({ ...o })));
        setActiveTheme(
            preset.theme.id.startsWith('default-theme-')
                ? cloneTheme(preset.theme)
                : cloneTheme({
                      ...preset.theme,
                      segments: ensureSegments(preset.theme.segments, Math.max(preset.options.length, 1)),
                  })
        );
        setActivePresetId(preset.id);
    };

    /** Deletes a user preset, or hides a sample one. */
    const handleDeletePreset = (id: string) => {
        if (id === activePresetId) setActivePresetId(null);
        if (DEFAULT_PRESETS.some((preset) => preset.id === id)) hideDefault(id);
        else setUserPresets((prev) => prev.filter((p) => p.id !== id));
    };

    /** Updates a preset in place: name and tags from the form, options and theme from the current wheel. */
    const handleUpdatePreset = (id: string, name: string, tags: string[]) => {
        if (!activeTheme) return;
        setUserPresets((prev) => prev.map((p) => (p.id === id
            ? {
                ...p,
                name: name.trim() || p.name,
                tags,
                options: options.map((o) => ({ ...o })),
                theme: cloneTheme(activeTheme),
                updatedAt: Date.now(),
            }
            : p)));
        setActivePresetId(id);
    };

    /**
     * Imports a community preset and loads it. It keeps the community id: the downloaded counter compares by id
     * and importing the same preset again replaces the copy instead of duplicating it.
     */
    const handleImportPreset = (preset: WheelPreset) => {
        const copy: WheelPreset = {
            ...clonePreset(preset),
            updatedAt: Date.now(),
        };
        setUserPresets((prev) => [copy, ...prev.filter((p) => p.id !== copy.id)]);
        setOptions(copy.options.map((o) => ({ ...o })));
        setActiveTheme(cloneTheme({
            ...copy.theme,
            segments: ensureSegments(copy.theme.segments, Math.max(copy.options.length, 1)),
        }));
        setActivePresetId(copy.id);
    };

    /** Pointer and lights are part of the active theme, so they are saved with it in themes and presets. */
    const handleWheelColor = (field: WheelColorField, color: string) => {
        setActiveTheme((prev) => (prev ? { ...prev, [field]: color } : prev));
    };

    /** Opens or closes the mobile drawer. */
    const toggleMenu = () => {
        setIsMenuAnimated(true);
        setIsMenuOpen(prev => !prev);
    };

    /** Closes the mobile drawer. */
    const closeMenu = () => setIsMenuOpen(false);

    useEffect(prefetchPanels, []);
    // The app is painted: the splash screen can go.
    useEffect(hideSplash, []);

    // No right-click menu (nor the long-press one on touch): the app has nothing to offer there and it breaks
    // the app feel. It is kept in text fields so pasting still works.
    useEffect(() => {
        /** Blocks the context menu outside text fields. */
        const onContextMenu = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')) return;
            event.preventDefault();
        };
        document.addEventListener('contextmenu', onContextMenu);
        return () => document.removeEventListener('contextmenu', onContextMenu);
    }, []);
    useButtonSounds();

    // Music playlist: it travels with the account; playback is handled by MusicProvider.
    const [musicLibrary, setMusicLibrary] = useState<MusicLibrary>(readMusicLibrary);
    useEffect(() => {
        writeMusicLibrary(musicLibrary);
    }, [musicLibrary]);

    // With an account, the wheel, themes, presets and music travel with it (useAccountSync).
    const session = useAccountSession();
    useAccountSync(session, {
        options,
        activeTheme,
        activePresetId,
        wheelLimit,
        themes: userThemes,
        presets: userPresets,
        music: musicLibrary,
    });

    /** The panel of the active section (tournament mode has none: it takes over the wheel area). */
    const renderPanel = (): React.ReactNode => {
        const Presets = PresetsPanel.Component;
        const Themes = ThemesPanel.Component;
        switch (activeSection) {
            case 'tournament':
                return null;
            case 'presets':
                return (
                    <Presets
                        savedPresets={savedPresets}
                        activePresetId={activePresetId}
                        currentOptions={options}
                        activeTheme={activeTheme}
                        onSavePreset={handleSavePreset}
                        onLoadPreset={handleLoadPreset}
                        onDeletePreset={handleDeletePreset}
                        onUpdatePreset={handleUpdatePreset}
                        onImportPreset={handleImportPreset}
                        draft={presetDraft}
                        setDraft={setPresetDraft}
                    />
                );
            case 'themes':
                return (
                    <Themes
                        activeTheme={activeTheme}
                        setActiveTheme={handleSetActiveTheme}
                        savedThemes={savedThemes}
                        onSaveTheme={handleSaveTheme}
                        onDeleteTheme={handleDeleteTheme}
                        draft={themeDraft}
                        setDraft={setThemeDraft}
                    />
                );
            case 'options':
            default:
                return (
                    <WheelEditor
                        options={options}
                        setOptions={setOptions}
                        activeTheme={activeTheme}
                        setActiveTheme={setActiveTheme}
                        wheelLimit={wheelLimit}
                        setWheelLimit={setWheelLimit}
                    />
                );
        }
    };

    return (
        <MusicProvider library={musicLibrary} onLibraryChange={setMusicLibrary} session={session}>
            <div className="App">
                <Header isMenuOpen={isMenuOpen} onToggleMenu={toggleMenu} />
                <main className={`Main Main--${activeSection}`}>
                    {ready ? (
                        <WheelManager
                            activeSection={activeSection}
                            onSectionChange={handleSectionChange}
                            isOpen={isMenuOpen}
                            isAnimated={isMenuAnimated}
                            onClose={closeMenu}
                        />
                    ) : (
                        // Reserves its grid column so the wheel does not move when the menu arrives.
                        <div className="Wheelmanager" aria-hidden="true" />
                    )}
                    <div className="spinly-panel">
                        {ready && (
                            <Suspense fallback={null}>
                                {renderPanel()}
                            </Suspense>
                        )}
                    </div>
                    {/* Always mounted: switching sections never resets the wheel (in the tournament it stays hidden and still) */}
                    <Wheel options={options} activeTheme={activeTheme} onColorChange={handleWheelColor} active={activeSection !== 'tournament'} />
                    {ready && activeSection === 'tournament' && (
                        <Suspense fallback={<div className="spinly-tournament" />}>
                            <TournamentPanel.Component wheelNames={options.map((option) => option.name)} onColorChange={handleWheelColor} />
                        </Suspense>
                    )}
                </main>

                {storageWarning && (
                    <div className="spinly-storage-warning" role="alert">
                        <span>{t('common', 'noSpace', { what: t('common', storageWarning) })}</span>
                        <button
                            type="button"
                            onClick={() => setStorageWarning(null)}
                            aria-label={t('common', 'dismissStorage')}
                        >✕</button>
                    </div>
                )}
                {ready && <CustomCursor />}
            </div>
        </MusicProvider>
    );
}

export default App;