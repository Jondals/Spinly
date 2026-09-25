// Cómo se ve la música en las luces de la ruleta y en el fondo de puntos. Se carga bajo demanda,
// la primera vez que suena una canción: quien no pone música no descarga nada de esto.
import { readMusic, type MusicFrame, type MusicPattern } from './music-pulse';

// Todo se mide en tiempos de la canción, no en milisegundos: cada animación va a su BPM, como un
// visualizador. Con una canción rápida todo va rápido y con una lenta, despacio, siempre a compás.
// La vuelta avanza 3 luces por tiempo: una vuelta de 24 luces cada dos compases.
const CHASE_STEPS_PER_BEAT = 3;
// Cometas: tres, una vuelta completa por compás.
const COMETS = 3;
// Radio de las luces del aro en Wheel.tsx (viewBox de 100).
const RIM_RADIUS = 0.75;
// Pétalos de la flor en el aro y en el fondo.
const BLOOM_RIM_PETALS = 4;
const BLOOM_PETALS = 8;

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
        case 'bloom': {
            // La flor: cuatro pétalos que en cada tiempo nacen como puntos y se abren hasta llenar el
            // aro mientras se apagan; cada tiempo giran medio pétalo, y el que abre compás, más fuerte.
            const open = easeOut(Math.min(1, progress / 0.6));
            const turn = (beats * Math.PI) / BLOOM_RIM_PETALS;
            const petal = 0.5 + 0.5 * Math.cos(BLOOM_RIM_PETALS * ((i / n) * Math.PI * 2 - turn));
            return petal ** (1 + 10 * (1 - open)) * (0.35 + pulse * 0.65);
        }
        case 'comets': {
            // Cometas: tres cabezas dan una vuelta al aro por compás, a velocidad constante, con estela.
            const head = ((beats + progress) / 4) * n;
            let level = 0;
            for (let k = 0; k < COMETS; k++) {
                const behind = (((head + (k * n) / COMETS - i) % n) + n) % n;
                level = Math.max(level, Math.max(0, 1 - behind / 5) ** 1.5);
            }
            return level * (0.45 + pulse * 0.55);
        }
        case 'rays': {
            // Marquesina: en cada tiempo se encienden las bombillas pares o las impares; al abrir
            // compás, todas.
            const on = frame.downbeat || i % 2 === beats % 2;
            return on ? (1 - progress) ** 0.7 * (0.35 + pulse * 0.65) : 0;
        }
        case 'equalizer': {
            // Vúmetro: el aro se llena desde abajo por los dos lados hasta la altura del latido.
            const height = 1 - ringDistance(i, 0, n) / (n / 2);
            const fill = 0.15 + 0.85 * pulse;
            return height <= fill ? 0.35 + 0.65 * pulse * (1 - (fill - height) * 0.5) : 0;
        }
        case 'fireworks': {
            // Dos chispazos por tiempo en sitios al azar del aro, que se abren y se apagan.
            const open = easeOut(progress);
            let level = 0;
            for (let k = 0; k < 2; k++) {
                const at = Math.floor(hash(k + 7, beats) * n);
                level = Math.max(level, Math.max(0, 1 - ringDistance(i, at, n) / (1 + open * 4)));
            }
            return level * (1 - progress);
        }
        case 'tunnel': {
            // Tres ondas de luz que avanzan por el aro un tercio de vuelta por compás.
            const wave = 0.5 + 0.5 * Math.cos(Math.PI * 2 * ((i / n) * 3 - (beats + progress) / 4));
            return wave ** 3 * (0.35 + pulse * 0.65);
        }
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
    const halos = Array.from(element.querySelectorAll<SVGElement>('.wheel-light-halo'));
    // Los iconos del reproductor (barras de ecualizador y disco) también van al tiempo de la canción
    // mientras suena: se buscan en cada frame porque se montan y desmontan al abrir los menús.
    let player: HTMLElement[] = [];
    const syncPlayer = (music: MusicFrame) => {
        const current = Array.from(document.querySelectorAll<HTMLElement>('.spinly-eq span, .spinly-music-disc--spinning'));
        player.forEach((node) => { if (!current.includes(node)) node.style.removeProperty('transform'); });
        player = current;
        const levels = [music.pulse, music.melody, music.sparkle];
        let bar = 0;
        for (const node of player) {
            if (node.classList.contains('spinly-music-disc--spinning')) {
                // Una vuelta por compás.
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
    const tick = (time: number) => {
        const music = readMusic(time);
        element.style.setProperty('--pulse', Math.max(music.pulse, music.melody * 0.5).toFixed(3));
        element.dataset.musicPattern = music.pattern;
        syncPlayer(music);
        rim.forEach((light, i) => {
            const level = lightLevel(music, i, rim.length);
            light.style.opacity = level.toFixed(3);
            // Encendida también crece un poco: se lee como una bombilla que se enciende.
            light.setAttribute('r', (RIM_RADIUS + level * 0.4).toFixed(3));
            // El halo solo se nota con la luz bien encendida: sin él, el aro se vería lavado.
            const halo = halos[i];
            if (halo) halo.style.opacity = (level ** 1.6).toFixed(3);
        });
        // El centro late con cada tiempo y respira con la melodía.
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

// Fondo de puntos (DotField.tsx)
// Con música: distancia que recorre en un tiempo la onda que sale de la ruleta (px) y su grosor.
const RING_REACH = 380;
const RING_WIDTH = 70;
// Largo máximo de los pétalos desde el borde de la ruleta (px) y grosor de su contorno.
const BLOOM_REACH = 330;
const BLOOM_EDGE = 30;
// Cometas: distancia de sus órbitas al borde de la ruleta, grosor y largo de la estela (radianes).
const COMET_ORBITS = [70, 140, 210];
const COMET_WIDTH = 26;
const COMET_TAIL = 1.3;
// Rayos: cuántos, cuánto crecen en un tiempo (px) y su grosor.
const RAYS = 8;
const RAY_REACH = 320;
const RAY_WIDTH = 16;
const TAU = Math.PI * 2;
// Ecualizador circular: barras, largo máximo (px) y grosor.
const EQ_BARS = 32;
const EQ_REACH = 260;
const EQ_WIDTH = 12;
// Fuegos artificiales: por tiempo, radio máximo de cada estallido (px) y grosor de su anillo.
const FIREWORKS = 3;
const FIREWORK_RADIUS = 120;
const FIREWORK_WIDTH = 16;
// Túnel: separación entre anillos (px, un anillo por tiempo), cuántos y grosor.
const TUNNEL_SPACING = 95;
const TUNNEL_RINGS = 5;
const TUNNEL_WIDTH = 18;

/** Pseudoaleatorio estable por punto y golpe: el mismo golpe enciende siempre los mismos puntos. */
const dotHash = (ix: number, iy: number, beat: number): number => {
    const v = Math.sin(ix * 127.1 + iy * 311.7 + beat * 74.7) * 43758.5453;
    return v - Math.floor(v);
};

/** Centro de la ruleta en el fondo y su radio (px). */
export type WheelArea = { x: number; y: number; radius: number };

/**
 * Cuánto enciende cada efecto el punto (x, y):
 * rings: un anillo sale de la ruleta en cada golpe · spin: tres brazos en espiral giran desde la
 * ruleta · sparkle: destellos al azar, más cuantos más agudos · bloom: una flor que se abre desde
 * la ruleta en cada tiempo · comets: cometas en órbita · rays: rayos desde la ruleta · equalizer:
 * ecualizador circular · fireworks: fuegos artificiales · tunnel: anillos que caen hacia la ruleta.
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
            // Brazos curvados: el ángulo se retuerce con la distancia.
            const arm = 0.5 + 0.5 * Math.cos(3 * (Math.atan2(dy, dx) - turn) + d * 0.012);
            return arm ** 8 * Math.max(0, 1 - d / 900) * (0.55 + pulse * 0.45);
        }
    }
}

/**
 * La flor: en cada tiempo se abre desde el borde de la ruleta una roseta de ocho pétalos (el borde
 * brilla y el interior se ilumina suave) que se desvanece al crecer. Cada tiempo gira medio pétalo,
 * así las flores se alternan; la del primer tiempo del compás llega más lejos y trae una segunda
 * capa de pétalos por dentro.
 */
function bloomLift(music: MusicFrame, dx: number, dy: number, base: number, wave: number): number {
    // Cada flor dura exactamente un tiempo: nace con él y se ha ido cuando llega el siguiente.
    const progress = Math.min(1, music.sinceBeat / music.beatMs);
    if (progress >= 1) return music.pulse * 0.1;
    const open = easeOut(progress);
    const d = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) - (music.beats * Math.PI) / BLOOM_PETALS;
    const reach = (music.downbeat ? BLOOM_REACH * 1.35 : BLOOM_REACH) * (0.15 + 0.85 * open);
    const fade = 1 - progress;
    const petals = (length: number, turn: number) => {
        // Cada pétalo: del borde de la ruleta hacia fuera, redondeado en la punta.
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
 * Cometas: tres, cada uno en su órbita alrededor de la ruleta, dan una vuelta por compás (el de en
 * medio en sentido contrario) con una estela que se apaga; brillan más en cada tiempo.
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
        // Cuánto queda el punto por detrás de la cabeza, en el sentido de la marcha.
        const behind = ((((head - angle) * direction) % TAU) + TAU) % TAU;
        if (behind > COMET_TAIL) return;
        lift = Math.max(lift, (1 - behind / COMET_TAIL) ** 1.5 * (1 - (across / COMET_WIDTH) ** 2));
    });
    return lift * (0.6 + 0.4 * music.pulse);
}

/**
 * Rayos: en cada tiempo salen de la ruleta ocho rayos (dieciséis al abrir compás) que crecen y se
 * apagan, más brillantes en la punta; cada tiempo giran medio rayo.
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
 * Ecualizador circular: barras alrededor de la ruleta que en cada tiempo saltan a una altura distinta
 * (más en el primero del compás) y caen hasta el siguiente, con la punta más brillante.
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
 * Fuegos artificiales: en cada tiempo estallan tres alrededor de la ruleta, en sitios al azar; cada
 * uno es un anillo de chispas que se abre y se apaga, con un destello en el centro al empezar.
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
 * Túnel: anillos que nacen lejos y caen hacia la ruleta a un anillo por tiempo, cada vez más
 * brillantes al acercarse; el latido los hace destellar.
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
