import React, { lazy, Suspense, useState, useRef } from 'react';
import '../../css/Options.css';
import Icon from '../common/Icon';
import { useSortable } from '../../hooks/useSortable';
import PanelHeader from '../common/PanelHeader';
import { addOption, removeOption, updateOption, reorderOptions, DEFAULT_WHEEL_LIMIT, MAX_OPTION_LENGTH, MAX_WHEEL_OPTIONS, MIN_OPTIONS, type WheelOption } from '../../scripts/option-wheel';
import { DEFAULT_IMAGE_FIT, DEFAULT_SEGMENT_COLOR, ensureSegments, type ImageFit, type WheelSegmentStyle, type WheelTheme } from '../../types/theme-types';
import { isAllowedImageMime, MAX_UPLOAD_BYTES } from '../../scripts/supabaseClient';
import { shrinkImage } from '../../scripts/image-resize';
import { fitImageToSector, randomSegmentColor } from '../../scripts/wheel';
import { useTranslation } from '../i18n/LanguageProvider';
import { dictMessage, type LocalMessage } from '../../scripts/strings';

const ColorPicker = lazy(() => import('./ColorPicker'));
const ImageAdjustDialog = lazy(() => import('./ImageAdjustDialog'));

/** base64 ≈ 4/3 del binario: por encima de esto no cabe con holgura en localStorage (~5MB). */
const MAX_DATA_URL_LENGTH = 2800000;
// Lado mayor de una textura: de sobra para un sector de la ruleta incluso en pantallas densas.
const TEXTURE_MAX_SIDE = 1200;

type ImageAdjustState = { optionId: string; index: number; image: string; fit: ImageFit; isNew: boolean };

interface WheelEditorProps {
    options: WheelOption[];
    setOptions: React.Dispatch<React.SetStateAction<WheelOption[]>>;
    activeTheme: WheelTheme | null;
    setActiveTheme: React.Dispatch<React.SetStateAction<WheelTheme | null>>;
    wheelLimit: number;
    setWheelLimit: React.Dispatch<React.SetStateAction<number>>;
}

function WheelEditor({ options, setOptions, activeTheme, setActiveTheme, wheelLimit, setWheelLimit }: WheelEditorProps) {
    const { t, tm } = useTranslation();
    // LocalMessage y no string: el aviso se re-traduce si cambia el idioma mientras está visible.
    const [imageWarning, setImageWarning] = useState<LocalMessage | null>(null);
    const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
    const [isEditingLimit, setIsEditingLimit] = useState<boolean>(false);
    const [limitDraft, setLimitDraft] = useState<string>('');
    // Hasta la primera tecla, lo que se escribe sustituye al límite en vez de añadirse detrás.
    const limitFresh = useRef(true);
    const lim = Number.isFinite(wheelLimit) ? Math.min(Math.max(wheelLimit, MIN_OPTIONS), MAX_WHEEL_OPTIONS) : DEFAULT_WHEEL_LIMIT;
    const reachedLimit = options.length >= lim;
    const atMinimum = options.length <= MIN_OPTIONS;
    const segments = ensureSegments(activeTheme?.segments ?? [], Math.max(options.length, 1));

    const handleLimit = (value: number) => {
        if (!Number.isFinite(value)) return;
        const next = Math.min(Math.max(Math.round(value), MIN_OPTIONS), MAX_WHEEL_OPTIONS);
        // Bajar el límite nunca borra opciones: se bloquea por debajo de las que ya hay.
        if (next < options.length) {
            setImageWarning(dictMessage('options', 'limitBlocked', { next, count: options.length }));
            return;
        }
        setImageWarning(null);
        setWheelLimit(next);
    };

    const startLimitEdit = (): void => {
        limitFresh.current = true;
        setLimitDraft(String(lim));
        setIsEditingLimit(true);
    };

    // Sin selección resaltada: el cursor de texto va al final y la primera cifra reemplaza el valor.
    const handleLimitDraft = (rawValue: string): void => {
        const digits = rawValue.replace(/\D/g, '');
        const typedAfter = limitFresh.current && digits.length > limitDraft.length && digits.startsWith(limitDraft);
        limitFresh.current = false;
        setLimitDraft((typedAfter ? digits.slice(limitDraft.length) : digits).slice(0, 2));
    };

    const commitLimit = (rawValue: string): void => {
        if (rawValue.trim() === '' || !Number.isFinite(Number(rawValue))) {
            setIsEditingLimit(false);
            return;
        }
        handleLimit(Number(rawValue));
        setIsEditingLimit(false);
    };

    const handleColorChange = (index: number, color: string) => {
        syncSeg(index, { color });
    };

    const [colorPicker, setColorPicker] = useState<{ index: number; anchorEl: HTMLElement } | null>(null);
    const openColorPicker = (index: number, anchorEl: HTMLElement) => {
        setColorPicker((prev) => (prev && prev.index === index ? null : { index, anchorEl }));
    };

    const [adjusting, setAdjusting] = useState<ImageAdjustState | null>(null);

    const openFilePicker = (id: string) => {
        fileInputs.current[id]?.click();
    };

    const handleImageButton = (optionId: string, index: number) => {
        const image = segments[index]?.backgroundImage;
        if (!image) {
            openFilePicker(optionId);
            return;
        }
        setAdjusting({ optionId, index, image, fit: segments[index]?.imageFit ?? DEFAULT_IMAGE_FIT, isNew: false });
    };

    const applyImageFit = (fit: ImageFit) => {
        if (!adjusting) return;
        syncSeg(adjusting.index, { backgroundImage: adjusting.image, imageFit: fit });
        setAdjusting(null);
    };

    const replaceImage = () => {
        if (!adjusting) return;
        const { optionId } = adjusting;
        setAdjusting(null);
        openFilePicker(optionId);
    };

    const renameOpt = (id: string, name: string) => {
        setOptions((prev) => updateOption(prev, id, name));
    };

    const handleImageFile = (optionId: string, index: number, file: File | undefined) => {
        if (!file) return;
        if (!isAllowedImageMime(file.type)) {
            setImageWarning(dictMessage('options', 'badImgFormat'));
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            setImageWarning(dictMessage('options', 'imgTooBig'));
            return;
        }
        setImageWarning(null);
        void shrinkImage(file, TEXTURE_MAX_SIDE).then((image) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = String(reader.result ?? '');
                if (dataUrl.length > MAX_DATA_URL_LENGTH) {
                    setImageWarning(dictMessage('options', 'imgTooHeavy'));
                    return;
                }
                setAdjusting({ optionId, index, image: dataUrl, fit: fitImageToSector(index, options.length), isNew: true });
            };
            reader.readAsDataURL(image);
        });
    };

    // El color se calcula fuera de los updaters: deben ser puros porque StrictMode los ejecuta dos veces.
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

    // En el mínimo no se toca nada: quitar solo el sector desajustaría colores y opciones.
    const handleRemove = (id: string, index: number) => {
        const curLen = options.length;
        if (curLen <= MIN_OPTIONS) return;
        setOptions((prev) => removeOption(prev, id));
        setActiveTheme((themePrev) => {
            if (!themePrev) return themePrev;
            const segs = ensureSegments(themePrev.segments, Math.max(curLen, 1));
            segs.splice(index, 1);
            return { ...themePrev, segments: ensureSegments(segs, Math.max(curLen - 1, 1)) };
        });
    };

    // Cada sector viaja con su opción: se reordenan ambos a la vez.
    const moveOption = (from: number, to: number) => {
        setOptions((prev) => reorderOptions(prev, from, to));
        setActiveTheme((prev) => {
            if (!prev) return prev;
            const next = ensureSegments(prev.segments, Math.max(options.length, 1));
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return { ...prev, segments: next };
        });
    };
    const sortable = useSortable(moveOption);

    const syncSeg = (index: number, patch: Partial<WheelSegmentStyle>) => {
        setActiveTheme((prev) => {
            if (!prev) return prev;
            const next = ensureSegments(prev.segments, Math.max(options.length, 1));
            next[index] = { ...(next[index] ?? { color: DEFAULT_SEGMENT_COLOR }), ...patch };
            return { ...prev, segments: next };
        });
    };

    const removeSegImage = (index: number) => {
        setActiveTheme((prev) => {
            if (!prev) return prev;
            const next = ensureSegments(prev.segments, Math.max(options.length, 1));
            if (!next[index]) return prev;
            next[index] = { color: next[index].color };
            return { ...prev, segments: next };
        });
        setImageWarning(null);
    };

    return (
        <div className='Options'>
            <PanelHeader
                className="options-title"
                icon="sliders"
                title={t('options', 'title')}
                badgeTitle={t('options', 'limitTitle', { lim, max: MAX_WHEEL_OPTIONS })}
                badge={(
                    <>
                        {options.length} / {isEditingLimit ? (
                            <input
                                className="options-limit-inline"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={limitDraft}
                                autoFocus
                                onFocus={(e) => {
                                    const end = e.currentTarget.value.length;
                                    e.currentTarget.setSelectionRange(end, end);
                                }}
                                onChange={(e) => handleLimitDraft(e.target.value)}
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
                    </>
                )}
            />
            {imageWarning && <p className="options-warning" role="alert">{tm(imageWarning)}</p>}

            <div className='container-options'>
                {options.map((option, index) => {
                    const seg = segments[index];
                    const swatch = seg?.color ?? DEFAULT_SEGMENT_COLOR;
                    const hasImg = Boolean(seg?.backgroundImage);
                    const dragState = sortable.itemState(index);
                    return (
                        <div
                            className={`option-item spinly-panel-card${dragState.className}${hasImg ? ' option-item--has-img' : ''}`}
                            style={dragState.style}
                            key={option.id}
                            ref={sortable.itemRef(index)}
                        >
                            <button
                                type="button"
                                className="drag"
                                data-sound="none"
                                title={t('options', 'dragHandle')}
                                aria-label={t('options', 'moveAria', { n: index + 1 })}
                                {...sortable.handleProps(index, options.length)}
                            >⠿</button>
                            <button
                                type="button"
                                className="option-swatch"
                                style={{ backgroundColor: swatch }}
                                title={t('options', 'changeColor', { n: index + 1 })}
                                onClick={(event) => openColorPicker(index, event.currentTarget)}
                                aria-label={t('options', 'colorOf', { name: option.name })}
                            />
                            <input value={option.name} maxLength={MAX_OPTION_LENGTH} onChange={(event) => renameOpt(option.id, event.target.value)} aria-label={t('options', 'optName', { n: index + 1 })} />
                            <button type="button" className={`option-img-btn${hasImg ? ' option-img-btn--active' : ''}`} onClick={() => handleImageButton(option.id, index)} title={hasImg ? t('options', 'adjustImg') : t('options', 'addImg')} aria-label={t('options', 'imgAria', { n: index + 1 })}>
                                <Icon name="image" />
                            </button>
                            <input
                                ref={(el) => { fileInputs.current[option.id] = el; }}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(event) => {
                                    handleImageFile(option.id, index, event.target.files?.[0]);
                                    event.target.value = '';
                                }}
                                aria-label={t('options', 'imgFile', { n: index + 1 })}
                            />
                            {hasImg && (
                                <button type="button" className="option-img-remove" onClick={() => removeSegImage(index)} title={t('options', 'removeImg')} aria-label={t('options', 'removeImgAria', { n: index + 1 })}>✕</button>
                            )}
                            <button
                                type="button"
                                className='remove-option-button'
                                onClick={() => handleRemove(option.id, index)}
                                disabled={atMinimum}
                                aria-label={t('options', 'removeOpt', { n: index + 1 })}
                                title={atMinimum ? t('options', 'minReached', { min: MIN_OPTIONS }) : undefined}
                            >×</button>
                        </div>
                    );
                })}
            </div>

            <div className='options-bottom'>
                <button className='add-option-button' onClick={handleAdd} disabled={reachedLimit} title={reachedLimit ? t('options', 'maxReached', { lim }) : undefined}>
                    <Icon name="plus" />
                    {t('options', 'add')}
                </button>
            </div>

            {colorPicker && colorPicker.index < options.length && (
                <Suspense fallback={null}>
                    <ColorPicker
                        key={colorPicker.index}
                        color={segments[colorPicker.index]?.color ?? DEFAULT_SEGMENT_COLOR}
                        onChange={(hex) => handleColorChange(colorPicker.index, hex)}
                        onClose={() => setColorPicker(null)}
                        anchorEl={colorPicker.anchorEl}
                    />
                </Suspense>
            )}

            {adjusting && adjusting.index < options.length && (
                <Suspense fallback={null}>
                    <ImageAdjustDialog
                        image={adjusting.image}
                        initialFit={adjusting.fit}
                        index={adjusting.index}
                        segments={segments}
                        labels={options.map((option) => option.name)}
                        onApply={applyImageFit}
                        onCancel={() => setAdjusting(null)}
                        onReplace={replaceImage}
                        onRemove={adjusting.isNew ? undefined : () => {
                            removeSegImage(adjusting.index);
                            setAdjusting(null);
                        }}
                    />
                </Suspense>
            )}
        </div>
    );
}

export default WheelEditor;

