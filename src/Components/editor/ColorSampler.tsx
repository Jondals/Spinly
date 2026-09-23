import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import Modal from '../common/Modal';
import { useTranslation } from '../i18n/LanguageProvider';
import { clamp } from '../../scripts/color';
import { pixelHex } from '../../scripts/screen-capture';
import '../../css/ColorSampler.css';

interface ColorSamplerProps {
    /** Captura congelada o imagen, a resolución real. */
    source: HTMLCanvasElement;
    onPick: (hex: string) => void;
    onCancel: () => void;
    /** Solo con imagen: elegir otra sin cerrar. */
    onReplace?: () => void;
}

type Point = { x: number; y: number };

// Lupa: LOUPE_PIXELS × LOUPE_PIXELS píxeles de la fuente, cada uno ampliado LOUPE_ZOOM veces.
const LOUPE_PIXELS = 11;
const LOUPE_ZOOM = 12;
const LOUPE_SIZE = LOUPE_PIXELS * LOUPE_ZOOM;
const LOUPE_GAP = 24;
// En táctil la lupa va por encima del dedo, que si no la taparía.
const TOUCH_LIFT = 56;

/**
 * Pipeta sobre una imagen, para navegadores sin EyeDropper: ratón (mover y clic), táctil
 * (arrastrar y soltar) y teclado (flechas y Enter). Escape cancela (lo gestiona Modal).
 */
function ColorSampler({ source, onPick, onCancel, onReplace }: ColorSamplerProps) {
    const { t } = useTranslation();
    const titleId = useId();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const loupeRef = useRef<HTMLCanvasElement>(null);
    const pressedRef = useRef(false);
    const [cursor, setCursor] = useState<Point | null>(null);
    const [anchor, setAnchor] = useState<{ client: Point; touch: boolean } | null>(null);
    const [coarse] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches === true);

    useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        ctx?.drawImage(source, 0, 0);
    }, [source]);

    const hex = cursor ? pixelHex(source, cursor.x, cursor.y) : null;

    useEffect(() => {
        const ctx = loupeRef.current?.getContext('2d');
        if (!ctx || !cursor) return;
        const half = Math.floor(LOUPE_PIXELS / 2);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
        ctx.drawImage(source, cursor.x - half, cursor.y - half, LOUPE_PIXELS, LOUPE_PIXELS, 0, 0, LOUPE_SIZE, LOUPE_SIZE);
        // Píxel central: doble marco para que se vea sobre cualquier color.
        const at = half * LOUPE_ZOOM;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(at - 1, at - 1, LOUPE_ZOOM + 2, LOUPE_ZOOM + 2);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(at + 1, at + 1, LOUPE_ZOOM - 2, LOUPE_ZOOM - 2);
    }, [cursor, source]);

    const toSource = (clientX: number, clientY: number): Point | null => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return null;
        return {
            x: clamp(Math.floor(((clientX - rect.left) / rect.width) * source.width), 0, source.width - 1),
            y: clamp(Math.floor(((clientY - rect.top) / rect.height) * source.height), 0, source.height - 1),
        };
    };

    const toClient = ({ x, y }: Point): Point | null => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return {
            x: rect.left + ((x + 0.5) / source.width) * rect.width,
            y: rect.top + ((y + 0.5) / source.height) * rect.height,
        };
    };

    const track = (event: PointerEvent<HTMLCanvasElement>) => {
        const point = toSource(event.clientX, event.clientY);
        if (!point) return;
        setCursor(point);
        setAnchor({ client: { x: event.clientX, y: event.clientY }, touch: event.pointerType !== 'mouse' });
    };

    const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pressedRef.current = true;
        track(event);
    };

    const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
        // Con ratón la lupa sigue al cursor; en táctil solo mientras el dedo está apoyado.
        if (event.pointerType === 'mouse' || pressedRef.current) track(event);
    };

    const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
        if (!pressedRef.current) return;
        pressedRef.current = false;
        const point = toSource(event.clientX, event.clientY);
        const picked = point ? pixelHex(source, point.x, point.y) : null;
        if (picked) onPick(picked);
    };

    const onPointerCancel = () => {
        pressedRef.current = false;
        setAnchor(null);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
        const current = cursor ?? { x: Math.floor(source.width / 2), y: Math.floor(source.height / 2) };
        const step = event.shiftKey ? 10 : 1;
        const moves: Record<string, Point> = {
            ArrowLeft: { x: -step, y: 0 },
            ArrowRight: { x: step, y: 0 },
            ArrowUp: { x: 0, y: -step },
            ArrowDown: { x: 0, y: step },
        };
        const move = moves[event.key];
        if (move) {
            event.preventDefault();
            const next = {
                x: clamp(current.x + move.x, 0, source.width - 1),
                y: clamp(current.y + move.y, 0, source.height - 1),
            };
            setCursor(next);
            const client = toClient(next);
            if (client) setAnchor({ client, touch: false });
            return;
        }
        if ((event.key === 'Enter' || event.key === ' ') && cursor) {
            event.preventDefault();
            const picked = pixelHex(source, cursor.x, cursor.y);
            if (picked) onPick(picked);
        }
    };

    // Junto al cursor sin salirse de la pantalla; si no cabe a la derecha o abajo, al otro lado.
    const loupeStyle = (() => {
        if (!anchor) return undefined;
        const { client, touch } = anchor;
        const height = LOUPE_SIZE + 28;
        let left = touch ? client.x - LOUPE_SIZE / 2 : client.x + LOUPE_GAP;
        let top = touch ? client.y - height - TOUCH_LIFT : client.y + LOUPE_GAP;
        if (!touch && left + LOUPE_SIZE > window.innerWidth - 8) left = client.x - LOUPE_GAP - LOUPE_SIZE;
        if (top + height > window.innerHeight - 8) top = client.y - LOUPE_GAP - height;
        if (touch && top < 8) top = client.y + TOUCH_LIFT;
        return {
            left: clamp(left, 8, Math.max(8, window.innerWidth - LOUPE_SIZE - 8)),
            top: clamp(top, 8, Math.max(8, window.innerHeight - height - 8)),
        };
    })();

    return (
        <Modal
            labelledBy={titleId}
            onClose={onCancel}
            backdropClassName="csampler"
            className="csampler-dialog"
            initialFocus={canvasRef}
        >
            <div className="csampler-bar">
                <div className="csampler-text">
                    <p id={titleId} className="csampler-title">{t('colorPicker', 'samplerTitle')}</p>
                    <p className="csampler-hint">{t('colorPicker', coarse ? 'samplerHintTouch' : 'samplerHintMouse')}</p>
                </div>
                <div className="csampler-actions">
                    {onReplace && (
                        <button type="button" className="spinly-action-btn" onClick={onReplace}>
                            {t('colorPicker', 'samplerOtherImage')}
                        </button>
                    )}
                    <button type="button" className="spinly-action-btn" onClick={onCancel}>
                        {t('common', 'cancel')}
                    </button>
                </div>
            </div>
            <div className="csampler-stage">
                <canvas
                    ref={canvasRef}
                    className="csampler-canvas"
                    width={source.width}
                    height={source.height}
                    tabIndex={0}
                    aria-label={t('colorPicker', 'samplerCanvas')}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    onPointerLeave={(event) => { if (event.pointerType === 'mouse') setAnchor(null); }}
                    onKeyDown={onKeyDown}
                />
            </div>
            {anchor && loupeStyle && (
                <div className="csampler-loupe" style={loupeStyle} aria-hidden="true">
                    <canvas ref={loupeRef} width={LOUPE_SIZE} height={LOUPE_SIZE} />
                    <span className="csampler-loupe-value">
                        <span className="csampler-loupe-swatch" style={{ background: hex ?? 'transparent' }} />
                        {hex}
                    </span>
                </div>
            )}
            {/* El color bajo el cursor también se anuncia al lector de pantalla */}
            <span className="csampler-live" aria-live="polite">{hex ?? ''}</span>
        </Modal>
    );
}

export default ColorSampler;
