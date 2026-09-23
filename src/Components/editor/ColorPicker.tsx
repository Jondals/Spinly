import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../../css/ColorPicker.css';
import { useTranslation } from '../i18n/LanguageProvider';
import { useDismiss } from '../../hooks/useDismiss';
import { clamp, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv, type Hsv } from '../../scripts/color';

interface ColorPickerProps {
    color: string;
    onChange: (hex: string) => void;
    onClose: () => void;
    anchorEl: HTMLElement;
    /**
     * below: bajo el ancla, o encima si no cabe. around: para anclas grandes como la ruleta;
     * debajo, o si no a un lado, para que el ancla siga a la vista mientras se elige el color.
     */
    placement?: 'below' | 'around';
}

function ColorPicker({ color, onChange, onClose, anchorEl, placement = 'below' }: ColorPickerProps) {
    const { t } = useTranslation();
    // Solo al montar: el picker se re-monta por key en cada apertura.
    const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(color)));
    const dragAreaRef = useRef<'sv' | 'hue' | null>(null);
    const [hexDraft, setHexDraft] = useState<string | null>(null);
    const [rgbDrafts, setRgbDrafts] = useState<{ r: string | null; g: string | null; b: string | null }>({ r: null, g: null, b: null });
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    // Arrastrado con el ratón por la cabecera: deja de seguir al ancla y se queda donde se soltó.
    const movedRef = useRef(false);
    const grabRef = useRef<{ dx: number; dy: number } | null>(null);
    const [grabbing, setGrabbing] = useState(false);

    const rgb = hsvToRgb(hsv);
    const hex = rgbToHex(rgb);

    // Ref para emitir solo cuando cambia el color, no en cada render del padre.
    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    });

    useEffect(() => {
        onChangeRef.current(rgbToHex(hsvToRgb(hsv)));
    }, [hsv]);

    // El swatch queda "dentro": su propio click ya alterna el selector.
    const anchorRef = useRef<HTMLElement>(anchorEl);
    anchorRef.current = anchorEl;
    useDismiss(true, onClose, [panelRef, anchorRef]);

    // Anclado, sigue scroll y resize sin salirse del viewport.
    useLayoutEffect(() => {
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
                // La captura ya se había perdido.
            }
        }
        setDrag(null);
    };

    const onHeadPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'mouse' || event.button !== 0 || !pos) return;
        if ((event.target as HTMLElement).closest('button')) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        grabRef.current = { dx: event.clientX - pos.left, dy: event.clientY - pos.top };
        setGrabbing(true);
    };

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

    const endHeadDrag = () => {
        grabRef.current = null;
        setGrabbing(false);
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

