import React, { useState, useRef } from 'react';
import '../css/Options.css';
import ColorPicker from './ColorPicker';
import { addOption, removeOption, updateOption, reorderOptions, MAX_OPTION_LENGTH, MAX_WHEEL_OPTIONS, type WheelOption } from '../scripts/option-wheel';
import { DEFAULT_SEGMENT_COLOR, WHEEL_LIMIT_STORAGE_KEY, ensureSegments, type WheelSegmentStyle, type WheelTheme } from '../types/theme-types';
import { isAllowedImageMime, MAX_UPLOAD_BYTES } from '../lib/supabaseClient';
import { randomSegmentColor } from '../scripts/wheel';
import { useTranslation } from '../lib/i18n';
import { dictMessage, type LocalMessage } from '../lib/strings';

interface OptionsProps {
    options: WheelOption[];
    setOptions: React.Dispatch<React.SetStateAction<WheelOption[]>>;
    activeTheme: WheelTheme | null;
    setActiveTheme: React.Dispatch<React.SetStateAction<WheelTheme | null>>;
    wheelLimit: number;
    setWheelLimit: React.Dispatch<React.SetStateAction<number>>;
}

function Options({ options, setOptions, activeTheme, setActiveTheme, wheelLimit, setWheelLimit }: OptionsProps) {
    const { t, tm } = useTranslation();
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);
    // LocalMessage (no string): el aviso se re-traduce si cambia el idioma con él visible
    const [imageWarning, setImageWarning] = useState<LocalMessage | null>(null);
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
            setImageWarning(dictMessage('options', 'limitBlocked', { next, count: options.length }));
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
            setImageWarning(dictMessage('options', 'badImgFormat'));
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            setImageWarning(dictMessage('options', 'imgTooBig'));
            return;
        }
        setImageWarning(null);
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result ?? '');
            if (dataUrl.length > 2800000) {
                setImageWarning(dictMessage('options', 'imgTooHeavy'));
                return;
            }
            syncSeg(index, { backgroundImage: dataUrl });
        };
        reader.readAsDataURL(file);
    };

    // Nueva opción = nuevo sector con color ALEATORIO vivo (hsl(rand, 70%, 55%)),
    // distinto en tono del sector anterior; sin heredar imagen de la paleta cíclica.
    // El color se calcula fuera de los updaters (puros: StrictMode los ejecuta dos veces).
    const handleAdd = () => {
        const next = addOption(options, lim, t('options', 'defaultName'));
        if (next.length === options.length) return;
        const targetLen = next.length;
        const color = randomSegmentColor(segments[options.length - 1]?.color);
        setOptions(next);
        setActiveTheme((themePrev) => {
            if (!themePrev) return themePrev;
            const segs = ensureSegments(themePrev.segments, targetLen);
            segs[targetLen - 1] = { color };
            return { ...themePrev, segments: segs };
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
                <p className="spinly-panel-title">{t('options', 'title')}</p>
                <span className="number-items spinly-badge" title={t('options', 'limitTitle', { lim, max: MAX_WHEEL_OPTIONS })}>
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
                            aria-label={t('options', 'limitAria', { max: MAX_WHEEL_OPTIONS })}
                        />
                    ) : (
                        <button type="button" className="options-limit-value" onClick={startLimitEdit} title={t('options', 'limitEdit')}>
                            {lim}
                        </button>
                    )}
                </span>
            </div>
            {imageWarning && <p className="options-warning" role="alert">{tm(imageWarning)}</p>}

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
                            <span className='drag' draggable onDragStart={handleDragStart(index)} onDragEnd={handleDragEnd} title={t('options', 'dragHandle')}>⠿</span>
                            <button
                                type="button"
                                className="option-swatch"
                                style={{ backgroundColor: swatch }}
                                title={t('options', 'changeColor', { n: index + 1 })}
                                onClick={(event) => openColorPicker(index, event.currentTarget)}
                                aria-label={t('options', 'colorOf', { name: option.name })}
                            />
                            <input value={option.name} maxLength={MAX_OPTION_LENGTH} onChange={(event) => renameOpt(option.id, index, event.target.value)} aria-label={t('options', 'optName', { n: index + 1 })} />
                            <button type="button" className={`option-img-btn${hasImg ? ' option-img-btn--active' : ''}`} onClick={() => openFilePicker(option.id)} title={hasImg ? t('options', 'changeImg') : t('options', 'addImg')} aria-label={t('options', 'imgAria', { n: index + 1 })}>
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
                                aria-label={t('options', 'imgFile', { n: index + 1 })}
                            />
                            {hasImg && (
                                <button type="button" className="option-img-remove" onClick={() => removeSegImage(index)} title={t('options', 'removeImg')} aria-label={t('options', 'removeImgAria', { n: index + 1 })}>✕</button>
                            )}
                            <button className='remove-option-button' onClick={() => handleRemove(option.id, index)} aria-label={t('options', 'removeOpt', { n: index + 1 })}>×</button>
                        </div>
                    );
                })}
            </div>

            <div className='options-bottom'>
                <button className='add-option-button' onClick={handleAdd} disabled={reachedLimit} title={reachedLimit ? t('options', 'maxReached', { lim }) : undefined}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {t('options', 'add')}
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

