// Cómo se ve la música en las luces de la ruleta y en el fondo de puntos. Se carga bajo demanda,
// la primera vez que suena una canción: quien no pone música no descarga nada de esto.
import { readMusic, type MusicFrame, type MusicPattern } from './music-pulse';

// Luces del aro que avanza la vuelta en cada golpe: una vuelta de 24 cada dos compases.
const CHASE_STEPS_PER_BEAT = 3;
// Radio de las luces del aro en Wheel.tsx (viewBox de 100).
const RIM_RADIUS = 0.75;

/** Distancia entre dos posiciones de un anillo de n luces, por el camino corto. */
const ringDistance = (a: number, b: number, n: number): number => {
    const d = (((a - b) % n) + n) % n;
    return Math.min(d, n - d);
};

/** Pseudoaleatorio estable por luz y golpe: el mismo golpe enciende siempre las mismas bombillas. */
const hash = (i: number, beat: number): number => {
    const x = Math.sin(i * 12.9898 + beat * 78.233) * 43758.5453;
    return x - Math.floor(x);
};

const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** Brillo (0-1) de la luz i de un anillo de n con un patrón dado, al ritmo de los golpes. */
function patternLevel(pattern: MusicPattern, frame: MusicFrame, i: number, n: number): number {
    const { pulse, beats, sinceBeat, beatMs, sparkle } = frame;
    const progress = Math.min(1, sinceBeat / beatMs);
    switch (pattern) {
        case 'rings':
            // El aro entero late con cada golpe.
            return 0.1 + pulse * 0.9;
        case 'melody':
            return melodyLevel(frame, i, n);
        case 'sparkle': {
            // Destellos: en cada golpe se enciende un tercio al azar y titilan con los agudos.
            const flash = hash(i, beats) < 0.34 ? 1 - progress : 0;
            return Math.max(sparkle * 0.55 * hash(i, beats + 0.5), flash);
        }
        case 'spin':
        default: {
            // La vuelta: dos cabezas opuestas dan la vuelta al aro a compás, con una estela.
            const head = (beats + easeOut(progress)) * CHASE_STEPS_PER_BEAT;
            const distance = Math.min(ringDistance(i, head, n), ringDistance(i, head + n / 2, n));
            return Math.max(0, 1 - distance / 3.5) * (0.4 + pulse * 0.6);
        }
    }
}

/**
 * La melodía sube por los dos lados del aro como un medidor: las notas graves encienden la parte de
 * abajo y las agudas la de arriba, más ancho cuanto más fuerte suena; cada nota nueva da un destello
 * a su altura.
 */
function melodyLevel(frame: MusicFrame, i: number, n: number): number {
    const half = n / 2;
    const at = (height: number) => half - height * half;
    const spot = (height: number, width: number) =>
        Math.max(0, 1 - Math.min(ringDistance(i, at(height), n), ringDistance(i, n - at(height), n)) / width);
    if (frame.sinceNote >= 450) return 0;
    return spot(frame.notePitch, 1.4 + frame.melody * 2) * (1 - frame.sinceNote / 450);
}

/** Un solo efecto a la vez; al cambiar, el anterior se funde con el nuevo. */
export function lightLevel(frame: MusicFrame, i: number, n: number): number {
    const from = patternLevel(frame.previousPattern, frame, i, n);
    const to = patternLevel(frame.pattern, frame, i, n);
    return Math.max(0.08, from + (to - from) * frame.patternBlend);
}

/**
 * Mueve las luces de la ruleta con la música hasta que se llama a la función devuelta: golpes,
 * melodía y un patrón que va cambiando. También escribe --pulse (0-1) en el contenedor para el
 * brillo del aro y el patrón en data-music-pattern. Al parar devuelve las luces a su estado normal.
 */
export function startWheelLights(element: HTMLElement): () => void {
    const rim = Array.from(element.querySelectorAll<SVGElement>('.wheel-light--rim'));
    const hub = Array.from(element.querySelectorAll<SVGElement>('.wheel-light--hub'));
    let frame = 0;
    const tick = (time: number) => {
        const music = readMusic(time);
        element.style.setProperty('--pulse', Math.max(music.pulse, music.melody * 0.5).toFixed(3));
        element.dataset.musicPattern = music.pattern;
        rim.forEach((light, i) => {
            const level = lightLevel(music, i, rim.length);
            light.style.opacity = level.toFixed(3);
            // Encendida también crece un poco: se lee como una bombilla que se enciende.
            light.setAttribute('r', (RIM_RADIUS + level * 0.4).toFixed(3));
        });
        // El centro late con cada golpe y respira con la melodía.
        const hubLevel = Math.max(0.3 + music.pulse * 0.7, music.melody).toFixed(3);
        hub.forEach((light) => {
            light.style.opacity = hubLevel;
        });
        frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
        cancelAnimationFrame(frame);
        element.style.removeProperty('--pulse');
        delete element.dataset.musicPattern;
        [...rim, ...hub].forEach((light) => light.style.removeProperty('opacity'));
        rim.forEach((light) => light.setAttribute('r', String(RIM_RADIUS)));
    };
}

// Fondo de puntos (DotField.tsx)
// Con música: velocidad (px/ms) y grosor de las ondas que salen de la ruleta en cada golpe.
const RING_SPEED = 0.75;
const RING_WIDTH = 70;

/** Pseudoaleatorio estable por punto y golpe: el mismo golpe enciende siempre los mismos puntos. */
const dotHash = (ix: number, iy: number, beat: number): number => {
    const v = Math.sin(ix * 127.1 + iy * 311.7 + beat * 74.7) * 43758.5453;
    return v - Math.floor(v);
};

export type Point = { x: number; y: number };

/**
 * Cuánto enciende cada efecto el punto (x, y):
 * rings: un anillo sale de la ruleta en cada golpe · spin: tres brazos en espiral giran desde la
 * ruleta · sparkle: destellos al azar, más cuantos más agudos · melody: destellos por nota.
 */
export function patternLift(pattern: MusicPattern, music: MusicFrame, x: number, y: number, ix: number, iy: number, wave: number, center: Point, width: number, height: number): number {
    const { pulse, sinceBeat, beatMs, beats, sparkle } = music;
    switch (pattern) {
        case 'melody':
            return melodyLift(music, x, y, wave, height, width);
        case 'rings': {
            const radius = sinceBeat * RING_SPEED;
            const d = Math.hypot(x - center.x, y - center.y);
            const ring = Math.max(0, 1 - Math.abs(d - radius) / RING_WIDTH);
            return ring * Math.max(0, 1 - sinceBeat / (beatMs * 1.6)) + pulse * 0.15;
        }
        case 'sparkle': {
            const chosen = dotHash(ix, iy, beats) < 0.08 + sparkle * 0.3;
            return chosen ? Math.max(0, 1 - sinceBeat / 450) : pulse * 0.1;
        }
        case 'spin':
        default: {
            const dx = x - center.x;
            const dy = y - center.y;
            const d = Math.hypot(dx, dy);
            const turn = ((beats + Math.min(1, sinceBeat / beatMs)) / 3) * Math.PI * 2;
            // Brazos curvados: el ángulo se retuerce con la distancia.
            const arm = 0.5 + 0.5 * Math.cos(3 * (Math.atan2(dy, dx) - turn) + d * 0.012);
            return arm ** 8 * Math.max(0, 1 - d / 900) * (0.55 + pulse * 0.45);
        }
    }
}

/**
 * La melodía: una franja de luz que sube y baja por el panel con la altura de las notas (graves
 * abajo, agudas arriba), más intensa cuanto más fuerte suena; cada nota nueva suelta una onda.
 */
function melodyLift(music: MusicFrame, x: number, y: number, wave: number, height: number, width: number): number {
    // Solo con cada nota nueva y se apaga en ~0,4 s: con el nivel continuo quedaba una franja
    // siempre encendida mientras sonara algo.
    if (music.sinceNote > 700) return 0;
    const bandY = height * (0.85 - music.notePitch * 0.7);
    const band = Math.exp(-(((y - bandY) / 70) ** 2)) * Math.max(0, 1 - music.sinceNote / 420) * (0.55 + 0.45 * wave);
    const noteX = width * (0.15 + 0.7 * dotHash(music.notes, 3, 7));
    const noteY = height * (0.85 - music.notePitch * 0.7);
    const ripple = Math.max(0, 1 - Math.abs(Math.hypot(x - noteX, y - noteY) - music.sinceNote * 0.35) / 26);
    return Math.max(band, ripple * (1 - music.sinceNote / 700));
}
