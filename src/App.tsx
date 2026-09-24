import React, { lazy, Suspense, useState, useEffect, type ComponentType } from 'react';
import Header from './Components/layout/Header';
import WheelManager, { type WheelSectionId } from './Components/layout/WheelManager';
import WheelEditor from './Components/editor/WheelEditor';
import Wheel, { type WheelColorField } from './Components/wheel/Wheel';
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
    OPTIONS_STORAGE_KEY,
    PRESETS_STORAGE_KEY,
    THEMES_STORAGE_KEY,
    WHEEL_LIMIT_STORAGE_KEY,
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

// Colores antiguos de flecha y aro de los temas semilla: si siguen intactos se sustituyen
// por los actuales de la semilla; los que eligió el usuario se respetan.
const LEGACY_SEED_COLORS: Record<string, { pointerColor: string; borderColor: string }> = {
    'theme-obsidian': { pointerColor: '#818cf8', borderColor: '#0b0f19' },
    'theme-neon': { pointerColor: '#ffffff', borderColor: '#0b0f19' },
};
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
 * lazy() que, una vez descargado el módulo, se sustituye por el componente real. Un lazy
 * que se monta por primera vez siempre suspende, y React retiene ~300 ms el contenido que
 * llega tras un fallback: cambiar de panel se notaba a tirones aunque ya estuviera precargado.
 */
function preloadable<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
    // Se guarda el módulo y `default` se lee al renderizar, como hace React.lazy: leerlo al
    // resolver la promesa rompe con el hot reload si el módulo aún se está evaluando.
    let module: { default: ComponentType<P> } | null = null;
    const Lazy = lazy(load);
    // Un fallo de precarga (red, recarga en caliente) no es un error: el panel lo reintenta al abrirse.
    const preload = () => load().then((loaded) => { module = loaded; }, () => undefined);
    return { preload, get Component(): ComponentType<P> { return module?.default ?? Lazy; } };
}

const PresetsPanel = preloadable(() => import('./Components/presets/Presets'));
const ThemesPanel = preloadable(() => import('./Components/themes/Themes'));

/** Precarga los paneles secundarios cuando el navegador queda libre tras el primer pintado. */
function prefetchPanels(): () => void {
    const run = () => {
        void PresetsPanel.preload();
        void ThemesPanel.preload();
    };
    if ('requestIdleCallback' in window) {
        const id = window.requestIdleCallback(run, { timeout: 4000 });
        return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, 2000);
    return () => clearTimeout(id);
}

// "Option"/"Opción": identifica las opciones con nombre por defecto que el usuario no ha editado.
const DEFAULT_OPTION_LABELS = Object.values(STRINGS.options.defaultName);

function App() {
    const { lang, t } = useTranslation();
    // La ruleta vuelve tal como se dejó; las 4 opciones por defecto solo aparecen la primera vez.
    const [options, setOptions] = useState<WheelOption[]>(() => {
        try {
            const stored = localStorage.getItem(OPTIONS_STORAGE_KEY);
            const clean = stored ? sanitizeOptions(JSON.parse(stored), 'stored').slice(0, MAX_WHEEL_OPTIONS) : [];
            if (clean.length >= MIN_OPTIONS) return clean;
        } catch {
            // Storage corrupto o inaccesible: se empieza con las opciones por defecto.
        }
        return createDefaultOptions(t('options', 'defaultName'));
    });
    const [activeSection, setActiveSection] = useState<WheelSectionId>('options');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        const label = pickText('options', 'defaultName', lang);
        setOptions((prev) => relabelDefaultOptions(prev, DEFAULT_OPTION_LABELS, label));
    }, [lang]);
    // Se guarda la clave de lo que falló y no el texto, para que el aviso se traduzca si cambia el idioma.
    const [storageWarning, setStorageWarning] = useState<StorageWhat | null>(null);
    // Sin transición en la carga inicial: solo a partir de la primera interacción.
    const [isMenuAnimated, setIsMenuAnimated] = useState(false);
    // Los borradores viven aquí y no en el panel para sobrevivir a una visita al editor.
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
            // Formato antiguo: { activeTheme, savedThemes }.
            const legacy = localStorage.getItem(THEMES_STORAGE_KEY);
            if (legacy) {
                const data = JSON.parse(legacy);
                const candidate = Array.isArray(data) ? null : data?.activeTheme;
                const cleanLegacy = sanitizeTheme(candidate);
                if (cleanLegacy) return cleanLegacy;
            }
        } catch {
            // Storage corrupto: se usan los valores por defecto.
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
            // Storage corrupto: se usan los valores por defecto.
        }
        return [];
        });
    const savedThemes: WheelTheme[] = [...DEFAULT_THEMES, ...userThemes];

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
                        // Formatos anteriores a WheelPreset: se ignoran.
                        if (raw && typeof raw === 'object' && Array.isArray((raw as { options?: unknown }).options)) {
                            const clean = sanitizePreset(raw);
                            if (clean && !clean.id.startsWith('default-preset-')) out.push(clean);
                        }
                    }
                    return out;
                }
            }
        } catch {
            // Storage corrupto: se usan los valores por defecto.
        }
        return [];
    });
    const savedPresets: WheelPreset[] = [...DEFAULT_PRESETS, ...userPresets];

    const [activePresetId, setActivePresetId] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            const stored = localStorage.getItem(ACTIVE_PRESET_STORAGE_KEY);
            if (stored && typeof stored === 'string') return stored;
        } catch {
            // Sin acceso a storage (modo privado): el estado sigue en memoria.
        }
        return null;
    });

    // Nunca por debajo de las opciones que ya hay: una ruleta guardada con más de 14 sigue editable.
    const [wheelLimit, setWheelLimit] = useState<number>(() => {
        let limit = DEFAULT_WHEEL_LIMIT;
        try {
            const stored = localStorage.getItem(WHEEL_LIMIT_STORAGE_KEY);
            const n = stored ? Number(stored) : NaN;
            if (Number.isFinite(n)) limit = Math.min(Math.max(Math.round(n), MIN_OPTIONS), MAX_WHEEL_OPTIONS);
        } catch {
            // Sin acceso a storage (modo privado): el estado sigue en memoria.
        }
        return Math.max(limit, options.length);
    });

    // Un preset con más opciones que el límite lo sube lo justo, sin persistirlo.
    useEffect(() => {
        setWheelLimit((prev) => Math.max(prev, options.length));
    }, [options.length]);

    // setItem falla antes de escribir: con la cuota llena lo ya guardado sigue intacto y solo se avisa.
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
            // Sin acceso a storage (modo privado): la ruleta sigue en memoria.
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
            // Sin acceso a storage (modo privado): el estado sigue en memoria.
        }
    }, [activePresetId]);

    const handleSectionChange = (section: WheelSectionId): void => {
        setActiveSection(section);
        setIsMenuOpen(false);
    };

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

    const handleDeleteTheme = (id: string) => {
        setUserThemes((prev) => prev.filter((t) => t.id !== id));
    };

    // Expande la paleta al número de opciones; los nombres no se tocan.
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

    const handleDeletePreset = (id: string) => {
        if (id === activePresetId) setActivePresetId(null);
        setUserPresets((prev) => prev.filter((p) => p.id !== id));
    };

    // Mismo id: nombre y tags del formulario, opciones y tema actuales de la ruleta.
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

    // Conserva el id de la comunidad: el contador de descargados compara por id y
    // reimportar el mismo preset sustituye la copia en vez de duplicarla.
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

    // Flecha y luces forman parte del tema activo: se guardan con él en temas y presets.
    const handleWheelColor = (field: WheelColorField, color: string) => {
        setActiveTheme((prev) => (prev ? { ...prev, [field]: color } : prev));
    };

    const toggleMenu = () => {
        setIsMenuAnimated(true);
        setIsMenuOpen(prev => !prev);
    };

    const closeMenu = () => setIsMenuOpen(false);

    useEffect(prefetchPanels, []);
    useButtonSounds();
    // Con cuenta, la ruleta, los temas y los preajustes viajan con ella (useAccountSync).
    useAccountSync(useAccountSession(), {
        options,
        activeTheme,
        activePresetId,
        wheelLimit,
        themes: userThemes,
        presets: userPresets,
    });

    const renderPanel = (): React.ReactNode => {
        const Presets = PresetsPanel.Component;
        const Themes = ThemesPanel.Component;
        switch (activeSection) {
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
        <div className="App">
            <Header isMenuOpen={isMenuOpen} onToggleMenu={toggleMenu} />
            <main className={`Main Main--${activeSection}`}>
                <WheelManager
                    activeSection={activeSection}
                    onSectionChange={handleSectionChange}
                    isOpen={isMenuOpen}
                    isAnimated={isMenuAnimated}
                    onClose={closeMenu}
                />
                <div className="spinly-panel">
                    <Suspense fallback={null}>
                        {renderPanel()}
                    </Suspense>
                </div>
                {/* Siempre montada: cambiar de sección no reinicia la ruleta */}
                <Wheel options={options} activeTheme={activeTheme} onColorChange={handleWheelColor} />
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
        </div>
    );
}

export default App;