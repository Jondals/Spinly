/**
 * DotField: the interactive dot background behind the wheel, drawn on a canvas.
 */
import { useEffect, useRef } from 'react';
import { isPulseActive, readMusic, type MusicPattern } from '../../scripts/music-pulse';

type MusicVisuals = typeof import('../../scripts/music-visuals');

// Grid: spacing and base radius in CSS px.
const SPACING = 28;
const BASE_RADIUS = 1.2;
// Slow drift of the whole grid (px/s) and a brightness wave that crosses it diagonally.
const DRIFT_X = 3;
const DRIFT_Y = 6;
const WAVE_LENGTH = 150;
const WAVE_SPEED = 0.8;
// Reaction to the cursor: reach, how far the dots move away and how much they grow.
const REACH = 140;
const PUSH = 5;
const GROW = 1.3;
// Smoothing times (ms): the focus chases the cursor and fades in or out without jumps.
const FOLLOW_MS = 90;
const FADE_MS = 240;
// Without the cursor over it ~30 fps is enough: the wave is slow and it saves battery.
const IDLE_FRAME_MS = 33;
// Dots far from the cursor are batched by opacity: few fill() calls per frame.
const ALPHA_STEPS = 8;
const MAX_DPR = 2;
// Effects that paint in their own color (pink) instead of the accent color.
const TINTED: readonly MusicPattern[] = ['bloom', 'fireworks'];

type Rgb = readonly [number, number, number];

/** Whether the splash screen (public/index.html) still covers the app (until it starts opening). */
function coveredBySplash(): boolean {
    const splash = document.getElementById('spinly-splash');
    return splash !== null && !splash.classList.contains('spinly-splash--out') && !document.documentElement.classList.contains('spinly-splash-seen');
}

/** Any CSS color to RGB: the canvas normalises it when it is assigned to fillStyle. */
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

/** Mixes two RGB colors and returns a CSS rgb() string. */
const mixRgb = (from: Rgb, to: Rgb, amount: number): string =>
    `rgb(${Math.round(from[0] + (to[0] - from[0]) * amount)}, ${Math.round(from[1] + (to[1] - from[1]) * amount)}, ${Math.round(from[2] + (to[2] - from[2]) * amount)})`;

/**
 * Dot background of the wheel panel, on a canvas: a brightness wave runs across the grid and the dots
 * near the cursor move away, grow and take the accent color. It is drawn behind its container's content
 * (which must be a stacking context) and receives no events. With reduced motion it stays a still grid,
 * without the wave or the reaction.
 */
function DotField() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const host = canvas?.parentElement;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !host || !ctx) return undefined;

        const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        /** Whether reduced motion is on (a still grid). */
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
        // Own clock for the drift and the wave. With music it advances with the song's beats (half a second
        // per beat: at 120 BPM, the same as without music), so the whole background moves at its BPM.
        let flow = 0;
        let flowAt = 0;
        let lastBeatPosition: number | null = null;
        // Music layers: downloaded the first time a song plays.
        let visuals: MusicVisuals | null = null;
        let visualsRequested = false;
        const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, level: 0, inside: false };

        /** Reads the dot colors from the CSS variables. */
        const readColors = () => {
            const style = getComputedStyle(canvas);
            base = toRgb(ctx, style.getPropertyValue('--wheel-dots').trim(), base);
            glow = toRgb(ctx, style.getPropertyValue('--wheel-dots-glow').trim(), glow);
            bloomTint = toRgb(ctx, style.getPropertyValue('--wheel-dots-bloom').trim(), bloomTint);
            baseFill = `rgb(${base.join(', ')})`;
        };

        /** Draws one frame: the grid, the wave, the music effects and the cursor's focus. */
        const draw = (time: number) => {
            ctx.clearRect(0, 0, width, height);
            const still = isStill();
            // With music, every hit lights up and grows dots following the song's pattern.
            const music = still ? null : readMusic(time);
            const elapsed = flowAt ? Math.min(100, Math.max(0, time - flowAt)) : 0;
            flowAt = time;
            const beatPosition = music && isPulseActive() && Number.isFinite(music.sinceBeat)
                ? music.beats + Math.min(1, music.sinceBeat / music.beatMs)
                : null;
            const advanced = beatPosition !== null && lastBeatPosition !== null ? beatPosition - lastBeatPosition : -1;
            // A jump (new song, pause) continues with the normal clock instead of jerking.
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
            // tint: 0 = accent color (hits and cursor), 1 = the bloom color.
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
                    // The bloom and the fireworks paint in their own color; the other effects, in the accent color.
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

        /** Animation loop: eases the pointer focus and paints at full or idle rate. */
        const tick = (time: number) => {
            frame = 0;
            const dt = lastTime ? Math.min(time - lastTime, 100) : 16;
            lastTime = time;
            const follow = 1 - Math.exp(-dt / FOLLOW_MS);
            pointer.x += (pointer.targetX - pointer.x) * follow;
            pointer.y += (pointer.targetY - pointer.y) * follow;
            pointer.level += ((pointer.inside ? 1 : 0) - pointer.level) * (1 - Math.exp(-dt / FADE_MS));
            // With the cursor over it or with music, at the full rate: otherwise the pulse would stutter.
            // While covered by the splash it does not draw: the main thread is left to mount the app.
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

        /**
         * Paints a frame. Colors are read on the first paint rather than on mount: getComputedStyle
         * recalculates the whole page's styles, which was expensive with the app just mounted behind the splash.
         */
        const paint = (time: number) => {
            if (!colorsRead) {
                readColors();
                colorsRead = true;
            }
            draw(time);
        };

        /** Starts the loop (if visible and motion is allowed). */
        const start = () => {
            if (!frame && onScreen && !isStill()) frame = requestAnimationFrame(tick);
        };

        /** Stops the loop. */
        const stop = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            lastTime = 0;
        };

        /**
         * Resizes the canvas to its container. Called by the ResizeObserver, once layout is done: measuring
         * and reading styles here does not force a synchronous recalculation of the freshly mounted page.
         */
        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            width = host.clientWidth;
            height = host.clientHeight;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            // The wheel's centre on the canvas: music waves start from there.
            const wheel = host.querySelector('.wheel-container')?.getBoundingClientRect();
            const box = host.getBoundingClientRect();
            center = wheel
                ? { x: wheel.left + wheel.width / 2 - box.left, y: wheel.top + wheel.height / 2 - box.top, radius: wheel.width / 2 }
                : { x: width / 2, y: height / 2, radius: 0 };
            paint(performance.now());
        };

        /** If the panel scrolls (very short windows), the grid stays with the visible part. */
        const onScroll = () => {
            canvas.style.transform = `translateY(${host.scrollTop}px)`;
        };

        /** Moves the cursor focus. */
        const onPointerMove = (event: PointerEvent) => {
            if (isStill()) return;
            const rect = canvas.getBoundingClientRect();
            pointer.targetX = event.clientX - rect.left;
            pointer.targetY = event.clientY - rect.top;
            // On entering, the focus appears where the cursor is instead of travelling from the last position.
            if (!pointer.inside && pointer.level < 0.05) {
                pointer.x = pointer.targetX;
                pointer.y = pointer.targetY;
            }
            pointer.inside = true;
            start();
        };

        /** Fades the focus out when the pointer leaves. */
        const onPointerLeave = () => {
            pointer.inside = false;
        };

        /** Touch and pen: the focus fades out when the finger is lifted. */
        const onTouchEnd = (event: PointerEvent) => {
            if (event.pointerType !== 'mouse') pointer.inside = false;
        };

        /** Reacts to the reduced-motion preference changing. */
        const onMotionChange = () => {
            if (isStill()) {
                stop();
                paint(0);
            } else {
                start();
            }
        };

        // The first ResizeObserver notification does the first measurement and paint, on the next frame:
        // outside the task of the app's first layout, which is already the heaviest one.
        let resizeFrame = 0;
        const resizeObserver = new ResizeObserver(() => {
            cancelAnimationFrame(resizeFrame);
            // While covered by the splash it does not measure: that would force a layout of the app mounting
            // behind it. The loop does it when the splash starts opening.
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
