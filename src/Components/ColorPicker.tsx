import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../css/ColorPicker.css';
import { useTranslation } from '../lib/i18n';

interface ColorPickerProps {
    color: string;
    onChange: (hex: string) => void;
    onClose: () => void;
    anchorEl: HTMLElement;
}

type Rgb = { r: number; g: number; b: number };
type Hsv = { h: number; s: number; v: number };

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);
const byte = (n: number): string => clamp(Math.round(Number.isFinite(n) ? n : 0), 0, 255).toString(16).padStart(2, '0');

export function hexToRgb(hex: string): Rgb {
    let clean = hex.trim().replace('#', '');
    if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
    if (clean.length !== 6 || /[^0-9a-fA-F]/.test(clean)) return { r: 0, g: 0, b: 0 };
    const num = parseInt(clean, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
    return `#${byte(r)}${byte(g)}${byte(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === rr) h = ((gg - bb) / d) % 6;
        else if (max === gg) h = (bb - rr) / d + 2;
        else h = (rr - gg) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
    const c = v * s;
    const hh = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hh < 1) { r = c; g = x; }
    else if (hh < 2) { r = x; g = c; }
    else if (hh < 3) { g = c; b = x; }
    else if (hh < 4) { g = x; b = c; }
    else if (hh < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = v - c;
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255),
    };
}

function ColorPicker({ color, onChange, onClose, anchorEl }: ColorPickerProps) {
    const { t } = useTranslation();
    // HSV inicial SOLO al montar (el picker se re-monta por key en cada apertura)
    const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(color)));
    const dragAreaRef = useRef<'sv' | 'hue' | null>(null);
    const [hexDraft, setHexDraft] = useState<string | null>(null);
    const [rgbDrafts, setRgbDrafts] = useState<{ r: string | null; g: string | null; b: string | null }>({ r: null, g: null, b: null });
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    const rgb = hsvToRgb(hsv);
    const hex = rgbToHex(rgb);

    // onChange siempre fresco sin re-emitir por renders del padre
    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    });

    // Aplica el color en tiempo real mientras se arrastra
    useEffect(() => {
        onChangeRef.current(rgbToHex(hsvToRgb(hsv)));
    }, [hsv]);

    // Cierre con Escape / clic fuera (mismo patrón que el resto de menús)
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node;
            if (panelRef.current?.contains(target)) return;
            if (anchorEl.contains(target)) return; // el swatch hace toggle con su propio click
            onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [onClose, anchorEl]);

    // Posición anclada al swatch (sigue scroll/resize, nunca se sale del viewport)
    useLayoutEffect(() => {
        const update = () => {
            const rect = anchorEl.getBoundingClientRect();
            const pw = panelRef.current?.offsetWidth ?? 264;
            const ph = panelRef.current?.offsetHeight ?? 340;
            let left = clamp(rect.left, 8, Math.max(8, window.innerWidth - pw - 8));
            let top = rect.bottom + 8;
            if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - 8);
            setPos({ top, left });
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [anchorEl]);

    const applySv = (clientX: number, clientY: number, el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        const s = clamp((clientX - rect.left) / rect.width, 0, 1);
        const v = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
        setHsv((prev) => ({ ...prev, s, v }));
    };

    const applyHue = (clientY: number, el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        const h = clamp((clientY - rect.top) / rect.height, 0, 1) * 360;
        setHsv((prev) => ({ ...prev, h }));
    };

    const setDrag = (area: 'sv' | 'hue' | null) => {
        dragAreaRef.current = area;
    };

    const onSvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag('sv');
        applySv(e.clientX, e.clientY, e.currentTarget);
    };

    const onSvPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragAreaRef.current !== 'sv') return;
        applySv(e.clientX, e.clientY, e.currentTarget);
    };

    const onHuePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag('hue');
        applyHue(e.clientY, e.currentTarget);
    };

    const onHuePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragAreaRef.current !== 'hue') return;
        applyHue(e.clientY, e.currentTarget);
    };

    const endDrag = (e: React.PointerEvent<HTMLElement>) => {
        if (dragAreaRef.current) {
            try {
                e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
                // la captura puede haberse perdido: no pasa nada
            }
        }
        setDrag(null);
    };

    const commitHex = () => {
        if (hexDraft !== null) {
            const clean = hexDraft.trim().replace(/^#/, '');
            if (/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) {
                setHsv(rgbToHsv(hexToRgb(clean)));
            }
        }
        setHexDraft(null);
    };

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
            className="cpicker"
            ref={panelRef}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
            role="dialog"
            aria-label={t('colorPicker', 'dialog')}
        >
            <div className="cpicker-head">
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
        </div>
    );
}

export default ColorPicker;

