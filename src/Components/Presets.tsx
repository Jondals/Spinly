import React, { useState, useRef } from 'react';
import { timeAgo, type WheelPreset } from '../types/theme-types';
import type { WheelOption } from '../scripts/option-wheel';
import type { WheelTheme } from '../types/theme-types';
import '../css/Presets.css';

interface PresetsProps {
    savedPresets: WheelPreset[];
    activePresetId: string | null;
    currentOptions: WheelOption[];
    activeTheme: WheelTheme | null;
    onSavePreset: (name: string, tags?: string[]) => void;
    onLoadPreset: (preset: WheelPreset) => void;
    onDeletePreset: (id: string) => void;
}

const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

function Presets({ savedPresets, activePresetId, currentOptions, activeTheme, onSavePreset, onLoadPreset, onDeletePreset }: PresetsProps) {
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [draftName, setDraftName] = useState('');
    const [draftTags, setDraftTags] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const isDefault = (id: string) => id.startsWith('default-preset-');
    const filtered = savedPresets.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
    );

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

    const handleDelete = (preset: WheelPreset, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`¿Estás seguro de borrar "${preset.name}"?`)) {
            onDeletePreset(preset.id);
        }
    };

    return (
        <div className="Presets presets-presets">
            <header className="presets-presets-header">
                <div className="presets-presets-header-left">
                    <span className="presets-presets-icon" aria-hidden="true">💾</span>
                    <h2 className="presets-presets-title">Presets Guardados</h2>
                </div>
                <span className="presets-presets-badge presets-presets-badge--accent">{savedPresets.length} Listas</span>
            </header>
            <p className="presets-presets-subtitle">
                Alterna instantáneamente o crea configuraciones predefinidas para tus sorteos.
            </p>

            <div className="presets-presets-toolbar">
                <label className="presets-presets-search">
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
                        className="presets-presets-new-btn"
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
                                className={`presets-presets-card ${isActive ? 'presets-presets-card--active' : ''}`}
                            >
                                <div className="presets-presets-card-inner">
                                    <div className="presets-presets-card-top">
                                        <span className="presets-presets-card-badge">{preset.options.length} opciones</span>
                                        <span className="presets-presets-meta">
                                            {preset.tags && preset.tags.length > 0
                                                ? preset.tags.map((t) => `· ${t}`).join(' ')
                                                : `· ${timeAgo(preset.updatedAt)}`}
                                        </span>
                                    </div>
                                    <span className="presets-presets-card-name">{preset.name}</span>
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
                                                ▶ Cargar en Ruleta
                                            </button>
                                        )}
                                        {!isDefaultPreset && isActive && (
                                            <div className="presets-presets-active-icons">
                                                <button
                                                    type="button"
                                                    className="presets-presets-action-icon"
                                                    onClick={() => handleDuplicate(preset)}
                                                    aria-label={`Duplicar ${preset.name}`}
                                                    title="Duplicar"
                                                >📋</button>
                                                <button
                                                    type="button"
                                                    className="presets-presets-action-icon"
                                                    onClick={() => { /* TODO: editar */ }}
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
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export default Presets;
