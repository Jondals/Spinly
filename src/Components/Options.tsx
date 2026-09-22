import React, { useState, useRef } from 'react';
import '../css/Options.css';
import ColorPicker from './ColorPicker';
import { addOption, removeOption, updateOption, reorderOptions, MAX_OPTION_LENGTH, MAX_WHEEL_OPTIONS, type WheelOption } from '../scripts/option-wheel';
import { DEFAULT_SEGMENT_COLOR, WHEEL_LIMIT_STORAGE_KEY, ensureSegments, type WheelSegmentStyle, type WheelTheme } from '../types/theme-types';
import { isAllowedImageMime, MAX_UPLOAD_BYTES } from '../lib/supabaseClient';

interface OptionsProps {
    options: WheelOption[];
    setOptions: React.Dispatch<React.SetStateAction<WheelOption[]>>;
    activeTheme: WheelTheme | null;
    setActiveTheme: React.Dispatch<React.SetStateAction<WheelTheme | null>>;
    wheelLimit: number;
    setWheelLimit: React.Dispatch<React.SetStateAction<number>>;
}

function Options({ options, setOptions, activeTheme, setActiveTheme, wheelLimit, setWheelLimit }: OptionsProps) {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);
    const [imageWarning, setImageWarning] = useState<string | null>(null);
    const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
    const [isEditingLimit, setIsEditingLimit] = useState<boolean>(false);
    const [limitDraft, setLimitDraft] = useState<string>('');
    const lim = Number.isFinite(wheelLimit) ? Math.min(Math.max(wheelLimit, 2), MAX_WHEEL_OPTIONS) : MAX_WHEEL_OPTIONS;
    const reachedLimit = options.length >= lim;
    const segments = ensureSegments(activeTheme?.segments ?? [], Math.max(options.length, 1));

    const handleLimit = (value: number) => {
        if (!Number.isFinite(value)) return;
        const next = Math.min(Math.max(Math.round(value), 2), MAX_WHEEL_OPTIONS);
        // No borrar nada: bloquear bajar por debajo del número actual
        if (next < options.length) {
            setImageWarning(`No se puede bajar el límite a ${next}: ya tienes ${options.length} opciones.`);
            return;
        }
        setImageWarning(null);
        setWheelLimit(next);
        try {
            localStorage.setItem(WHEEL_LIMIT_STORAGE_KEY, String(next));
        } catch {
            // ignore storage errors
        }
    };

    const startLimitEdit = (): void => {
        setLimitDraft(String(lim));
        setIsEditingLimit(true);
    };

    const commitLimit = (rawValue: string): void => {
        if (rawValue.trim() === '' || !Number.isFinite(Number(rawValue))) {
            setIsEditingLimit(false);
            return;
        }
        handleLimit(Number(rawValue));
        setIsEditingLimit(false);
    };

    const handleDragStart = (index: number) => (event: React.DragEvent) => {
        setDragIndex(index);
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnd = () => hideDrop();

    const handleColorChange = (index: number, color: string) => {
        syncSeg(index, { color });
    };

    // Selector de color personalizado: anclado al swatch pulsado
    const [colorPicker, setColorPicker] = useState<{ index: number; anchorEl: HTMLElement } | null>(null);
    const openColorPicker = (index: number, anchorEl: HTMLElement) => {
        setColorPicker((prev) => (prev && prev.index === index ? null : { index, anchorEl }));
    };

    const openFilePicker = (id: string) => {
        fileInputs.current[id]?.click();
    };

        const renameOpt = (id: string, index: number, name: string) => {
        setOptions((prev) => updateOption(prev, id, name));
    };

    const handleImageFile = (index: number, file: File | undefined) => {
        if (!file) return;
        // MIME real del archivo (no la extensión) + whitelist estricta + límite duro de 2MB
        if (!isAllowedImageMime(file.type)) {
            setImageWarning('Formato no permitido: usa PNG, JPEG o WEBP.');
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            setImageWarning('Imagen mayor de 2MB: excede el límite de localStorage (~5MB). Elige una más ligera.');
            return;
        }
        setImageWarning(null);
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result ?? '');
            if (dataUrl.length > 2800000) {
                setImageWarning('Esta imagen en base64 es muy pesada para localStorage. No se ha guardado.');
                return;
            }
            syncSeg(index, { backgroundImage: dataUrl });
        };
        reader.readAsDataURL(file);
    };

    const handleAdd = () => {
        setOptions((prev) => {
                        const next = addOption(prev, lim);
            if (next.length !== prev.length) {
                const targetLen = next.length;
                            setActiveTheme((themePrev) => {
                    if (!themePrev) return themePrev;
                    const segs = ensureSegments(themePrev.segments, targetLen);
                    segs[targetLen - 1] = {
                        color: segs[targetLen - 1]?.color ?? DEFAULT_SEGMENT_COLOR,
                        backgroundImage: segs[targetLen - 1]?.backgroundImage,
                    };
                    return { ...themePrev, segments: segs };
                });
            }
            return next;
        });
    };

    const handleRemove = (id: string, index: number) => {
        const curLen = options.length;
        setOptions((prev) => removeOption(prev, id));
        setActiveTheme((themePrev) => {
            if (!themePrev) return themePrev;
            const segs = ensureSegments(themePrev.segments, Math.max(curLen, 1));
            segs.splice(index, 1);
            return { ...themePrev, segments: ensureSegments(segs, Math.max(curLen - 1, 1)) };
        });
    };

    const handleDragOver = (index: number) => (event: React.DragEvent) => {
        event.preventDefault();
        if (index !== overIndex) setOverIndex(index);
    };

    const handleDrop = (index: number) => (event: React.DragEvent) => {
        event.preventDefault();
        if (dragIndex !== null && dragIndex !== index) {
            const from = dragIndex;
            const to = index;
            setOptions((prev) => reorderOptions(prev, from, to));
            setActiveTheme((prev) => {
                if (!prev) return prev;
                const next = ensureSegments(prev.segments, Math.max(options.length, 1));
                const item = next.splice(from, 1)[0];
                next.splice(to, 0, item);
                return { ...prev, segments: next };
            });
        }
        hideDrop();
    };

    const hideDrop = () => { setDragIndex(null); setOverIndex(null); };

        const syncSeg = (index: number, patch: Partial<Pick<WheelSegmentStyle, 'color' | 'backgroundImage'>>) => {
        setActiveTheme((prev) => {
            if (!prev) return prev;
            const next = ensureSegments(prev.segments, Math.max(options.length, 1));
            const base = next[index] ?? { color: DEFAULT_SEGMENT_COLOR };
            const updated = { ...base };
            if (patch.color !== undefined) updated.color = patch.color;
            if ('backgroundImage' in patch) updated.backgroundImage = patch.backgroundImage;
            next[index] = updated;
            return { ...prev, segments: next };
        });
    };

    const removeSegImage = (index: number) => {
        setActiveTheme((prev) => {
            if (!prev) return prev;
            const next = ensureSegments(prev.segments, Math.max(options.length, 1));
            if (!next[index]) return prev;
            next[index] = { ...next[index], backgroundImage: undefined };
            return { ...prev, segments: next };
        });
        setImageWarning(null);
    };

    return (
        <div className='Options'>
            <div className="options-title spinly-panel-header">
                <p className="spinly-panel-title">WHEEL EDITOR</p>
                <span className="number-items spinly-badge" title={`Límite ${lim} de ${MAX_WHEEL_OPTIONS}: clic para editar`}>
                    {options.length} / {isEditingLimit ? (
                        <input
                            className="options-limit-inline"
                            type="number"
                            min={options.length}
                            max={MAX_WHEEL_OPTIONS}
                            value={limitDraft}
                            autoFocus
                            onChange={(e) => setLimitDraft(e.target.value)}
                            onBlur={(e) => commitLimit(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commitLimit((e.target as HTMLInputElement).value);
                                if (e.key === 'Escape') setIsEditingLimit(false);
                            }}
                            aria-label={`Límite de opciones (máximo ${MAX_WHEEL_OPTIONS})`}
                        />
                    ) : (
                        <button type="button" className="options-limit-value" onClick={startLimitEdit} title="Clic para editar el límite">
                            {lim}
                        </button>
                    )}
                </span>
            </div>
            {imageWarning && <p className="options-warning" role="alert">{imageWarning}</p>}

            <div className='container-options'>
                {options.map((option, index) => {
                    const seg = segments[index];
                    const swatch = seg?.color ?? DEFAULT_SEGMENT_COLOR;
                    const hasImg = Boolean(seg?.backgroundImage);
                    return (
                        <div
                            className={`option-item spinly-panel-card${dragIndex === index ? ' option-item--dragging' : ''}${overIndex === index ? ' option-item--over' : ''}${hasImg ? ' option-item--has-img' : ''}`}
                            key={option.id}
                            onDragOver={handleDragOver(index)}
                            onDrop={handleDrop(index)}
                        >
                            <span className='drag' draggable onDragStart={handleDragStart(index)} onDragEnd={handleDragEnd}>⠿</span>
                            <button
                                type="button"
                                className="option-swatch"
                                style={{ backgroundColor: swatch }}
                                title={`Cambiar color del sector ${index + 1}`}
                                onClick={(event) => openColorPicker(index, event.currentTarget)}
                                aria-label={`Color de ${option.name}`}
                            />
                            <input value={option.name} maxLength={MAX_OPTION_LENGTH} onChange={(event) => renameOpt(option.id, index, event.target.value)} aria-label={`Nombre opción ${index + 1}`} />
                            <button type="button" className={`option-img-btn${hasImg ? ' option-img-btn--active' : ''}`} onClick={() => openFilePicker(option.id)} title={hasImg ? 'Cambiar imagen de fondo' : 'Añadir imagen de fondo'} aria-label={`Imagen de fondo opción ${index + 1}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                </svg>
                            </button>
                            <input
                                ref={(el) => { fileInputs.current[option.id] = el; }}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(event) => handleImageFile(index, event.target.files?.[0])}
                                aria-label={`Archivo imagen opción ${index + 1}`}
                            />
                            {hasImg && (
                                <button type="button" className="option-img-remove" onClick={() => removeSegImage(index)} title="Quitar imagen" aria-label={`Quitar imagen opción ${index + 1}`}>✕</button>
                            )}
                            <button className='remove-option-button' onClick={() => handleRemove(option.id, index)} aria-label={`Eliminar opción ${index + 1}`}>×</button>
                        </div>
                    );
                })}
            </div>

            <div className='options-bottom'>
                <button className='add-option-button' onClick={handleAdd} disabled={reachedLimit} title={reachedLimit ? `Máximo ${lim} opciones` : undefined}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Añadir opción
                </button>
            </div>

            {colorPicker && colorPicker.index < options.length && (
                <ColorPicker
                    key={colorPicker.index}
                    color={segments[colorPicker.index]?.color ?? DEFAULT_SEGMENT_COLOR}
                    onChange={(hex) => handleColorChange(colorPicker.index, hex)}
                    onClose={() => setColorPicker(null)}
                    anchorEl={colorPicker.anchorEl}
                />
            )}
        </div>
    );
}

export default Options;

