import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import '../../css/ImageAdjust.css';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import { describeSector, fitImageToSector, getImageBox, getSectorAngles, normalizeDegrees, WHEEL_VIEWBOX } from '../../scripts/wheel';
import { DEFAULT_IMAGE_FIT, IMAGE_FIT_LIMITS, sanitizeImageFit, type ImageFit, type WheelSegmentStyle } from '../../types/theme-types';
import { useTranslation } from '../i18n/LanguageProvider';

interface ImageAdjustDialogProps {
    image: string;
    initialFit: ImageFit;
    index: number;
    segments: WheelSegmentStyle[];
    labels: string[];
    onApply: (fit: ImageFit) => void;
    onCancel: () => void;
    onReplace: () => void;
    onRemove?: () => void;
}

type Point = { x: number; y: number };

const SIZE = WHEEL_VIEWBOX;
const CENTER = SIZE / 2;
const KEY_STEP = 0.01;
const KEY_STEP_FAST = 0.05;
const ZOOM_STEP = 1.06;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const LABEL_Y = SIZE * 0.14 + 18;
// Proporción del centro real de la ruleta (2.25rem sobre 26rem de diámetro).
const HUB_RADIUS = 21;

const clampFit = (fit: ImageFit): ImageFit => sanitizeImageFit(fit) ?? DEFAULT_IMAGE_FIT;

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Editor modal del encaje de la imagen de un sector. La vista previa gira la ruleta
 * para dejar el sector bajo el puntero (como al ganar), así que los gestos se
 * convierten de coordenadas de pantalla a coordenadas de la ruleta sin girar.
 */
function ImageAdjustDialog({ image, initialFit, index, segments, labels, onApply, onCancel, onReplace, onRemove }: ImageAdjustDialogProps) {
    const { t } = useTranslation();
    const [fit, setFit] = useState<ImageFit>(() => clampFit(initialFit));
    const stageRef = useRef<HTMLDivElement>(null);
    const pointers = useRef(new Map<number, Point>());
    const pinchDistance = useRef<number | null>(null);
    const uid = useId().replace(/:/g, '');
    const titleId = `${uid}-title`;
    const hintId = `${uid}-hint`;

    const count = Math.max(segments.length, 1);
    const { start, end, mid } = getSectorAngles(index, count);
    const sectorPath = describeSector(CENTER, CENTER, CENTER, start, end);
    const label = labels[index] ?? '';
    const color = segments[index]?.color;

    const toWheelDelta = useCallback((dx: number, dy: number): Point => {
        const rad = (mid * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    }, [mid]);

    const moveBy = useCallback((dx: number, dy: number) => {
        const delta = toWheelDelta(dx, dy);
        setFit((prev) => clampFit({ ...prev, x: prev.x + delta.x, y: prev.y + delta.y }));
    }, [toWheelDelta]);

    const zoomBy = useCallback((factor: number) => {
        setFit((prev) => clampFit({ ...prev, scale: prev.scale * factor }));
    }, []);

    // Listener nativo: el onWheel de React es pasivo y no permite preventDefault.
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return undefined;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            zoomBy(Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY));
        };
        stage.addEventListener('wheel', onWheel, { passive: false });
        return () => stage.removeEventListener('wheel', onWheel);
    }, [zoomBy]);

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 2) {
            const [a, b] = Array.from(pointers.current.values());
            pinchDistance.current = distance(a, b);
        }
    };

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const previous = pointers.current.get(event.pointerId);
        if (!previous) return;
        const current = { x: event.clientX, y: event.clientY };
        pointers.current.set(event.pointerId, current);

        if (pointers.current.size >= 2) {
            const [a, b] = Array.from(pointers.current.values());
            const next = distance(a, b);
            if (pinchDistance.current) zoomBy(next / pinchDistance.current);
            pinchDistance.current = next;
            return;
        }
        const width = event.currentTarget.getBoundingClientRect().width || 1;
        moveBy((current.x - previous.x) / width, (current.y - previous.y) / width);
    };

    const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        pointers.current.delete(event.pointerId);
        if (pointers.current.size < 2) pinchDistance.current = null;
    };

    const onStageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? KEY_STEP_FAST : KEY_STEP;
        const actions: Record<string, () => void> = {
            ArrowLeft: () => moveBy(-step, 0),
            ArrowRight: () => moveBy(step, 0),
            ArrowUp: () => moveBy(0, -step),
            ArrowDown: () => moveBy(0, step),
            '+': () => zoomBy(ZOOM_STEP),
            '=': () => zoomBy(ZOOM_STEP),
            '-': () => zoomBy(1 / ZOOM_STEP),
        };
        const action = actions[event.key];
        if (!action) return;
        event.preventDefault();
        action();
    };

    const zoomPercent = Math.round(fit.scale * 100);
    const rotation = Math.round(normalizeDegrees(fit.rotate));

    return (
        <Modal labelledBy={titleId} onClose={onCancel} backdropClassName="spinly-imgadj" className="spinly-imgadj-card" initialFocus={stageRef}>
            <header className="spinly-imgadj-head">
                <div className="spinly-imgadj-heading">
                    <h2 id={titleId} className="spinly-imgadj-title">{t('imageAdjust', 'title')}</h2>
                    <p className="spinly-imgadj-sector">{t('imageAdjust', 'sector', { n: index + 1, name: label })}</p>
                </div>
                <button type="button" className="spinly-collapse-close" onClick={onCancel} aria-label={t('common', 'close')}>
                    <Icon name="close" />
                </button>
            </header>

            <div
                ref={stageRef}
                className="spinly-imgadj-stage"
                role="application"
                tabIndex={0}
                aria-label={t('imageAdjust', 'previewAria', { name: label })}
                aria-describedby={hintId}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                onKeyDown={onStageKeyDown}
            >
                <Icon name="pointer" className="wheel-pointer spinly-imgadj-pointer" size={40} />
                <svg className="spinly-imgadj-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
                    <defs>
                        <clipPath id={`${uid}-sector`}><path d={sectorPath} /></clipPath>
                        <clipPath id={`${uid}-wheel`}><circle cx={CENTER} cy={CENTER} r={CENTER} /></clipPath>
                    </defs>
                    <g transform={`rotate(${-mid} ${CENTER} ${CENTER})`}>
                        {segments.map((segment, i) => {
                            if (i === index) return null;
                            const angles = getSectorAngles(i, count);
                            return (
                                <path
                                    key={i}
                                    className="spinly-imgadj-other"
                                    d={describeSector(CENTER, CENTER, CENTER, angles.start, angles.end)}
                                    fill={segment.color}
                                />
                            );
                        })}
                        <g clipPath={`url(#${uid}-wheel)`}>
                            <image href={image} preserveAspectRatio="xMidYMid slice" opacity={0.3} {...getImageBox(fit)} />
                        </g>
                        <g clipPath={`url(#${uid}-sector)`}>
                            <path d={sectorPath} fill={color} />
                            <image href={image} preserveAspectRatio="xMidYMid slice" {...getImageBox(fit)} />
                        </g>
                        <path className="spinly-imgadj-outline" d={sectorPath} />
                    </g>
                    <circle className="spinly-imgadj-hub" cx={CENTER} cy={CENTER} r={HUB_RADIUS} />
                    <text className="spinly-imgadj-label" x={CENTER} y={LABEL_Y} textAnchor="middle">{label}</text>
                </svg>
            </div>
            <p id={hintId} className="spinly-imgadj-hint">
                {t('imageAdjust', 'hint')} {t('imageAdjust', 'asWinner')}
            </p>

            <div className="spinly-imgadj-controls">
                <label className="spinly-imgadj-range">
                    <span className="spinly-imgadj-range-head">
                        <span>{t('imageAdjust', 'zoom')}</span>
                        <output>{zoomPercent}%</output>
                    </span>
                    <input
                        type="range"
                        min={IMAGE_FIT_LIMITS.minScale * 100}
                        max={IMAGE_FIT_LIMITS.maxScale * 100}
                        step={1}
                        value={zoomPercent}
                        onChange={(event) => setFit((prev) => clampFit({ ...prev, scale: Number(event.target.value) / 100 }))}
                    />
                </label>
                <label className="spinly-imgadj-range">
                    <span className="spinly-imgadj-range-head">
                        <span>{t('imageAdjust', 'rotate')}</span>
                        <output>{rotation}°</output>
                    </span>
                    <input
                        type="range"
                        min={-IMAGE_FIT_LIMITS.maxRotate}
                        max={IMAGE_FIT_LIMITS.maxRotate}
                        step={1}
                        value={rotation}
                        onChange={(event) => setFit((prev) => clampFit({ ...prev, rotate: Number(event.target.value) }))}
                    />
                </label>
            </div>

            <div className="spinly-imgadj-presets">
                <button type="button" className="spinly-action-btn" onClick={() => setFit(fitImageToSector(index, count))}>
                    {t('imageAdjust', 'fitSector')}
                </button>
                <button type="button" className="spinly-action-btn" onClick={() => setFit(DEFAULT_IMAGE_FIT)}>
                    {t('imageAdjust', 'coverWheel')}
                </button>
                <button type="button" className="spinly-action-btn" onClick={onReplace}>
                    {t('imageAdjust', 'replace')}
                </button>
                {onRemove && (
                    <button type="button" className="spinly-action-btn spinly-imgadj-remove" onClick={onRemove}>
                        {t('imageAdjust', 'remove')}
                    </button>
                )}
            </div>

            <footer className="spinly-imgadj-footer">
                <button type="button" className="spinly-action-btn" onClick={onCancel}>{t('common', 'cancel')}</button>
                <button type="button" className="spinly-btn-primary spinly-imgadj-apply" onClick={() => onApply(fit)}>
                    {t('imageAdjust', 'apply')}
                </button>
            </footer>
        </Modal>
    );
}

export default ImageAdjustDialog;
