/**
 * How music looks on the wheel lights and on the dot background. It loads on demand, the first time a
 * song plays: visitors who never play music never download any of this.
 */
import { readMusic, type MusicFrame, type MusicPattern } from './music-pulse';

// Everything is measured in song beats, not milliseconds: every animation runs at the song's BPM, like a
// visualizer. A fast song makes everything fast and a slow one slow, always in time.
// The chase moves 3 lights per beat: one lap of 24 lights every two bars.
const CHASE_STEPS_PER_BEAT = 3;
// Comets: three, one full lap per bar.
const COMETS = 3;
// Radius of the rim lights in Wheel.tsx (viewBox of 100).
const RIM_RADIUS = 0.75;
// Bloom petals on the rim and on the background.
const BLOOM_RIM_PETALS = 4;
const BLOOM_PETALS = 8;

/** Distance between two positions on a ring of n lights, the short way round. */
const ringDistance = (a: number, b: number, n: number): number => {
    const d = (((a - b) % n) + n) % n;
    return Math.min(d, n - d);
};

/** Stable pseudo-random per light and beat: the same beat always lights the same bulbs. */
const hash = (i: number, beat: number): number => {
    const x = Math.sin(i * 12.9898 + beat * 78.233) * 43758.5453;
    return x - Math.floor(x);
};

/** Cubic ease-out. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** Brightness (0-1) of light i on a ring of n for a given pattern, in time with the beats. */
function patternLevel(pattern: MusicPattern, frame: MusicFrame, i: number, n: number): number {
    const { pulse, beats, sinceBeat, beatMs, sparkle } = frame;
    const progress = Math.min(1, sinceBeat / beatMs);
    switch (pattern) {
        case 'rings':
            // The whole rim pulses with every beat.
            return 0.1 + pulse * 0.9;
        case 'bloom': {
            // The bloom: four petals born as points on every beat that open to fill the rim as they fade; each
            // beat they turn half a petal, and the first beat of the bar is stronger.
            const open = easeOut(Math.min(1, progress / 0.6));
            const turn = (beats * Math.PI) / BLOOM_RIM_PETALS;
            const petal = 0.5 + 0.5 * Math.cos(BLOOM_RIM_PETALS * ((i / n) * Math.PI * 2 - turn));
            return petal ** (1 + 10 * (1 - open)) * (0.35 + pulse * 0.65);
        }
        case 'comets': {
            // Comets: three heads go round the rim once per bar, at a constant speed, with a tail.
            const head = ((beats + progress) / 4) * n;
            let level = 0;
            for (let k = 0; k < COMETS; k++) {
                const behind = (((head + (k * n) / COMETS - i) % n) + n) % n;
                level = Math.max(level, Math.max(0, 1 - behind / 5) ** 1.5);
            }
            return level * (0.45 + pulse * 0.55);
        }
        case 'rays': {
            // Marquee: on each beat either the even or the odd bulbs light up; on the first beat of a bar, all of them.
            const on = frame.downbeat || i % 2 === beats % 2;
            return on ? (1 - progress) ** 0.7 * (0.35 + pulse * 0.65) : 0;
        }
        case 'equalizer': {
            // VU meter: the rim fills from the bottom up both sides to the height of the pulse.
            const height = 1 - ringDistance(i, 0, n) / (n / 2);
            const fill = 0.15 + 0.85 * pulse;
            return height <= fill ? 0.35 + 0.65 * pulse * (1 - (fill - height) * 0.5) : 0;
        }
        case 'fireworks': {
            // Two sparks per beat at random spots of the rim, which open and fade.
            const open = easeOut(progress);
            let level = 0;
            for (let k = 0; k < 2; k++) {
                const at = Math.floor(hash(k + 7, beats) * n);
                level = Math.max(level, Math.max(0, 1 - ringDistance(i, at, n) / (1 + open * 4)));
            }
            return level * (1 - progress);
        }
        case 'tunnel': {
            // Three light waves moving along the rim a third of a lap per bar.
            const wave = 0.5 + 0.5 * Math.cos(Math.PI * 2 * ((i / n) * 3 - (beats + progress) / 4));
            return wave ** 3 * (0.35 + pulse * 0.65);
        }
        case 'sparkle': {
            // Sparkles: on every beat a random third lights up, and they twinkle with the highs.
            const flash = hash(i, beats) < 0.34 ? 1 - progress : 0;
            return Math.max(sparkle * 0.55 * hash(i, beats + 0.5), flash);
        }
        case 'spin':
        default: {
            // The chase: two opposite heads go round the rim in time, with a tail.
            const head = (beats + easeOut(progress)) * CHASE_STEPS_PER_BEAT;
            const distance = Math.min(ringDistance(i, head, n), ringDistance(i, head + n / 2, n));
            return Math.max(0, 1 - distance / 3.5) * (0.4 + pulse * 0.6);
        }
    }
}

/** Brightness of a rim light: one effect at a time; when it changes, the old one crossfades into the new one. */
export function lightLevel(frame: MusicFrame, i: number, n: number): number {
    const from = patternLevel(frame.previousPattern, frame, i, n);
    const to = patternLevel(frame.pattern, frame, i, n);
    return Math.max(0.08, from + (to - from) * frame.patternBlend);
}

/**
 * Drives a wheel's lights with the music until the returned function is called: beats, melody and a
 * changing pattern. It also writes --pulse (0-1) on the container for the rim glow and the pattern in
 * data-music-pattern. When stopped, it puts the lights back to normal.
 */
export function startWheelLights(element: HTMLElement): () => void {
    const rim = Array.from(element.querySelectorAll<SVGElement>('.wheel-light--rim'));
    const hub = Array.from(element.querySelectorAll<SVGElement>('.wheel-light--hub'));
    const halos = Array.from(element.querySelectorAll<SVGElement>('.wheel-light-halo'));
    // The player icons (equalizer bars and disc) also move in time with the song while it plays: they are
    // looked up every frame because they mount and unmount as menus open.
    let player: HTMLElement[] = [];
    /** Moves the player's equalizer bars and disc with the music. */
    const syncPlayer = (music: MusicFrame) => {
        const current = Array.from(document.querySelectorAll<HTMLElement>('.spinly-eq span, .spinly-music-disc--spinning'));
        player.forEach((node) => { if (!current.includes(node)) node.style.removeProperty('transform'); });
        player = current;
        const levels = [music.pulse, music.melody, music.sparkle];
        let bar = 0;
        for (const node of player) {
            if (node.classList.contains('spinly-music-disc--spinning')) {
                // One turn per bar.
                const turn = ((music.beats + Math.min(1, music.sinceBeat / music.beatMs)) / 4) * 360;
                node.style.transform = `rotate(${(turn % 360).toFixed(1)}deg)`;
            } else {
                node.style.transform = `scaleY(${(0.25 + 0.75 * levels[bar % 3]).toFixed(3)})`;
                bar += 1;
            }
        }
    };
    document.documentElement.classList.add('spinly-music-synced');
    let frame = 0;
    /** Animation frame: updates every light from the current music state. */
    const tick = (time: number) => {
        const music = readMusic(time);
        element.style.setProperty('--pulse', Math.max(music.pulse, music.melody * 0.5).toFixed(3));
        element.dataset.musicPattern = music.pattern;
        syncPlayer(music);
        rim.forEach((light, i) => {
            const level = lightLevel(music, i, rim.length);
            light.style.opacity = level.toFixed(3);
            // When lit it also grows a little: it reads as a bulb turning on.
            light.setAttribute('r', (RIM_RADIUS + level * 0.4).toFixed(3));
            // The halo only shows when the light is well lit: otherwise the rim would look washed out.
            const halo = halos[i];
            if (halo) halo.style.opacity = (level ** 1.6).toFixed(3);
        });
        // The hub pulses with every beat and breathes with the melody.
        const hubLevel = Math.max(0.3 + music.pulse * 0.7, music.melody).toFixed(3);
        hub.forEach((light) => {
            light.style.opacity = hubLevel;
        });
        frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
        cancelAnimationFrame(frame);
        player.forEach((node) => node.style.removeProperty('transform'));
        document.documentElement.classList.remove('spinly-music-synced');
        element.style.removeProperty('--pulse');
        delete element.dataset.musicPattern;
        [...rim, ...hub, ...halos].forEach((light) => light.style.removeProperty('opacity'));
        rim.forEach((light) => light.setAttribute('r', String(RIM_RADIUS)));
    };
}

// Dot background (DotField.tsx)
// With music: how far the wave leaving the wheel travels in one beat (px), and its thickness.
const RING_REACH = 380;
const RING_WIDTH = 70;
// Maximum petal length from the wheel's edge (px) and the thickness of their outline.
const BLOOM_REACH = 330;
const BLOOM_EDGE = 30;
// Comets: distance of their orbits from the wheel's edge, thickness and tail length (radians).
const COMET_ORBITS = [70, 140, 210];
const COMET_WIDTH = 26;
const COMET_TAIL = 1.3;
// Rays: how many, how much they grow in one beat (px) and their thickness.
const RAYS = 8;
const RAY_REACH = 320;
const RAY_WIDTH = 16;
const TAU = Math.PI * 2;
// Circular equalizer: bars, maximum length (px) and thickness.
const EQ_BARS = 32;
const EQ_REACH = 260;
const EQ_WIDTH = 12;
// Fireworks: per beat, maximum radius of each burst (px) and the thickness of its ring.
const FIREWORKS = 3;
const FIREWORK_RADIUS = 120;
const FIREWORK_WIDTH = 16;
// Tunnel: spacing between rings (px, one ring per beat), how many and their thickness.
const TUNNEL_SPACING = 95;
const TUNNEL_RINGS = 5;
const TUNNEL_WIDTH = 18;

/** Stable pseudo-random per dot and beat: the same beat always lights the same dots. */
const dotHash = (ix: number, iy: number, beat: number): number => {
    const v = Math.sin(ix * 127.1 + iy * 311.7 + beat * 74.7) * 43758.5453;
    return v - Math.floor(v);
};

/** The wheel's centre on the background and its radius (px). */
export type WheelArea = { x: number; y: number; radius: number };

/**
 * How much each effect lights up the dot at (x, y):
 * rings: a ring leaves the wheel on every beat · spin: three spiral arms turn around the wheel · sparkle:
 * random sparkles, more with more highs · bloom: a flower opening from the wheel on every beat · comets:
 * orbiting comets · rays: rays from the wheel · equalizer: circular equalizer · fireworks: fireworks ·
 * tunnel: rings falling into the wheel.
 */
export function patternLift(pattern: MusicPattern, music: MusicFrame, x: number, y: number, ix: number, iy: number, wave: number, center: WheelArea): number {
    const { pulse, sinceBeat, beatMs, beats, sparkle } = music;
    switch (pattern) {
        case 'bloom':
            return bloomLift(music, x - center.x, y - center.y, center.radius, wave);
        case 'equalizer':
            return equalizerLift(music, x - center.x, y - center.y, center.radius);
        case 'fireworks':
            return fireworksLift(music, x - center.x, y - center.y, center.radius);
        case 'tunnel':
            return tunnelLift(music, x - center.x, y - center.y, center.radius);
        case 'comets':
            return cometLift(music, x - center.x, y - center.y, center.radius);
        case 'rays':
            return rayLift(music, x - center.x, y - center.y, center.radius);
        case 'rings': {
            const radius = (sinceBeat / beatMs) * RING_REACH;
            const d = Math.hypot(x - center.x, y - center.y);
            const ring = Math.max(0, 1 - Math.abs(d - radius) / RING_WIDTH);
            return ring * Math.max(0, 1 - sinceBeat / (beatMs * 1.6)) + pulse * 0.15;
        }
        case 'sparkle': {
            const chosen = dotHash(ix, iy, beats) < 0.08 + sparkle * 0.3;
            return chosen ? Math.max(0, 1 - sinceBeat / (beatMs * 0.9)) : pulse * 0.1;
        }
        case 'spin':
        default: {
            const dx = x - center.x;
            const dy = y - center.y;
            const d = Math.hypot(dx, dy);
            const turn = ((beats + Math.min(1, sinceBeat / beatMs)) / 3) * Math.PI * 2;
            // Curved arms: the angle twists with distance.
            const arm = 0.5 + 0.5 * Math.cos(3 * (Math.atan2(dy, dx) - turn) + d * 0.012);
            return arm ** 8 * Math.max(0, 1 - d / 900) * (0.55 + pulse * 0.45);
        }
    }
}

/**
 * The bloom: on every beat an eight-petal rosette opens from the wheel's edge (its outline glows and its
 * inside lights up softly) and fades as it grows. Each beat it turns half a petal, so the flowers alternate;
 * the one on the first beat of the bar reaches further and brings a second inner layer of petals.
 */
function bloomLift(music: MusicFrame, dx: number, dy: number, base: number, wave: number): number {
    // Each flower lasts exactly one beat: it is born with it and gone when the next one arrives.
    const progress = Math.min(1, music.sinceBeat / music.beatMs);
    if (progress >= 1) return music.pulse * 0.1;
    const open = easeOut(progress);
    const d = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) - (music.beats * Math.PI) / BLOOM_PETALS;
    const reach = (music.downbeat ? BLOOM_REACH * 1.35 : BLOOM_REACH) * (0.15 + 0.85 * open);
    const fade = 1 - progress;
    /** Lift of a layer of petals of a given length and rotation. */
    const petals = (length: number, turn: number) => {
        // Each petal: from the wheel's edge outwards, rounded at the tip.
        const shape = Math.abs(Math.cos((BLOOM_PETALS / 2) * (angle + turn)));
        const edge = base * 0.9 + length * shape ** 0.6;
        const rim = Math.max(0, 1 - Math.abs(d - edge) / BLOOM_EDGE);
        const inside = d < edge && d > base * 0.9 ? 0.5 * (d - base * 0.9) / Math.max(edge - base * 0.9, 1) : 0;
        return Math.max(rim, inside);
    };
    const outer = petals(reach, 0);
    const inner = music.downbeat ? petals(reach * 0.55, Math.PI / BLOOM_PETALS) * 0.85 : 0;
    return Math.max(outer, inner) * fade * (0.8 + 0.2 * wave);
}

/**
 * Comets: three, each on its own orbit around the wheel, go round once per bar (the middle one the other
 * way) with a fading tail; they shine brighter on every beat.
 */
function cometLift(music: MusicFrame, dx: number, dy: number, base: number): number {
    const d = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const turn = ((music.beats + Math.min(1, music.sinceBeat / music.beatMs)) / 4) * TAU;
    let lift = 0;
    COMET_ORBITS.forEach((offset, k) => {
        const across = Math.abs(d - (base + offset));
        if (across > COMET_WIDTH) return;
        const direction = k % 2 ? -1 : 1;
        const head = direction * turn + (k * TAU) / COMET_ORBITS.length;
        // How far the dot is behind the head, in the direction of travel.
        const behind = ((((head - angle) * direction) % TAU) + TAU) % TAU;
        if (behind > COMET_TAIL) return;
        lift = Math.max(lift, (1 - behind / COMET_TAIL) ** 1.5 * (1 - (across / COMET_WIDTH) ** 2));
    });
    return lift * (0.6 + 0.4 * music.pulse);
}

/**
 * Rays: on every beat eight rays (sixteen on the first beat of a bar) leave the wheel, growing and fading,
 * brighter at the tip; each beat they turn half a ray.
 */
function rayLift(music: MusicFrame, dx: number, dy: number, base: number): number {
    const progress = Math.min(1, music.sinceBeat / music.beatMs);
    if (progress >= 1) return music.pulse * 0.1;
    const d = Math.hypot(dx, dy) - base;
    const length = RAY_REACH * easeOut(progress);
    if (d < 0 || d > length) return 0;
    const count = music.downbeat ? RAYS * 2 : RAYS;
    const step = TAU / count;
    const angle = Math.atan2(dy, dx) - (music.beats % 2) * (step / 2);
    const offAxis = Math.abs(angle - Math.round(angle / step) * step) * (d + base);
    if (offAxis > RAY_WIDTH) return 0;
    return (1 - progress) ** 0.6 * (0.35 + 0.65 * (d / Math.max(length, 1))) * (1 - offAxis / RAY_WIDTH);
}

/**
 * Circular equalizer: bars around the wheel that jump to a different height on every beat (higher on the
 * first beat of the bar) and fall until the next one, with a brighter tip.
 */
function equalizerLift(music: MusicFrame, dx: number, dy: number, base: number): number {
    const progress = Math.min(1, music.sinceBeat / music.beatMs);
    const d = Math.hypot(dx, dy) - base;
    if (d < 0) return 0;
    const step = TAU / EQ_BARS;
    const angle = Math.atan2(dy, dx);
    const bar = Math.round(angle / step);
    const offAxis = Math.abs(angle - bar * step) * (d + base);
    if (offAxis > EQ_WIDTH) return 0;
    const peak = (0.25 + 0.75 * dotHash(bar, 5, music.beats)) * (music.downbeat ? 1 : 0.8);
    const length = EQ_REACH * peak * (1 - 0.7 * progress);
    if (d > length) return 0;
    return (0.35 + 0.65 * (d / Math.max(length, 1))) * (1 - offAxis / EQ_WIDTH);
}

/**
 * Fireworks: on every beat three burst around the wheel at random spots; each one is a ring of sparks that
 * opens and fades, with a flash at its centre at first.
 */
function fireworksLift(music: MusicFrame, dx: number, dy: number, base: number): number {
    const progress = Math.min(1, music.sinceBeat / music.beatMs);
    if (progress >= 1) return 0;
    const radius = FIREWORK_RADIUS * easeOut(progress) * (music.downbeat ? 1.25 : 1);
    let lift = 0;
    for (let k = 0; k < FIREWORKS; k++) {
        const angle = dotHash(k, 11, music.beats) * TAU;
        const distance = base + 90 + dotHash(k, 13, music.beats) * 220;
        const d = Math.hypot(dx - Math.cos(angle) * distance, dy - Math.sin(angle) * distance);
        const ring = Math.max(0, 1 - Math.abs(d - radius) / FIREWORK_WIDTH);
        const flash = progress < 0.2 ? Math.max(0, 1 - d / 40) * (1 - progress / 0.2) : 0;
        lift = Math.max(lift, ring, flash);
    }
    return lift * (1 - progress);
}

/**
 * Tunnel: rings born far away fall into the wheel at one ring per beat, brighter as they get closer; the
 * pulse makes them flash.
 */
function tunnelLift(music: MusicFrame, dx: number, dy: number, base: number): number {
    const phase = Math.min(1, music.sinceBeat / music.beatMs);
    const d = Math.hypot(dx, dy) - base;
    if (d < 0) return 0;
    let lift = 0;
    for (let k = 0; k < TUNNEL_RINGS; k++) {
        const radius = (k + 1 - phase) * TUNNEL_SPACING;
        const ring = Math.max(0, 1 - Math.abs(d - radius) / TUNNEL_WIDTH);
        lift = Math.max(lift, ring * (0.4 + 0.6 * (1 - radius / (TUNNEL_RINGS * TUNNEL_SPACING))));
    }
    return lift * (0.55 + 0.45 * music.pulse);
}
