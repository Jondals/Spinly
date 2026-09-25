// Lo que "hace" la música en cada momento, para que las luces de la ruleta y el fondo de puntos se
// muevan con ella. Sin React. No detecta golpes sueltos: sigue el pulso de la canción.
// - Tiempos: los del análisis previo de la canción entera (beat-analysis.ts, en un worker). Mientras
//   no está listo, o si no se pudo hacer, un seguidor en tiempo real (BeatTracker, dentro del motor de
//   audio, que se carga bajo demanda) predice el siguiente tiempo y sigue marcando en silencios y
//   pasajes sin percusión.
// - Reloj: el del audio (AudioContext), en tiempo de la canción y ya descontada la latencia de salida:
//   cada latido cae cuando se oye el tiempo, no cuando el analizador lo ve.
// - Latido (0-1): sube de golpe en cada tiempo y cae enseguida; el primero de cada compás, más fuerte.
// - Efecto visual: uno solo a la vez, elegido según cómo suena la canción, que cambia cada cuatro
//   compases justo al empezar un compás, con un fundido entre el anterior y el nuevo.
import type { BeatGrid } from './beat-analysis';

export type MusicBands = { bass: number; mid: number; high: number; pitch: number };

/**
 * rings: el aro late entero y salen anillos desde la ruleta · spin: las luces dan la vuelta y una
 * espiral gira en el fondo · sparkle: destellos al azar · bloom: una flor que se abre desde la ruleta ·
 * comets: cometas que orbitan la ruleta, una vuelta por compás · rays: rayos de luz que salen de la
 * ruleta en cada tiempo, con las bombillas alternándose como una marquesina · equalizer: barras de
 * ecualizador que saltan en cada tiempo · fireworks: fuegos artificiales que estallan en cada tiempo ·
 * tunnel: anillos que caen hacia la ruleta como un túnel, a un anillo por tiempo.
 */
export type MusicPattern = 'rings' | 'spin' | 'sparkle' | 'bloom' | 'comets' | 'rays' | 'equalizer' | 'fireworks' | 'tunnel';

/** Tiempos de la canción (s): lo que se oye ahora y lo que mide ahora el analizador (va por delante). */
export interface MusicClock {
    audible: number;
    analysis: number;
}

/** Lo que el motor de audio da a este módulo mientras suena una canción. */
export interface PulseSource {
    /** Energía por bandas (0-1) de lo que mide el analizador. */
    bands(): MusicBands;
    /** null si no suena (en pausa, cargando). */
    clock(): MusicClock | null;
    /**
     * Seguidor en tiempo real: le da lo que mide ahora el analizador (en el instante `analysis` de la
     * canción) y devuelve el último tiempo previsto en o antes de `at` y el periodo (s); null sin enganche.
     */
    live(analysis: number, at: number): { beat: number; period: number } | null;
    /** Rejilla del análisis previo, en cuanto esté lista. */
    grid(): BeatGrid | null;
}

export interface MusicFrame {
    pulse: number;
    /** Tiempos desde que empezó la canción. */
    beats: number;
    /** Milisegundos desde el último tiempo. */
    sinceBeat: number;
    /** Tiempo entre pulsos (ms). */
    beatMs: number;
    /** El último tiempo abre compás. */
    downbeat: boolean;
    /** Intensidad de los medios: voces, acordes, melodía (0-1, en el rango propio de la canción). */
    melody: number;
    /** Brillo de los agudos (0-1, normalizado igual). */
    sparkle: number;
    pattern: MusicPattern;
    previousPattern: MusicPattern;
    /** 0 recién cambiado, 1 ya solo se ve el patrón nuevo. */
    patternBlend: number;
}

const PATTERNS: readonly MusicPattern[] = ['rings', 'spin', 'sparkle', 'bloom', 'comets', 'rays', 'equalizer', 'fireworks', 'tunnel'];
const SILENT: MusicBands = { bass: 0, mid: 0, high: 0, pitch: 0.5 };
const DEFAULT_BEAT_MS = 500;
// El fotograma que se calcula ahora se ve en pantalla en el siguiente refresco (un fotograma después:
// ~16 ms a 60 Hz, ~7 ms a 144 Hz), y cada tiempo se enciende en el fotograma que se ve más cerca de él,
// hasta medio fotograma antes. La duración del fotograma se mide.
const DEFAULT_FRAME_MS = 16.7;
// Caída del latido: un tercio del tiempo, así una canción rápida da golpes secos y una lenta,
// latidos largos. Y fuerza de los tiempos que no abren compás.
const PULSE_DECAY_SHARE = 0.3;
const OFFBEAT_ACCENT = 0.85;
// Primer efecto con algo de canción escuchada; luego cambia cada cuatro compases (16 tiempos), al
// empezar compás; en canciones muy rápidas (cuatro compases en menos de 6 s), cada ocho. Sin pulso
// (aún no enganchado), cada 12 s. El cambio se funde durante un tiempo (entre 300 y 900 ms).
const FIRST_PATTERN_MS = 2200;
// La canción entra con un fundido de 0,8 s (y la anterior tarda ~0,5 s en irse): hasta que suena a
// su volumen real no cuenta para el carácter.
const CHARACTER_FROM_MS = 1000;
const PATTERN_BEATS = 16;
const PATTERN_SHORTEST_MS = 6000;
const PATTERN_UNLOCKED_MS = 12000;
const PATTERN_FADE_MIN_MS = 300;
const PATTERN_FADE_MAX_MS = 900;

/** Rango propio de una banda: el mínimo y el máximo se adaptan a la canción, así 0-1 es "su" silencio y "su" máximo. */
interface Range { low: number; high: number }

let source: PulseSource | null = null;
let character: MusicBands | null = null;
let bassRange: Range | null = null;
let midRange: Range | null = null;
let highRange: Range | null = null;
let presence = 0;
let pulse = 0;
let melody = 0;
let sparkle = 0;
let lastRead = 0;
let frameMs = DEFAULT_FRAME_MS;
let songTime = -1;
let beats = 0;
let beatTime = -Infinity;
let beatAudibleAt = 0;
let beatMs = DEFAULT_BEAT_MS;
let downbeat = false;
let pattern: MusicPattern = 'spin';
let previousPattern: MusicPattern = 'spin';
let startedAt = 0;
let patternAt = 0;
let patternBeat = 0;

function resetSong(): void {
    character = null;
    bassRange = null;
    midRange = null;
    highRange = null;
    presence = 0;
    songTime = -1;
    beats = 0;
    beatTime = -Infinity;
    beatMs = DEFAULT_BEAT_MS;
    downbeat = false;
    pattern = 'spin';
    previousPattern = 'spin';
    startedAt = 0;
    patternAt = 0;
    patternBeat = 0;
}

/** El proveedor de música lo activa con cada canción que empieza a sonar y lo quita al pausar. */
export function setPulseSource(next: PulseSource | null): void {
    source = next;
    resetSong();
}

export function isPulseActive(): boolean {
    return source !== null;
}

// Cuánto encaja cada efecto con cómo suena la canción. Umbrales medidos con el analizador (escala
// en dB, 0-1): los graves casi siempre marcan alto, así que lo que distingue una canción es cuánto
// hay de agudos (platos, brillo) y de medios (voces, acordes). Los anillos, la vuelta y la flor tienen
// además una base alta: son los que mejor quedan con casi todo.
const suitability = ({ mid, high }: MusicBands): Record<MusicPattern, number> => ({
    rings: mid < 0.12 && high < 0.15 ? 3 : 1.4,
    spin: mid > 0.2 ? 2.5 : 1.4,
    sparkle: high > 0.35 ? 3 : 0.3,
    bloom: mid > 0.2 ? 2.2 : 1.2,
    equalizer: mid < 0.2 ? 1.8 : 1.4,
    fireworks: high > 0.3 ? 2.2 : 1,
    tunnel: 1.6,
    comets: mid > 0.2 ? 2 : 1.3,
    rays: high > 0.25 ? 2.2 : 1.2,
});

/** El más adecuado para empezar; después, al azar entre los demás, con más peso los que encajan. */
function nextPattern(current: MusicPattern | null, traits: MusicBands): MusicPattern {
    const scores = suitability(traits);
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

/** Índice del último tiempo de la rejilla en o antes de `time` (-1 si aún no hay ninguno). */
function gridIndex(list: number[], time: number): number {
    let low = 0;
    let high = list.length - 1;
    let found = -1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (list[mid] <= time) {
            found = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return found;
}

/** El tiempo que suena ahora: el de la rejilla si la hay; si no, el que predice el seguidor. */
function currentBeat(at: number, analysis: number, grid: BeatGrid | null): { time: number; period: number; index: number | null; downbeat: boolean | null } | null {
    if (grid && grid.beats.length > 1) {
        const i = gridIndex(grid.beats, at);
        if (i < 0) return null;
        const next = grid.beats[i + 1] ?? grid.beats[i] + (grid.beats[i] - grid.beats[i - 1]);
        return { time: grid.beats[i], period: next - grid.beats[i], index: i + 1, downbeat: (i - grid.downbeat) % 4 === 0 };
    }
    const predicted = source?.live(analysis, at) ?? null;
    return predicted && predicted.beat >= 0 ? { time: predicted.beat, period: predicted.period, index: null, downbeat: null } : null;
}

function update(now: number): void {
    const dt = lastRead ? Math.min(now - lastRead, 100) : 16;
    if (lastRead) frameMs += (Math.min(40, Math.max(4, dt)) - frameMs) * 0.1;
    lastRead = now;
    let clock: MusicClock | null = null;
    let bands = SILENT;
    let grid: BeatGrid | null = null;
    if (source) {
        try {
            clock = source.clock();
            bands = source.bands();
            grid = source.grid();
        } catch {
            // El motor no pudo leer el audio (contexto cerrado, o en desarrollo un motor de antes de una
            // recarga en caliente): las luces se quedan tranquilas en vez de romper la página.
            clock = null;
        }
    }
    if (!clock) {
        const fade = Math.exp(-dt / 120);
        pulse *= fade;
        melody *= fade;
        sparkle *= fade;
        return;
    }
    // La canción ha vuelto a empezar (se repite una sola pista): todo de cero.
    if (clock.audible < songTime - 0.5) resetSong();
    songTime = clock.audible;
    if (!startedAt) startedAt = now;

    // Presencia: cuánto suenan los graves en el rango de la canción. En un pasaje sin percusión el
    // latido sigue a compás, pero más suave.
    bassRange = track(bassRange, bands.bass, dt);
    presence = envelope(presence, within(bassRange, bands.bass), dt, 600);
    midRange = track(midRange, bands.mid, dt);
    highRange = track(highRange, bands.high, dt);
    // Caen en una fracción del tiempo: más rápido cuanto más rápida la canción.
    melody = envelope(melody, within(midRange, bands.mid), dt, beatMs * 0.45);
    sparkle = envelope(sparkle, within(highRange, bands.high), dt, beatMs * 0.32);

    const shown = clock.audible + frameMs / 1000;
    const beat = currentBeat(shown + frameMs / 2000, clock.analysis, grid);
    if (beat && beat.time > beatTime + beat.period * 0.5) {
        beats = beat.index ?? beats + 1;
        downbeat = beat.downbeat ?? beats % 4 === 1;
        beatTime = beat.time;
        beatAudibleAt = now - (shown - beat.time) * 1000;
    }
    if (beat) beatMs = beat.period * 1000;
    const since = beat ? now - beatAudibleAt : Infinity;
    const accent = (downbeat ? 1 : OFFBEAT_ACCENT) * (0.7 + 0.3 * presence);
    // Hasta tener el pulso (los primeros segundos, mientras se analiza la canción), las luces laten
    // con los golpes de graves tal cual: la música se ve desde el primer instante.
    pulse = Number.isFinite(since)
        ? accent * Math.exp(-Math.max(0, since) / (beatMs * PULSE_DECAY_SHARE))
        : envelope(pulse, within(bassRange, bands.bass) ** 2, dt, 140);

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
    const elapsed = now - startedAt;
    const barStart = beat !== null && downbeat && since < 100;
    // El primero, al empezar un compás (o a los 4 s si aún no hay pulso).
    const first = !patternAt && elapsed >= FIRST_PATTERN_MS && (barStart || elapsed >= 4000);
    const held = now - patternAt;
    // Con pulso, al empezar el compás que completa cuatro (u ocho) desde el cambio anterior.
    const barsBeats = beatMs * PATTERN_BEATS < PATTERN_SHORTEST_MS ? PATTERN_BEATS * 2 : PATTERN_BEATS;
    const onBar = barStart && beats - patternBeat >= barsBeats;
    const rotate = patternAt > 0 && (onBar || (!beat && held >= PATTERN_UNLOCKED_MS));
    if ((first || rotate) && character) {
        const next = nextPattern(first ? null : pattern, character);
        previousPattern = first ? next : pattern;
        pattern = next;
        patternAt = now;
        patternBeat = beats;
    }
}

/** Estado actual. Varias lecturas en el mismo frame (mismo instante) devuelven el mismo resultado. */
export function readMusic(now: number = performance.now()): MusicFrame {
    if (now - lastRead >= 1) update(now);
    return {
        pulse,
        beats,
        sinceBeat: beatTime > -Infinity ? Math.max(0, now - beatAudibleAt) : Infinity,
        beatMs,
        downbeat,
        melody,
        sparkle,
        pattern,
        previousPattern,
        patternBlend: patternAt ? Math.min(1, (now - patternAt) / Math.min(PATTERN_FADE_MAX_MS, Math.max(PATTERN_FADE_MIN_MS, beatMs))) : 1,
    };
}

/** Solo el latido (0-1). */
export function readPulse(now: number = performance.now()): number {
    return readMusic(now).pulse;
}
