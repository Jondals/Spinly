import React, { useState, useRef } from 'react';
import '../css/Options.css';
import { addOption, removeOption, updateOption, reorderOptions, MAX_OPTION_LENGTH, MAX_WHEEL_OPTIONS, type WheelOption } from '../scripts/option-wheel';
import { DEFAULT_SEGMENT_COLOR, WHEEL_LIMIT_STORAGE_KEY, ensureSegments, type WheelSegmentStyle, type WheelTheme } from '../types/theme-types';

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

    const openFilePicker = (id: string) => {
        fileInputs.current[id]?.click();
    };

        const renameOpt = (id: string, index: number, name: string) => {
        setOptions((prev) => updateOption(prev, id, name));
    };

    const handleImageFile = (index: number, file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setImageWarning('El archivo debe ser una imagen.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setImageWarning('Imagen mayor de ~2MB: puede agotar localStorage (~5MB total). Se guarda igualmente, pero considera usar una imagen más pequeña.');
        } else {
            setImageWarning(null);
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result ?? '');
            if (dataUrl.length > 2800000) {
                setImageWarning('Esta imagen en base64 es muy pesada y puede romper el guardado en localStorage. Prueba con una más pequeña.');
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
            <div className="options-title">
                <p>WHEEL EDITOR</p>
                <span className="number-items" title={`Límite ${lim} de ${MAX_WHEEL_OPTIONS}: clic para editar`}>
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
                            className={`option-item${dragIndex === index ? ' option-item--dragging' : ''}${overIndex === index ? ' option-item--over' : ''}${hasImg ? ' option-item--has-img' : ''}`}
                            key={option.id}
                            onDragOver={handleDragOver(index)}
                            onDrop={handleDrop(index)}
                        >
                            <span className='drag' draggable onDragStart={handleDragStart(index)} onDragEnd={handleDragEnd}>⠿</span>
                            <label className="option-swatch" style={{ backgroundColor: swatch }} title={`Color sector ${index + 1}`}>
                                <input
                                    className="option-color-input"
                                    type="color"
                                    value={swatch}
                                    onChange={(event) => handleColorChange(index, event.target.value)}
                                    aria-label={`Color de ${option.name}`}
                                />
                            </label>
                            <input value={option.name} maxLength={MAX_OPTION_LENGTH} onChange={(event) => renameOpt(option.id, index, event.target.value)} aria-label={`Nombre opción ${index + 1}`} />
                            <button type="button" className={`option-img-btn${hasImg ? ' option-img-btn--active' : ''}`} onClick={() => openFilePicker(option.id)} title={hasImg ? 'Cambiar imagen de fondo' : 'Añadir imagen de fondo'} aria-label={`Imagen de fondo opción ${index + 1}`}>🖼</button>
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
                    <span>⊕</span>
                    Añadir opción
                </button>
            </div>
        </div>
    );
}

export default Options;

