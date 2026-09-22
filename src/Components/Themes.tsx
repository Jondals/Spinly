import React, { useState } from 'react';
import { ensureSegments, type WheelTheme } from '../types/theme-types';
import '../css/Themes.css';

interface ThemesProps {
    activeTheme: WheelTheme | null;
    setActiveTheme: React.Dispatch<React.SetStateAction<WheelTheme | null>>;
    savedThemes: WheelTheme[];
    onSaveTheme: (theme: WheelTheme) => void;
    onDeleteTheme: (id: string) => void;
}

const DEFAULT_THEME_IDS = [
    'theme-obsidian', 'theme-neon', 'theme-sunset', 'theme-emerald', 'theme-light',
];

function Themes({ activeTheme, setActiveTheme, savedThemes, onSaveTheme, onDeleteTheme }: ThemesProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [nameInput, setNameInput] = useState('');
    const isActive = (id: string) => activeTheme?.id === id;

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
        const name = nameInput.trim() || `Tema ${savedThemes.filter((t) => !DEFAULT_THEME_IDS.includes(t.id)).length + 1}`;
        onSaveTheme({ ...activeTheme, id: crypto.randomUUID(), name });
        setNameInput('');
    };

    return (
        <div className="Themes presets-themes">
            <header className="presets-themes-header">
                <div className="presets-themes-header-left">
                    <span className="presets-themes-icon" aria-hidden="true">🎨</span>
                    <h2 className="presets-themes-title">Temas Visuales</h2>
                </div>
                <span className="presets-themes-badge presets-themes-badge--accent">{savedThemes.length} Disponibles</span>
            </header>
            <p className="presets-themes-subtitle">
                Ajusta la paleta cromática, texturas y contraste de la ruleta en vivo.
            </p>
            <ul className="presets-themes-grid">
                {savedThemes.map((theme) => (
                    <li key={theme.id}
                        className={`presets-themes-card ${isActive(theme.id) ? 'presets-themes-card--active' : ''}`}
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
                        {!DEFAULT_THEME_IDS.includes(theme.id) && hoveredId === theme.id && (
                            <button type="button"
                                className="presets-themes-delete"
                                onClick={() => onDeleteTheme(theme.id)}
                                aria-label={`Borrar tema ${theme.name}`}
                            >✕</button>
                        )}
                    </li>
                ))}
            </ul>
            <div className="presets-themes-save">
                <input type="text" className="presets-themes-input" value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Nombre del tema (opcional)" maxLength={32} />
                <button type="button" className="presets-themes-save-btn"
                    onClick={handleSaveCurrent} disabled={!activeTheme}
                    aria-label="Guardar tema visual actual"
                >Guardar tema actual</button>
            </div>
        </div>
    );
}

export default Themes;