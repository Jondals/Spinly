/**
 * ColorPicker: a floating HSV color picker (saturation/value square, hue bar, HEX and RGB fields and an
 * eyedropper), anchored to the element that opened it and draggable by its header with a mouse.
 */
import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../../css/ColorPicker.css';
import { useTranslation } from '../i18n/LanguageProvider';
import { useDismiss } from '../../hooks/useDismiss';
import { useEyeDropper } from '../../hooks/useEyeDropper';
import Icon from '../common/Icon';
import { clamp, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv, type Hsv } from '../../scripts/color';
import { captureScreenFrame, loadImageFile } from '../../scripts/screen-capture';

// Only loaded in browsers without EyeDropper, and only when the eyedropper is used.
const ColorSampler = lazy(() => import('./ColorSampler'));

interface ColorPickerProps {
    color: string;
    onChange: (hex: string) => void;
    onClose: () => void;
    anchorEl: HTMLElement;
    /**
     * below: under the anchor, or above it if it does not fit. around: for big anchors like the wheel;
     * below, or otherwise to one side, so the anchor stays visible while the color is being picked.
     */
    placement?: 'below' | 'around';
}

/** Renders the picker and reports every color change through `onChange`. */
function ColorPicker({ color, onChange, onClose, anchorEl, placement = 'below' }: ColorPickerProps) {
    const { t } = useTranslation();
    // Only on mount: the picker is remounted (by key) every time it opens.
    const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(color)));
    const dragAreaRef = useRef<'sv' | 'hue' | null>(null);
    const [hexDraft, setHexDraft] = useState<string | null>(null);
    const [rgbDrafts, setRgbDrafts] = useState<{ r: string | null; g: string | null; b: string | null }>({ r: null, g: null, b: null });
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    // Once dragged by its header with a mouse, it stops following the anchor and stays where it was dropped.
    const movedRef = useRef(false);
    const grabRef = useRef<{ dx: number; dy: number } | null>(null);
    const [grabbing, setGrabbing] = useState(false);

    const rgb = hsvToRgb(hsv);
    const hex = rgbToHex(rgb);

    // A ref so the color is emitted only when it changes, not on every render of the parent.
    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    });

    useEffect(() => {
        onChangeRef.current(rgbToHex(hsvToRgb(hsv)));
    }, [hsv]);

    // The swatch counts as "inside": its own click already toggles the picker.
    const anchorRef = useRef<HTMLElement>(anchorEl);
    anchorRef.current = anchorEl;
    const eyeDropper = useEyeDropper();
    const fileRef = useRef<HTMLInputElement>(null);
    // Capture or image the color is picked from (screen and image modes).
    const [sample, setSample] = useState<{ canvas: HTMLCanvasElement; fromFile: boolean } | null>(null);
    const [capturing, setCapturing] = useState(false);
    const eyedropperBusy = eyeDropper.picking || capturing || sample !== null;
    // While the eyedropper is open, clicks and Escape belong to it: they must not close the picker.
    useDismiss(!eyedropperBusy, onClose, [panelRef, anchorRef]);

    /** Applies a color picked with the eyedropper. */
    const applyPicked = (picked: string) => {
        setHexDraft(null);
        setHsv(rgbToHsv(hexToRgb(picked)));
    };

    /** Starts the eyedropper in the best mode available (native, screen capture or image). */
    const startEyedropper = async () => {
        if (eyeDropper.mode === 'native') {
            const picked = await eyeDropper.pickNative();
            if (picked) applyPicked(picked);
            return;
        }
        if (eyeDropper.mode === 'screen') {
            setCapturing(true);
            const canvas = await captureScreenFrame();
            setCapturing(false);
            // null: the user cancelled the screen-share dialog; nothing to report.
            if (canvas) setSample({ canvas, fromFile: false });
            return;
        }
        fileRef.current?.click();
    };

    /** Opens the sampler over an image chosen by the user. */
    const onImageChosen = async (file: File | undefined) => {
        if (!file) return;
        const canvas = await loadImageFile(file);
        if (canvas) setSample({ canvas, fromFile: true });
    };

    const eyedropperLabel = t('colorPicker', eyeDropper.mode === 'native' ? 'eyedropper' : eyeDropper.mode === 'screen' ? 'eyedropperScreen' : 'eyedropperImage');

    // While anchored, it follows scroll and resize without leaving the viewport.
    useLayoutEffect(() => {
        /** Recomputes the position from the anchor (or keeps a dragged panel inside the viewport). */
        const update = () => {
            const rect = anchorEl.getBoundingClientRect();
            const pw = panelRef.current?.offsetWidth ?? 264;
            const ph = panelRef.current?.offsetHeight ?? 340;
            const maxLeft = Math.max(8, window.innerWidth - pw - 8);
            const maxTop = Math.max(8, window.innerHeight - ph - 8);
            if (movedRef.current) {
                setPos((prev) => (prev ? { top: clamp(prev.top, 8, maxTop), left: clamp(prev.left, 8, maxLeft) } : prev));
                return;
            }
            if (placement === 'around') {
                const besideTop = clamp(rect.top + (rect.height - ph) / 2, 8, maxTop);
                if (rect.bottom + 8 + ph <= window.innerHeight - 8) {
                    setPos({ top: rect.bottom + 8, left: clamp(rect.left + (rect.width - pw) / 2, 8, maxLeft) });
                } else if (rect.right + 8 + pw <= window.innerWidth - 8) {
                    setPos({ top: besideTop, left: rect.right + 8 });
                } else if (rect.left - 8 - pw >= 8) {
                    setPos({ top: besideTop, left: rect.left - 8 - pw });
                } else {
                    setPos({ top: maxTop, left: clamp(rect.left + (rect.width - pw) / 2, 8, maxLeft) });
                }
                return;
            }
            let top = rect.bottom + 8;
            if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - 8);
            setPos({ top, left: clamp(rect.left, 8, maxLeft) });
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [anchorEl, placement]);

    /** Sets saturation and value from a point in the square. */
    const applySv = (clientX: number, clientY: number, el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        const s = clamp((clientX - rect.left) / rect.width, 0, 1);
        const v = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
        setHsv((prev) => ({ ...prev, s, v }));
    };

    /** Sets the hue from a point in the bar. */
    const applyHue = (clientY: number, el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        const h = clamp((clientY - rect.top) / rect.height, 0, 1) * 360;
        setHsv((prev) => ({ ...prev, h }));
    };

    /** Remembers which area is being dragged. */
    const setDrag = (area: 'sv' | 'hue' | null) => {
        dragAreaRef.current = area;
    };

    /** Starts dragging in the saturation/value square. */
    const onSvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag('sv');
        applySv(e.clientX, e.clientY, e.currentTarget);
    };

    /** Drags inside the saturation/value square. */
    const onSvPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragAreaRef.current !== 'sv') return;
        applySv(e.clientX, e.clientY, e.currentTarget);
    };

    /** Starts dragging in the hue bar. */
    const onHuePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag('hue');
        applyHue(e.clientY, e.currentTarget);
    };

    /** Drags inside the hue bar. */
    const onHuePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragAreaRef.current !== 'hue') return;
        applyHue(e.clientY, e.currentTarget);
    };

    /** Ends a drag in the square or the bar. */
    const endDrag = (e: React.PointerEvent<HTMLElement>) => {
        if (dragAreaRef.current) {
            try {
                e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
                // The capture was already lost.
            }
        }
        setDrag(null);
    };

    /** Mouse only: starts moving the panel by its header. */
    const onHeadPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'mouse' || event.button !== 0 || !pos) return;
        if ((event.target as HTMLElement).closest('button')) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        grabRef.current = { dx: event.clientX - pos.left, dy: event.clientY - pos.top };
        setGrabbing(true);
    };

    /** Moves the panel, kept inside the viewport. */
    const onHeadPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const grab = grabRef.current;
        const panel = panelRef.current;
        if (!grab || !panel) return;
        movedRef.current = true;
        setPos({
            left: clamp(event.clientX - grab.dx, 8, Math.max(8, window.innerWidth - panel.offsetWidth - 8)),
            top: clamp(event.clientY - grab.dy, 8, Math.max(8, window.innerHeight - panel.offsetHeight - 8)),
        });
    };

    /** Stops moving the panel. */
    const endHeadDrag = () => {
        grabRef.current = null;
        setGrabbing(false);
    };

    /** Applies the typed HEX value if it is valid. */
    const commitHex = () => {
        if (hexDraft !== null) {
            const clean = hexDraft.trim().replace(/^#/, '');
            if (/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) {
                setHsv(rgbToHsv(hexToRgb(clean)));
            }
        }
        setHexDraft(null);
    };

    /** Applies a typed R, G or B value (0-255). */
    const commitChannel = (ch: 'r' | 'g' | 'b') => {
        const raw = rgbDrafts[ch];
        if (raw !== null && raw.trim() !== '') {
            const n = Number(raw);
            if (Number.isFinite(n)) {
                const next = { ...rgb, [ch]: clamp(Math.round(n), 0, 255) };
                setHsv(rgbToHsv(next));
            }
        }
        setRgbDrafts((prev) => ({ ...prev, [ch]: null }));
    };

    return (
        <div
            className={`cpicker${grabbing ? ' cpicker--grabbing' : ''}`}
            ref={panelRef}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
            role="dialog"
            aria-label={t('colorPicker', 'dialog')}
        >
            <div
                className="cpicker-head"
                onPointerDown={onHeadPointerDown}
                onPointerMove={onHeadPointerMove}
                onPointerUp={endHeadDrag}
                onPointerCancel={endHeadDrag}
            >
                <span className="cpicker-title">{t('colorPicker', 'title')}</span>
                <button type="button" className="cpicker-close" onClick={onClose} aria-label={t('colorPicker', 'close')}>✕</button>
            </div>
            <div className="cpicker-body">
                <div
                    className="cpicker-sv"
                    style={{ background: `linear-gradient(to top, #000, rgba(0, 0, 0, 0)), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
                    onPointerDown={onSvPointerDown}
                    onPointerMove={onSvPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                >
                    <span className="cpicker-sv-handle" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
                </div>
                <div
                    className="cpicker-hue"
                    onPointerDown={onHuePointerDown}
                    onPointerMove={onHuePointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                >
                    <span className="cpicker-hue-handle" style={{ top: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }} />
                </div>
            </div>
            <div className="cpicker-result">
                <button
                    type="button"
                    className={`cpicker-eyedropper${eyedropperBusy ? ' cpicker-eyedropper--active' : ''}`}
                    onClick={() => { void startEyedropper(); }}
                    disabled={eyedropperBusy}
                    aria-label={eyedropperLabel}
                    title={eyeDropper.picking ? t('colorPicker', 'eyedropperActive') : eyedropperLabel}
                >
                    <Icon name="eyedropper" size={16} />
                </button>
                {eyeDropper.mode !== 'native' && (
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="cpicker-file"
                        tabIndex={-1}
                        aria-hidden="true"
                        onChange={(event) => {
                            void onImageChosen(event.target.files?.[0]);
                            event.target.value = '';
                        }}
                    />
                )}
                <span className="cpicker-swatch" style={{ background: hex }} />
                <label className="cpicker-field cpicker-field--hex">
                    <span>HEX</span>
                    <input
                        type="text"
                        value={hexDraft ?? hex}
                        maxLength={7}
                        onChange={(e) => setHexDraft(e.target.value)}
                        onBlur={commitHex}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitHex();
                            if (e.key === 'Escape') setHexDraft(null);
                        }}
                        spellCheck={false}
                        aria-label={t('colorPicker', 'hex')}
                    />
                </label>
            </div>
            <div className="cpicker-rgb">
                {(['r', 'g', 'b'] as const).map((ch) => (
                    <label key={ch} className="cpicker-field">
                        <span>{ch.toUpperCase()}</span>
                        <input
                            type="number"
                            min={0}
                            max={255}
                            value={rgbDrafts[ch] ?? rgb[ch]}
                            onChange={(e) => setRgbDrafts((prev) => ({ ...prev, [ch]: e.target.value }))}
                            onBlur={() => commitChannel(ch)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitChannel(ch); }}
                            aria-label={t('colorPicker', 'channel', { ch: ch.toUpperCase() })}
                        />
                    </label>
                ))}
            </div>
            {sample && (
                <Suspense fallback={null}>
                    <ColorSampler
                        source={sample.canvas}
                        onPick={(picked) => {
                            applyPicked(picked);
                            setSample(null);
                        }}
                        onCancel={() => setSample(null)}
                        onReplace={sample.fromFile ? () => fileRef.current?.click() : undefined}
                    />
                </Suspense>
            )}
        </div>
    );
}

export default ColorPicker;

