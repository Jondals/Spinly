import { useEffect, useRef } from 'react';
import { isPulseActive, readMusic, type MusicPattern } from '../../scripts/music-pulse';

type MusicVisuals = typeof import('../../scripts/music-visuals');

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
// Efectos que pintan en su propio color (rosa) en vez del de acento.
const TINTED: readonly MusicPattern[] = ['bloom', 'fireworks'];

type Rgb = readonly [number, number, number];

/** La pantalla de carga (public/index.html) aún tapa la app: hasta que empieza a abrirse. */
function coveredBySplash(): boolean {
    const splash = document.getElementById('spinly-splash');
    return splash !== null && !splash.classList.contains('spinly-splash--out') && !document.documentElement.classList.contains('spinly-splash-seen');
}

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
        let bloomTint: Rgb = [244, 114, 182];
        let baseFill = `rgb(${base.join(', ')})`;
        let frame = 0;
        let lastTime = 0;
        let lastDraw = 0;
        let onScreen = true;
        let colorsRead = false;
        let pendingResize = false;
        let center = { x: 0, y: 0, radius: 0 };
        // Reloj propio de la deriva y la onda. Con música avanza con los tiempos de la canción (medio
        // segundo de reloj por tiempo: a 120 BPM, igual que sin música), así el fondo entero va a su BPM.
        let flow = 0;
        let flowAt = 0;
        let lastBeatPosition: number | null = null;
        // Capas de la música: se descargan la primera vez que suena una canción.
        let visuals: MusicVisuals | null = null;
        let visualsRequested = false;
        const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, level: 0, inside: false };

        const readColors = () => {
            const style = getComputedStyle(canvas);
            base = toRgb(ctx, style.getPropertyValue('--wheel-dots').trim(), base);
            glow = toRgb(ctx, style.getPropertyValue('--wheel-dots-glow').trim(), glow);
            bloomTint = toRgb(ctx, style.getPropertyValue('--wheel-dots-bloom').trim(), bloomTint);
            baseFill = `rgb(${base.join(', ')})`;
        };

        const draw = (time: number) => {
            ctx.clearRect(0, 0, width, height);
            const still = isStill();
            // Con música, cada golpe enciende y agranda puntos según el patrón de la canción.
            const music = still ? null : readMusic(time);
            const elapsed = flowAt ? Math.min(100, Math.max(0, time - flowAt)) : 0;
            flowAt = time;
            const beatPosition = music && isPulseActive() && Number.isFinite(music.sinceBeat)
                ? music.beats + Math.min(1, music.sinceBeat / music.beatMs)
                : null;
            const advanced = beatPosition !== null && lastBeatPosition !== null ? beatPosition - lastBeatPosition : -1;
            // Un salto (canción nueva, pausa) sigue con el reloj normal en vez de dar un tirón.
            flow += advanced >= 0 && advanced < 1 ? advanced * 0.5 : elapsed / 1000;
            lastBeatPosition = beatPosition;
            const seconds = still ? 0 : flow;
            const offsetX = (seconds * DRIFT_X) % SPACING;
            const offsetY = (seconds * DRIFT_Y) % SPACING;
            const reach2 = REACH * REACH;
            const level = still ? 0 : pointer.level;
            if (isPulseActive() && !visualsRequested) {
                visualsRequested = true;
                void import('../../scripts/music-visuals').then((loaded) => { visuals = loaded; }).catch(() => { visualsRequested = false; });
            }
            const layers = visuals;
            const musicOn = music !== null && layers !== null && (isPulseActive() || music.pulse > 0.01);
            const buckets = Array.from({ length: ALPHA_STEPS }, () => new Path2D());
            // tint: 0 color de acento (golpes y cursor), 1 color de la flor.
            const lit: Array<{ x: number; y: number; radius: number; alpha: number; amount: number; tint: number }> = [];

            for (let y = offsetY - SPACING; y < height + SPACING; y += SPACING) {
                for (let x = offsetX - SPACING; x < width + SPACING; x += SPACING) {
                    const wave = still ? 0.5 : 0.5 + 0.5 * Math.sin((x + y * 0.6) / WAVE_LENGTH - seconds * WAVE_SPEED);
                    let px = x;
                    let py = y;
                    let beatLift = 0;
                    if (musicOn && layers) {
                        const ix = Math.round((x - offsetX) / SPACING);
                        const iy = Math.round((y - offsetY) / SPACING);
                        const from = layers.patternLift(music.previousPattern, music, x, y, ix, iy, wave, center);
                        const to = layers.patternLift(music.pattern, music, x, y, ix, iy, wave, center);
                        beatLift = from + (to - from) * music.patternBlend;
                    }
                    const lift = Math.min(1, beatLift);
                    // La flor y los fuegos artificiales pintan en su color; los demás efectos, en el de acento.
                    const tint = musicOn && TINTED.includes(music.patternBlend > 0.5 ? music.pattern : music.previousPattern) ? 1 : 0;
                    let radius = BASE_RADIUS + wave * 0.35 + lift * 1.8;
                    let alpha = 0.6 + wave * 0.4;
                    alpha += (1 - alpha) * lift;
                    const beatGlow = lift * 0.9;
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
                            if (amount > 0.02 || beatGlow > 0.05) {
                                lit.push({ x: px, y: py, radius, alpha, amount: Math.max(amount, beatGlow), tint: amount > beatGlow ? 0 : tint });
                                continue;
                            }
                        }
                    }
                    if (beatGlow > 0.05) {
                        lit.push({ x: px, y: py, radius, alpha, amount: beatGlow, tint });
                        continue;
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
                ctx.fillStyle = mixRgb(base, dot.tint ? bloomTint : glow, dot.amount);
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
            // Con el cursor encima o con música, a la tasa completa: si no, el latido llegaría a saltos.
            // Tapado por la pantalla de carga no se dibuja: el hilo principal queda para montar la app.
            const covered = coveredBySplash();
            if (!covered && pendingResize) {
                pendingResize = false;
                resize();
            }
            if (!covered && (pointer.level > 0.002 || isPulseActive() || time - lastDraw >= IDLE_FRAME_MS)) {
                paint(time);
                lastDraw = time;
            }
            start();
        };

        // Los colores se leen al primer dibujo y no al montar: getComputedStyle recalcula los estilos
        // de toda la página, y con la app recién montada detrás de la pantalla de carga era caro.
        const paint = (time: number) => {
            if (!colorsRead) {
                readColors();
                colorsRead = true;
            }
            draw(time);
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
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            width = host.clientWidth;
            height = host.clientHeight;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            // Centro de la ruleta en el lienzo: de ahí salen las ondas con música.
            const wheel = host.querySelector('.wheel-container')?.getBoundingClientRect();
            const box = host.getBoundingClientRect();
            center = wheel
                ? { x: wheel.left + wheel.width / 2 - box.left, y: wheel.top + wheel.height / 2 - box.top, radius: wheel.width / 2 }
                : { x: width / 2, y: height / 2, radius: 0 };
            paint(performance.now());
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
                paint(0);
            } else {
                start();
            }
        };

        // La primera notificación del ResizeObserver hace la primera medida y el primer dibujo, en el
        // frame siguiente: fuera de la tarea del primer layout de la app, que ya es la más pesada.
        let resizeFrame = 0;
        const resizeObserver = new ResizeObserver(() => {
            cancelAnimationFrame(resizeFrame);
            // Tapado por la pantalla de carga no se mide: medir fuerza un layout de la app que se está
            // montando detrás. Lo hace el bucle al empezar a abrirse.
            if (coveredBySplash() && !isStill()) {
                pendingResize = true;
                start();
                return;
            }
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
