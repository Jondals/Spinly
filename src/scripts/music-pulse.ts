// Lo que "hace" la música en cada momento, para que las luces de la ruleta y el fondo de puntos se
// muevan con ella. Sin React: el motor de audio da la energía por bandas y la altura de la melodía,
// y aquí se convierte en:
// - el latido (0-1): sube de golpe con cada golpe de bombo o bajo y cae enseguida, medido contra
//   la media reciente para que funcione igual con una canción tranquila que con una muy fuerte;
// - los golpes y el tiempo entre ellos (el tempo), para mover las luces a compás;
// - la melodía: su intensidad (0-1, normalizada al rango de la propia canción), su altura y cada
//   nota nueva que entra;
// - el efecto visual: uno solo a la vez, elegido según cómo suena la canción, que rota cada pocos
//   compases con un fundido entre el anterior y el nuevo.

export type MusicBands = { bass: number; mid: number; high: number; pitch: number };

/**
 * rings: el aro late entero y salen anillos desde la ruleta · spin: las luces dan la vuelta y una
 * espiral gira en el fondo · sparkle: destellos al azar · melody: luces y destellos que siguen las notas.
 */
export type MusicPattern = 'rings' | 'spin' | 'sparkle' | 'melody';

export interface MusicFrame {
    pulse: number;
    /** Golpes detectados desde que empezó la canción. */
    beats: number;
    /** Milisegundos desde el último golpe. */
    sinceBeat: number;
    /** Tiempo entre golpes estimado (ms). */
    beatMs: number;
    /** Intensidad de la melodía (0-1). */
    melody: number;
    /** Altura de la melodía, suavizada: 0 grave, 1 agudo. */
    pitch: number;
    /** Notas detectadas, milisegundos desde la última y su altura. */
    notes: number;
    sinceNote: number;
    notePitch: number;
    /** Brillo de los agudos (0-1, normalizado como la melodía). */
    sparkle: number;
    pattern: MusicPattern;
    previousPattern: MusicPattern;
    /** 0 recién cambiado, 1 ya solo se ve el patrón nuevo. */
    patternBlend: number;
}

type BandSource = () => MusicBands;

const PATTERNS: readonly MusicPattern[] = ['rings', 'spin', 'sparkle', 'melody'];
const SILENT: MusicBands = { bass: 0, mid: 0, high: 0, pitch: 0.5 };
const MIN_BEAT_GAP_MS = 240;
const MIN_NOTE_GAP_MS = 110;
const DEFAULT_BEAT_MS = 500;
// Primer efecto con algo de canción escuchada; luego cambia cada 16 golpes (cuatro compases), pero
// nunca antes de 7 s ni después de 12 s (por si no hay golpes claros). El cambio se funde en 700 ms.
const FIRST_PATTERN_MS = 2200;
// La canción entra con un fundido de 0,8 s (y la anterior tarda ~0,5 s en irse): hasta que suena a
// su volumen real no cuenta para el carácter.
const CHARACTER_FROM_MS = 1000;
const PATTERN_BEATS = 16;
const PATTERN_MIN_MS = 7000;
const PATTERN_MAX_MS = 12000;
const PATTERN_FADE_MS = 700;

/** Rango propio de una banda: el mínimo y el máximo se adaptan a la canción, así 0-1 es "su" silencio y "su" máximo. */
interface Range { low: number; high: number }

let source: BandSource | null = null;
let average: number | null = null;
let character: MusicBands | null = null;
let midRange: Range | null = null;
let highRange: Range | null = null;
let pulse = 0;
let melody = 0;
let sparkle = 0;
let pitch = 0.5;
let lastRead = 0;
let beats = 0;
let lastBeatAt = 0;
let beatMs = DEFAULT_BEAT_MS;
let armed = true;
let notes = 0;
let lastNoteAt = 0;
let notePitch = 0.5;
let previousMelody = 0;
let pattern: MusicPattern = 'spin';
let previousPattern: MusicPattern = 'spin';
let startedAt = 0;
let patternAt = 0;
let patternBeat = 0;

/** El proveedor de música lo activa con cada canción que empieza a sonar y lo quita al pausar. */
export function setPulseSource(next: BandSource | null): void {
    source = next;
    average = null;
    character = null;
    midRange = null;
    highRange = null;
    beats = 0;
    lastBeatAt = 0;
    beatMs = DEFAULT_BEAT_MS;
    armed = true;
    notes = 0;
    lastNoteAt = 0;
    pattern = 'spin';
    previousPattern = 'spin';
    startedAt = 0;
    patternAt = 0;
    patternBeat = 0;
}

export function isPulseActive(): boolean {
    return source !== null;
}

// Cuánto encaja cada efecto con cómo suena la canción. Umbrales medidos con el analizador (escala
// en dB, 0-1): los graves casi siempre marcan alto, así que lo que distingue una canción es cuánto
// hay de agudos (platos, brillo), de medios (voces, acordes) y cuántas notas entran por segundo.
// Los anillos y la vuelta tienen además una base alta: son los que mejor quedan con casi todo.
const suitability = ({ mid, high }: MusicBands, noteRate: number): Record<MusicPattern, number> => ({
    rings: mid < 0.12 && high < 0.15 ? 3 : 1.4,
    spin: mid > 0.2 ? 2.5 : 1.4,
    sparkle: high > 0.35 ? 3 : 0.3,
    melody: noteRate > 2 && mid > 0.2 ? 2 : 0.4,
});

/** El más adecuado para empezar; después, al azar entre los demás, con más peso los que encajan. */
function nextPattern(current: MusicPattern | null, traits: MusicBands, noteRate: number): MusicPattern {
    const scores = suitability(traits, noteRate);
    if (!current) return PATTERNS.reduce<MusicPattern>((best, p) => (scores[p] > scores[best] ? p : best), 'spin');
    const options = PATTERNS.filter((p) => p !== current);
    let roll = Math.random() * options.reduce((sum, p) => sum + scores[p], 0);
    for (const option of options) {
        roll -= scores[option];
        if (roll <= 0) return option;
    }
    return options[0];
}

/** Lleva el rango de la banda: el máximo sube al instante y baja despacio; el mínimo, al revés. */
const track = (range: Range | null, value: number, dt: number): Range => {
    if (!range) return { low: value, high: value + 0.05 };
    const drift = 1 - Math.exp(-dt / 6000);
    return {
        low: value < range.low ? value : range.low + (value - range.low) * drift,
        high: value > range.high ? value : range.high + (value - range.high) * drift,
    };
};

const within = (range: Range, value: number): number => Math.min(1, Math.max(0, (value - range.low) / Math.max(range.high - range.low, 0.06)));

/** Envolvente: sube casi al instante y baja en `release` ms. */
const envelope = (current: number, target: number, dt: number, release: number): number =>
    target > current ? current + (target - current) * (1 - Math.exp(-dt / 25)) : current + (target - current) * (1 - Math.exp(-dt / release));

function update(now: number): void {
    const dt = lastRead ? Math.min(now - lastRead, 100) : 16;
    lastRead = now;
    if (!source) {
        const fade = Math.exp(-dt / 120);
        pulse *= fade;
        melody *= fade;
        sparkle *= fade;
        return;
    }
    let bands = SILENT;
    try {
        bands = source();
    } catch {
        // El motor no pudo leer el audio (contexto cerrado, o en desarrollo un motor de antes de una
        // recarga en caliente): las luces se quedan tranquilas en vez de romper la página.
    }
    if (!startedAt) startedAt = now;

    // Latido: los graves contra su media de ~1 s.
    const reference = average === null ? bands.bass : average + (bands.bass - average) * (1 - Math.exp(-dt / 900));
    average = reference;
    const onset = Math.max(0, bands.bass - reference * 1.08) / Math.max(reference, 0.04);
    const target = Math.min(1, bands.bass * 0.2 + onset * 2.6);
    // Ataque inmediato y caída de ~140 ms: se lee como un latido y no como un temblor.
    pulse = target > pulse ? target : pulse + (target - pulse) * (1 - Math.exp(-dt / 140));
    if (armed && target > 0.45 && now - lastBeatAt > MIN_BEAT_GAP_MS) {
        if (lastBeatAt) {
            const gap = now - lastBeatAt;
            // El tempo se ajusta poco a poco y descarta huecos absurdos (silencios, golpes perdidos).
            if (gap < 1500) beatMs += (gap - beatMs) * 0.25;
        }
        lastBeatAt = now;
        beats += 1;
        armed = false;
    } else if (target < 0.25) {
        armed = true;
    }

    // Melodía y brillo, en el rango propio de la canción.
    midRange = track(midRange, bands.mid, dt);
    highRange = track(highRange, bands.high, dt);
    melody = envelope(melody, within(midRange, bands.mid), dt, 220);
    sparkle = envelope(sparkle, within(highRange, bands.high), dt, 160);
    pitch += (bands.pitch - pitch) * (1 - Math.exp(-dt / 120));
    // Nota nueva: la melodía da un salto hacia arriba.
    if (melody - previousMelody > 0.12 && melody > 0.45 && now - lastNoteAt > MIN_NOTE_GAP_MS) {
        notes += 1;
        lastNoteAt = now;
        notePitch = bands.pitch;
    }
    previousMelody = melody;

    // Carácter de la canción (medias de ~4 s) y rotación del patrón.
    if (now - startedAt >= CHARACTER_FROM_MS) {
        // Al principio, media de todo lo escuchado; después, de los últimos ~4 s.
        const slow = 1 - Math.exp(-dt / Math.min(4000, Math.max(100, now - startedAt - CHARACTER_FROM_MS)));
        const was = character ?? bands;
        character = {
            bass: was.bass + (bands.bass - was.bass) * slow,
            mid: was.mid + (bands.mid - was.mid) * slow,
            high: was.high + (bands.high - was.high) * slow,
            pitch: was.pitch + (bands.pitch - was.pitch) * slow,
        };
    }
    const first = !patternAt && now - startedAt >= FIRST_PATTERN_MS;
    const held = now - patternAt;
    const rotate = patternAt > 0 && ((beats - patternBeat >= PATTERN_BEATS && held >= PATTERN_MIN_MS) || held >= PATTERN_MAX_MS);
    if ((first || rotate) && character) {
        const noteRate = notes / Math.max(1, (now - startedAt) / 1000);
        const next = nextPattern(first ? null : pattern, character, noteRate);
        previousPattern = first ? next : pattern;
        pattern = next;
        patternAt = now;
        patternBeat = beats;
    }
}

/** Estado actual. Varias lecturas en el mismo frame devuelven el mismo resultado. */
export function readMusic(now: number = performance.now()): MusicFrame {
    if (now - lastRead >= 8) update(now);
    return {
        pulse,
        beats,
        sinceBeat: lastBeatAt ? now - lastBeatAt : Infinity,
        beatMs,
        melody,
        pitch,
        notes,
        sinceNote: lastNoteAt ? now - lastNoteAt : Infinity,
        notePitch,
        sparkle,
        pattern,
        previousPattern,
        patternBlend: patternAt ? Math.min(1, (now - patternAt) / PATTERN_FADE_MS) : 1,
    };
}

/** Solo el latido (0-1). */
export function readPulse(now: number = performance.now()): number {
    return readMusic(now).pulse;
}
