// Motor de música con Web Audio. Cada canción suena en un <audio> enganchado a un grafo propio:
// una ganancia por canción para los fundidos (entrar, salir y encadenar pistas sin cortes) y un
// volumen general con limitador. Se carga bajo demanda: solo cuando el usuario enciende la música.

export interface MusicEngine {
    /** Empieza una canción (URL blob:), con fundido desde lo que sonara. false si no se puede reproducir. */
    playFile(url: string): Promise<boolean>;
    pause(): void;
    resume(): Promise<boolean>;
    setVolume(volume: number): void;
    /** Se llama cuando la canción actual termina sola (no al pausar ni al cambiar). */
    onEnded(listener: () => void): void;
    dispose(): void;
}

const FADE_IN_S = 0.8;
const FADE_OUT_S = 0.45;

interface Session {
    element: HTMLAudioElement;
    gain: GainNode;
    pauseTimer: number;
}

export function createMusicEngine(): MusicEngine | null {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
    const ctx = new window.AudioContext();
    const master = ctx.createGain();
    // Techo suave: canciones masterizadas muy fuerte no saturan al subir el volumen.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter).connect(ctx.destination);

    let current: Session | null = null;
    let endedListener: (() => void) | null = null;
    let disposed = false;

    const ramp = (gain: GainNode, to: number, seconds: number) => {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
        gain.gain.linearRampToValueAtTime(to, now + seconds);
    };

    const ensureRunning = async (): Promise<boolean> => {
        if (ctx.state !== 'running') {
            try {
                await ctx.resume();
            } catch {
                return false;
            }
        }
        return ctx.state === 'running';
    };

    /** Fundido de salida y, al acabar, fuera del grafo: la siguiente entra a la vez (fundido cruzado). */
    const retire = (session: Session | null) => {
        if (!session) return;
        window.clearTimeout(session.pauseTimer);
        ramp(session.gain, 0.0001, FADE_OUT_S);
        window.setTimeout(() => {
            session.element.pause();
            session.element.removeAttribute('src');
            session.element.load();
            session.gain.disconnect();
        }, FADE_OUT_S * 1000 + 50);
    };

    return {
        async playFile(url) {
            if (disposed) return false;
            const element = new Audio();
            element.preload = 'auto';
            element.src = url;
            const gain = ctx.createGain();
            gain.gain.value = 0.0001;
            gain.connect(master);
            ctx.createMediaElementSource(element).connect(gain);
            const session: Session = { element, gain, pauseTimer: 0 };
            element.addEventListener('ended', () => {
                if (current === session && !disposed) endedListener?.();
            });
            retire(current);
            current = session;
            if (!(await ensureRunning())) return false;
            try {
                await element.play();
            } catch {
                if (current === session) current = null;
                gain.disconnect();
                return false;
            }
            if (current === session) ramp(gain, 1, FADE_IN_S);
            return true;
        },
        pause() {
            const session = current;
            if (!session) return;
            ramp(session.gain, 0.0001, FADE_OUT_S);
            window.clearTimeout(session.pauseTimer);
            session.pauseTimer = window.setTimeout(() => session.element.pause(), FADE_OUT_S * 1000);
        },
        async resume() {
            const session = current;
            if (!session) return false;
            window.clearTimeout(session.pauseTimer);
            if (!(await ensureRunning())) return false;
            try {
                await session.element.play();
            } catch {
                return false;
            }
            ramp(session.gain, 1, FADE_IN_S);
            return true;
        },
        setVolume(volume) {
            // Curva cuadrática: el deslizador se percibe lineal.
            const level = Math.min(Math.max(volume, 0), 1) ** 2;
            master.gain.setTargetAtTime(level, ctx.currentTime, 0.05);
        },
        onEnded(listener) {
            endedListener = listener;
        },
        dispose() {
            disposed = true;
            retire(current);
            current = null;
            window.setTimeout(() => { void ctx.close(); }, FADE_OUT_S * 1000 + 150);
        },
    };
}
