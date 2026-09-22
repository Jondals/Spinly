import React, { useState, useEffect } from 'react';
import Header from './Components/Header';
import Wheelmanager, { type WheelSectionId } from './Components/Wheelmanager';
import Options from './Components/Options';
import Wheel from './Components/Wheel';
import Presets from './Components/Presets';
import Themes from './Components/Themes';
import { createDefaultOptions, MAX_WHEEL_OPTIONS } from './scripts/option-wheel';
import {
    ACTIVE_PRESET_STORAGE_KEY,
    ACTIVE_THEME_STORAGE_KEY,
    DEFAULT_PRESETS,
    DEFAULT_THEMES,
    PRESETS_STORAGE_KEY,
    THEMES_STORAGE_KEY,
    WHEEL_LIMIT_STORAGE_KEY,
    cloneTheme,
    ensureSegments,
    sanitizePreset,
    sanitizeTheme,
    type WheelPreset,
    type WheelTheme,
} from './types/theme-types';

import './index.css';

function App() {
    const [options, setOptions] = useState(createDefaultOptions);
    const [activeSection, setActiveSection] = useState<WheelSectionId>('options');
    // En mobile el Wheelmanager es un drawer: el botón vive en el Header
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    // La transición se activa con la primera interacción (nunca en la carga inicial)
    const [isMenuAnimated, setIsMenuAnimated] = useState(false);

    // Tema activo de la ruleta: SOLO visual (colores + imágenes). Nunca toca nombres.
    const [activeTheme, setActiveTheme] = useState<WheelTheme | null>(() => {
        if (typeof window === 'undefined') return DEFAULT_THEMES[0] ?? null;
        try {
            const stored = localStorage.getItem(ACTIVE_THEME_STORAGE_KEY);
            if (stored) {
                const clean = sanitizeTheme(JSON.parse(stored));
                if (clean) return clean;
            }
            // Compat: formato antiguo { activeTheme, savedThemes } o activo con labels
            const legacy = localStorage.getItem(THEMES_STORAGE_KEY);
            if (legacy) {
                const data = JSON.parse(legacy);
                const candidate = Array.isArray(data) ? null : data?.activeTheme;
                const cleanLegacy = sanitizeTheme(candidate);
                if (cleanLegacy) return cleanLegacy;
            }
        } catch {
            // ignore corrupt storage
        }
        return DEFAULT_THEMES[0] ?? null;
    });

    // Galería visual: preestablecidos + guardados por el usuario (solo usuarios persisten)
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
            // ignore corrupt storage
        }
        return [];
        });
    const savedThemes: WheelTheme[] = [...DEFAULT_THEMES, ...userThemes];

    // Presets: TODO (opciones + tema visual). Solo los de usuario persisten.
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
                        // Compat: antes no existía WheelPreset; ignora formatos viejos
                        if (raw && typeof raw === 'object' && Array.isArray((raw as { options?: unknown }).options)) {
                            const clean = sanitizePreset(raw);
                            if (clean && !clean.id.startsWith('default-preset-')) out.push(clean);
                        }
                    }
                    return out;
                }
            }
        } catch {
            // ignore corrupt storage
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
            // ignore storage errors
        }
        return null;
    });

    // Límite editable de opciones (tope absoluto MAX_WHEEL_OPTIONS)
    const [wheelLimit, setWheelLimit] = useState<number>(() => {
        if (typeof window === 'undefined') return MAX_WHEEL_OPTIONS;
        try {
            const stored = localStorage.getItem(WHEEL_LIMIT_STORAGE_KEY);
            const n = stored ? Number(stored) : NaN;
            if (Number.isFinite(n)) return Math.min(Math.max(Math.round(n), 2), MAX_WHEEL_OPTIONS);
        } catch {
            // ignore storage errors
        }
        return MAX_WHEEL_OPTIONS;
    });

    // Persistencias separadas (temas de usuario / tema activo / límite)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify(userThemes));
        } catch {
            // ignore storage errors
        }
    }, [userThemes]);

        useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            if (activeTheme) localStorage.setItem(ACTIVE_THEME_STORAGE_KEY, JSON.stringify(activeTheme));
        } catch {
            // ignore storage errors (p. ej. imágenes base64 muy pesadas)
        }
    }, [activeTheme]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(userPresets));
        } catch {
            // ignore storage errors
        }
    }, [userPresets]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            if (activePresetId) localStorage.setItem(ACTIVE_PRESET_STORAGE_KEY, activePresetId);
            else localStorage.removeItem(ACTIVE_PRESET_STORAGE_KEY);
        } catch {
            // ignore storage errors
        }
    }, [activePresetId]);

    const handleSectionChange = (section: WheelSectionId): void => {
        setActiveSection(section);
        setIsMenuOpen(false);
    };

        // Guardar un tema: captura SOLO datos visuales. Nunca toca nombres de opciones.
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

    // Aplicar un tema VISUAL: expande la paleta al número de opciones, pero NUNCA toca los nombres.
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

    // Guardar un preset: captura opciones actuales + tema visual activo.
    const handleSavePreset = (name: string, tags?: string[]) => {
        if (!activeTheme) return;
        const preset: WheelPreset = {
            id: crypto.randomUUID(),
            name: name.trim() || 'Sin nombre',
            options: options.map((o) => ({ ...o })),
            theme: cloneTheme(activeTheme),
            updatedAt: Date.now(),
            tags: tags && tags.length > 0 ? tags : [],
        };
        setUserPresets((prev) => [preset, ...prev]);
        setActivePresetId(preset.id);
    };

    // Cargar un preset: sobreescribe opciones + tema visual de golpe.
    const handleLoadPreset = (preset: WheelPreset) => {
        setOptions(preset.options.map((o) => ({ ...o })));
        setActiveTheme(cloneTheme({
            ...preset.theme,
            segments: ensureSegments(preset.theme.segments, Math.max(preset.options.length, 1)),
        }));
        setActivePresetId(preset.id);
    };

    const handleDeletePreset = (id: string) => {
        if (id === activePresetId) setActivePresetId(null);
        setUserPresets((prev) => prev.filter((p) => p.id !== id));
    };

    const toggleMenu = () => {
        setIsMenuAnimated(true);
        setIsMenuOpen(prev => !prev);
    };

    const closeMenu = () => setIsMenuOpen(false);

    // Panel único de contenido: la misma lógica en móvil y escritorio.
    // Options/Presets/Themes se sustituyen entre sí; la ruleta siempre queda montada.
    const renderPanel = (): React.ReactNode => {
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
                    />
                );
            case 'options':
            default:
                return (
                    <Options
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
            <div className={`Main Main--${activeSection}`}>
                <Wheelmanager
                    activeSection={activeSection}
                    onSectionChange={handleSectionChange}
                    isOpen={isMenuOpen}
                    isAnimated={isMenuAnimated}
                    onClose={closeMenu}
                />
                <div className="spinly-panel">
                    {renderPanel()}
                </div>
                {/* La ruleta siempre está montada: no se mueve ni se recarga al cambiar de sección */}
                <Wheel options={options} activeTheme={activeTheme} />
            </div>
        </div>
    );
}

export default App;