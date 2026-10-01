import { useEffect, useRef, useState, type RefObject } from 'react';
import '../../css/Tournament.css';
import TournamentSetup, { newEntry, type SetupEntry } from './TournamentSetup';
import TournamentLive from './TournamentLive';
import AudioControls from '../music/AudioControls';
import type { WheelColorField } from '../wheel/Wheel';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { MOBILE_QUERY } from '../../scripts/layout';
import { readMusic } from '../../scripts/music-pulse';
import { useMusic } from '../music/MusicProvider';
import { TOURNAMENT_STORAGE_KEY } from '../../scripts/account-data';
import { createTournament, DEFAULT_CONFIG, MAX_PARTICIPANTS, sanitizeTournament, type Tournament as TournamentState } from '../../scripts/tournament';

function readTournament(): TournamentState | null {
    try {
        const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
        return raw ? sanitizeTournament(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

function writeTournament(tournament: TournamentState | null): void {
    try {
        if (tournament) localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(tournament));
        else localStorage.removeItem(TOURNAMENT_STORAGE_KEY);
    } catch {
        // Sin espacio o sin acceso: el torneo sigue en memoria hasta cerrar la pestaña.
    }
}

/**
 * Con música, el fondo late con ella: los puntos (como los del fondo de la ruleta) respiran con el
 * golpe y la aurora se aviva con los medios y los agudos. Solo toca opacity, así que no repinta la
 * página. Sin música, los puntos y la aurora vuelven a su deriva lenta de siempre.
 */
function useMusicBackdrop(ref: RefObject<HTMLDivElement | null>, active: boolean) {
    useEffect(() => {
        const root = ref.current;
        if (!active || !root) return undefined;
        const dots = root.querySelector<HTMLElement>('.spinly-tour-bg-dots');
        const glows = Array.from(root.querySelectorAll<HTMLElement>('.spinly-tour-bg-glow'));
        root.classList.add('spinly-tour-bg--music');
        let frame = 0;
        const tick = (time: number) => {
            const music = readMusic(time);
            const levels = [music.pulse, music.melody, music.sparkle];
            if (dots) dots.style.opacity = Math.min(1, 0.6 + music.pulse * 0.4).toFixed(3);
            glows.forEach((glow, i) => {
                glow.style.opacity = Math.min(1, 0.5 + levels[i] * 0.6).toFixed(3);
            });
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(frame);
            root.classList.remove('spinly-tour-bg--music');
            [dots, ...glows].forEach((layer) => layer?.style.removeProperty('opacity'));
        };
    }, [ref, active]);
}

interface TournamentProps {
    /** Nombres de las opciones de la ruleta: para rellenar los participantes de un torneo nuevo. */
    wheelNames: string[];
    onColorChange: (field: WheelColorField, color: string) => void;
}

/**
 * Modo torneo: ocupa el panel y la zona de la ruleta con su propio fondo animado. Sin torneo en
 * curso muestra la configuración; con uno, el cuadro en vivo. Se guarda en este navegador.
 */
function Tournament({ wheelNames, onColorChange }: TournamentProps) {
    const [tournament, setTournament] = useState<TournamentState | null>(readTournament);
    // Al volver a configurar se conservan los participantes y el formato del torneo anterior.
    const [setupSeed, setSetupSeed] = useState(() => ({
        config: tournament?.config ?? DEFAULT_CONFIG,
        entries: tournament
            ? [...tournament.participants].sort((x, y) => x.seed - y.seed).map((person, index) => ({ ...newEntry(person.name, index), color: person.color }))
            : wheelNames.slice(0, MAX_PARTICIPANTS).map((name, index) => newEntry(name, index)),
    }));
    const isMobile = useMediaQuery(MOBILE_QUERY);
    const music = useMusic();
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const backdropRef = useRef<HTMLDivElement>(null);
    useMusicBackdrop(backdropRef, music.playing && !reducedMotion);

    useEffect(() => {
        writeTournament(tournament);
    }, [tournament]);

    const backToSetup = () => {
        if (tournament) {
            setSetupSeed({
                config: tournament.config,
                entries: [...tournament.participants].sort((x, y) => x.seed - y.seed).map((person, index): SetupEntry => ({ ...newEntry(person.name, index), color: person.color })),
            });
        }
        setTournament(null);
    };

    return (
        <section className="spinly-tournament">
            {/* Fondo propio del torneo: la misma trama de puntos que la ruleta y la aurora de la pantalla
                de carga, mucho más lenta; con música, respiran con ella (useMusicBackdrop). */}
            <div ref={backdropRef} className="spinly-tour-bg" aria-hidden="true">
                <span className="spinly-tour-bg-dots" />
                <span className="spinly-tour-bg-aurora">
                    <span className="spinly-tour-bg-glow spinly-tour-bg-glow--a" />
                    <span className="spinly-tour-bg-glow spinly-tour-bg-glow--b" />
                    <span className="spinly-tour-bg-glow spinly-tour-bg-glow--c" />
                </span>
            </div>
            <div className="spinly-tour-content">
                {tournament ? (
                    <TournamentLive tournament={tournament} onChange={setTournament} onNew={backToSetup} onColorChange={onColorChange} />
                ) : (
                    <TournamentSetup
                        initialConfig={setupSeed.config}
                        initialEntries={setupSeed.entries}
                        wheelNames={wheelNames}
                        onStart={(config, entries) => setTournament(createTournament(config, entries))}
                    />
                )}
            </div>
            {/* Escritorio: música y sonidos en su esquina, como con la ruleta. En móvil van en el menú. */}
            {!isMobile && <AudioControls variant="dock" />}
        </section>
    );
}

export default Tournament;
