// Sonidos sintetizados con Web Audio: sin archivos que descargar.
// El AudioContext se crea en el primer uso, que siempre llega tras un gesto del usuario
// (un clic o pulsar Espacio), como exigen los navegadores.

const SOUND_KEY = 'spinly-sound';
const SOUND_VOLUME_KEY = 'spinly-sound-volume';

let context: AudioContext | null = null;
// Solo se usan si localStorage no está disponible (modo privado estricto).
let memoryEnabled = true;
let memoryVolume = 1;
const listeners = new Set<() => void>();

/** Activado por defecto. Se lee de storage en cada llamada: no hay copia que desincronizar. */
export function isSoundEnabled(): boolean {
    try {
        return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
        return memoryEnabled;
    }
}

export function setSoundEnabled(enabled: boolean): void {
    memoryEnabled = enabled;
    try {
        localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
    } catch {
        // Sin acceso a storage: la preferencia se mantiene en memoria.
    }
    listeners.forEach((listener) => listener());
}

/** Volumen de los efectos, de 0 a 1 (1 por defecto). Apagarlos no lo pierde: se recupera al encender. */
export function getSoundVolume(): number {
    try {
        const raw = localStorage.getItem(SOUND_VOLUME_KEY);
        const volume = Number(raw);
        return raw !== null && Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 1) : 1;
    } catch {
        return memoryVolume;
    }
}

export function setSoundVolume(volume: number): void {
    memoryVolume = Math.min(Math.max(volume, 0), 1);
    try {
        localStorage.setItem(SOUND_VOLUME_KEY, String(Math.round(memoryVolume * 100) / 100));
    } catch {
        // Sin acceso a storage: el volumen se mantiene en memoria.
    }
    listeners.forEach((listener) => listener());
}

export function subscribeSound(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function audio(): AudioContext | null {
    if (!isSoundEnabled()) return null;
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
    if (!context) context = new window.AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
}

function tone(ctx: AudioContext, { frequency, to, start, duration, volume, type }: {
    frequency: number;
    /** Frecuencia final: un barrido corto da el carácter de "pop" o de caída. */
    to?: number;
    start: number;
    duration: number;
    volume: number;
    type: OscillatorType;
}) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    // Curva cuadrática: el deslizador se percibe lineal. Nunca 0: las rampas exponenciales no lo admiten.
    const level = Math.max(volume * getSoundVolume() ** 2, 0.0002);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (to) oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
}

/** Clic de la lengüeta al pasar por la separación entre dos sectores. */
export function playTick(): void {
    const ctx = audio();
    if (!ctx) return;
    const now = ctx.currentTime;
    tone(ctx, { frequency: 1900, start: now, duration: 0.035, volume: 0.12, type: 'triangle' });
    tone(ctx, { frequency: 520, start: now, duration: 0.05, volume: 0.08, type: 'square' });
}

/** Arpegio corto al anunciar el ganador. */
export function playWin(): void {
    const ctx = audio();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => {
        tone(ctx, { frequency, start: now + i * 0.09, duration: 0.45, volume: 0.14, type: 'sine' });
    });
}

/**
 * tap: botón corriente. nav: cambiar de sección o pestaña. confirm: acción principal.
 * remove: borrar o quitar.
 */
export type UiSound = 'tap' | 'nav' | 'confirm' | 'remove';

export function playUi(kind: UiSound): void {
    const ctx = audio();
    if (!ctx) return;
    const now = ctx.currentTime;
    switch (kind) {
        case 'nav':
            tone(ctx, { frequency: 520, to: 820, start: now, duration: 0.09, volume: 0.07, type: 'sine' });
            break;
        case 'confirm':
            tone(ctx, { frequency: 659.25, start: now, duration: 0.12, volume: 0.08, type: 'sine' });
            tone(ctx, { frequency: 987.77, start: now + 0.06, duration: 0.16, volume: 0.08, type: 'sine' });
            break;
        case 'remove':
            tone(ctx, { frequency: 420, to: 210, start: now, duration: 0.12, volume: 0.09, type: 'sine' });
            break;
        case 'tap':
        default:
            tone(ctx, { frequency: 760, to: 440, start: now, duration: 0.06, volume: 0.09, type: 'sine' });
            tone(ctx, { frequency: 2600, start: now, duration: 0.012, volume: 0.015, type: 'triangle' });
            break;
    }
}
