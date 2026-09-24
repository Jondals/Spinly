import { useEffect, useRef } from 'react';

// Trama: separación y radio base en px CSS.
const SPACING = 28;
const BASE_RADIUS = 1.2;
// Deriva lenta de toda la trama (px/s) y onda de brillo que la cruza en diagonal.
const DRIFT_X = 3;
const DRIFT_Y = 6;
const WAVE_LENGTH = 150;
const WAVE_SPEED = 0.8;
// Reacción al cursor: alcance, cuánto se apartan los puntos y cuánto crecen.
const REACH = 140;
const PUSH = 5;
const GROW = 1.3;
// Tiempos de suavizado (ms): el foco persigue al cursor y aparece o se apaga sin saltos.
const FOLLOW_MS = 90;
const FADE_MS = 240;
// Sin el cursor encima basta con ~30 fps: la onda es lenta y se ahorra batería.
const IDLE_FRAME_MS = 33;
// Los puntos lejos del cursor se agrupan por opacidad: pocas llamadas a fill() por frame.
const ALPHA_STEPS = 8;
const MAX_DPR = 2;

type Rgb = readonly [number, number, number];

/** Cualquier color CSS a RGB: el canvas lo normaliza al asignarlo a fillStyle. */
function toRgb(ctx: CanvasRenderingContext2D, value: string, fallback: Rgb): Rgb {
    if (!value) return fallback;
    ctx.fillStyle = '#000000';
    ctx.fillStyle = value;
    const normalized = String(ctx.fillStyle);
    const hex = /^#([0-9a-f]{6})$/i.exec(normalized);
    if (hex) {
        const n = parseInt(hex[1], 16);
        return [n >> 16, (n >> 8) & 255, n & 255];
    }
    const parts = normalized.match(/[\d.]+/g);
    return parts && parts.length >= 3 ? [Number(parts[0]), Number(parts[1]), Number(parts[2])] : fallback;
}

const mixRgb = (from: Rgb, to: Rgb, amount: number): string =>
    `rgb(${Math.round(from[0] + (to[0] - from[0]) * amount)}, ${Math.round(from[1] + (to[1] - from[1]) * amount)}, ${Math.round(from[2] + (to[2] - from[2]) * amount)})`;

/**
 * Fondo de puntos del panel de la ruleta, en canvas: una onda de brillo recorre la trama y los
 * puntos cercanos al cursor se apartan, crecen y toman el color de acento. Se dibuja detrás del
 * contenido de su contenedor (que debe ser un contexto de apilamiento) y no recibe eventos.
 * Con movimiento reducido queda una trama fija, sin onda ni reacción.
 */
function DotField() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const host = canvas?.parentElement;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !host || !ctx) return undefined;

        const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const isStill = () => reducedQuery?.matches === true;
        let width = 0;
        let height = 0;
        let base: Rgb = [38, 40, 56];
        let glow: Rgb = [139, 144, 184];
        let baseFill = `rgb(${base.join(', ')})`;
        let frame = 0;
        let lastTime = 0;
        let lastDraw = 0;
        let onScreen = true;
        let colorsRead = false;
        const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, level: 0, inside: false };

        const readColors = () => {
            const style = getComputedStyle(canvas);
            base = toRgb(ctx, style.getPropertyValue('--wheel-dots').trim(), base);
            glow = toRgb(ctx, style.getPropertyValue('--wheel-dots-glow').trim(), glow);
            baseFill = `rgb(${base.join(', ')})`;
        };

        const draw = (time: number) => {
            ctx.clearRect(0, 0, width, height);
            const still = isStill();
            const seconds = still ? 0 : time / 1000;
            const offsetX = (seconds * DRIFT_X) % SPACING;
            const offsetY = (seconds * DRIFT_Y) % SPACING;
            const reach2 = REACH * REACH;
            const level = still ? 0 : pointer.level;
            const buckets = Array.from({ length: ALPHA_STEPS }, () => new Path2D());
            const lit: Array<{ x: number; y: number; radius: number; alpha: number; amount: number }> = [];

            for (let y = offsetY - SPACING; y < height + SPACING; y += SPACING) {
                for (let x = offsetX - SPACING; x < width + SPACING; x += SPACING) {
                    const wave = still ? 0.5 : 0.5 + 0.5 * Math.sin((x + y * 0.6) / WAVE_LENGTH - seconds * WAVE_SPEED);
                    let px = x;
                    let py = y;
                    let radius = BASE_RADIUS + wave * 0.35;
                    let alpha = 0.6 + wave * 0.4;
                    if (level > 0.001) {
                        const dx = x - pointer.x;
                        const dy = y - pointer.y;
                        const d2 = dx * dx + dy * dy;
                        if (d2 < reach2) {
                            const d = Math.sqrt(d2) || 1;
                            const falloff = 1 - d / REACH;
                            const amount = falloff * falloff * (3 - 2 * falloff) * level;
                            px += (dx / d) * amount * PUSH;
                            py += (dy / d) * amount * PUSH;
                            radius += amount * GROW;
                            alpha += (1 - alpha) * amount;
                            if (amount > 0.02) {
                                lit.push({ x: px, y: py, radius, alpha, amount });
                                continue;
                            }
                        }
                    }
                    const bucket = buckets[Math.min(ALPHA_STEPS - 1, Math.round(((alpha - 0.6) / 0.4) * (ALPHA_STEPS - 1)))];
                    bucket.moveTo(px + radius, py);
                    bucket.arc(px, py, radius, 0, Math.PI * 2);
                }
            }

            ctx.fillStyle = baseFill;
            buckets.forEach((path, i) => {
                ctx.globalAlpha = 0.6 + (i / (ALPHA_STEPS - 1)) * 0.4;
                ctx.fill(path);
            });
            for (const dot of lit) {
                ctx.globalAlpha = dot.alpha;
                ctx.fillStyle = mixRgb(base, glow, dot.amount);
                ctx.beginPath();
                ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };

        const tick = (time: number) => {
            frame = 0;
            const dt = lastTime ? Math.min(time - lastTime, 100) : 16;
            lastTime = time;
            const follow = 1 - Math.exp(-dt / FOLLOW_MS);
            pointer.x += (pointer.targetX - pointer.x) * follow;
            pointer.y += (pointer.targetY - pointer.y) * follow;
            pointer.level += ((pointer.inside ? 1 : 0) - pointer.level) * (1 - Math.exp(-dt / FADE_MS));
            if (pointer.level > 0.002 || time - lastDraw >= IDLE_FRAME_MS) {
                draw(time);
                lastDraw = time;
            }
            start();
        };

        const start = () => {
            if (!frame && onScreen && !isStill()) frame = requestAnimationFrame(tick);
        };

        const stop = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            lastTime = 0;
        };

        // Lo llama el ResizeObserver, ya con el layout hecho: medir y leer estilos aquí no fuerza
        // un recálculo síncrono de toda la página recién montada.
        const resize = () => {
            if (!colorsRead) {
                readColors();
                colorsRead = true;
            }
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            width = host.clientWidth;
            height = host.clientHeight;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            draw(performance.now());
        };

        // Si el panel se desplaza (ventanas muy bajas), la trama acompaña a la parte visible.
        const onScroll = () => {
            canvas.style.transform = `translateY(${host.scrollTop}px)`;
        };

        const onPointerMove = (event: PointerEvent) => {
            if (isStill()) return;
            const rect = canvas.getBoundingClientRect();
            pointer.targetX = event.clientX - rect.left;
            pointer.targetY = event.clientY - rect.top;
            // Al entrar, el foco nace donde está el cursor en vez de viajar desde la última posición.
            if (!pointer.inside && pointer.level < 0.05) {
                pointer.x = pointer.targetX;
                pointer.y = pointer.targetY;
            }
            pointer.inside = true;
            start();
        };

        const onPointerLeave = () => {
            pointer.inside = false;
        };

        const onTouchEnd = (event: PointerEvent) => {
            if (event.pointerType !== 'mouse') pointer.inside = false;
        };

        const onMotionChange = () => {
            if (isStill()) {
                stop();
                draw(0);
            } else {
                start();
            }
        };

        // La primera notificación del ResizeObserver hace la primera medida y el primer dibujo, en el
        // frame siguiente: fuera de la tarea del primer layout de la app, que ya es la más pesada.
        let resizeFrame = 0;
        const resizeObserver = new ResizeObserver(() => {
            cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => {
                resize();
                start();
            });
        });
        resizeObserver.observe(host);
        const themeObserver = new MutationObserver(() => {
            readColors();
            draw(performance.now());
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        const visibilityObserver = typeof IntersectionObserver === 'undefined'
            ? null
            : new IntersectionObserver(([entry]) => {
                onScreen = entry.isIntersecting;
                if (onScreen) start();
                else stop();
            });
        visibilityObserver?.observe(host);

        host.addEventListener('scroll', onScroll, { passive: true });
        host.addEventListener('pointermove', onPointerMove);
        host.addEventListener('pointerdown', onPointerMove);
        host.addEventListener('pointerleave', onPointerLeave);
        host.addEventListener('pointerup', onTouchEnd);
        host.addEventListener('pointercancel', onTouchEnd);
        reducedQuery?.addEventListener?.('change', onMotionChange);

        return () => {
            stop();
            cancelAnimationFrame(resizeFrame);
            resizeObserver.disconnect();
            themeObserver.disconnect();
            visibilityObserver?.disconnect();
            host.removeEventListener('scroll', onScroll);
            host.removeEventListener('pointermove', onPointerMove);
            host.removeEventListener('pointerdown', onPointerMove);
            host.removeEventListener('pointerleave', onPointerLeave);
            host.removeEventListener('pointerup', onTouchEnd);
            host.removeEventListener('pointercancel', onTouchEnd);
            reducedQuery?.removeEventListener?.('change', onMotionChange);
        };
    }, []);

    return <canvas ref={canvasRef} className="wheel-dots" aria-hidden="true" />;
}

export default DotField;
