/**
 * Tournament: entry point of tournament mode (loaded on demand from App).
 *
 * It takes over the panel and the wheel area with its own animated background. With no tournament in
 * progress it shows the setup; with one, the live view. The tournament is saved in this browser
 * (localStorage) after every change, so a reload picks it up where it was.
 */
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import '../../css/Tournament.css';
import TournamentSetup, { newEntry, type SetupEntry } from './TournamentSetup';
import TournamentLive from './TournamentLive';
import type { WheelColorField } from '../wheel/Wheel';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { readMusic } from '../../scripts/music-pulse';
import { useMusic } from '../music/MusicProvider';
import { TOURNAMENT_STORAGE_KEY } from '../../scripts/account-data';
import { createTournament, DEFAULT_CONFIG, MAX_PARTICIPANTS, sanitizeTournament, type Tournament as TournamentState } from '../../scripts/tournament';

/** Reads and validates the saved tournament; null if there is none or it is unusable. */
function readTournament(): TournamentState | null {
    try {
        const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
        return raw ? sanitizeTournament(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

/** Saves the tournament, or removes it when null. */
function writeTournament(tournament: TournamentState | null): void {
    try {
        if (tournament) localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(tournament));
        else localStorage.removeItem(TOURNAMENT_STORAGE_KEY);
    } catch {
        // No space or no access: the tournament stays in memory until the tab is closed.
    }
}

// Rising sparks of the background: position, size, color, duration and delay, fixed per spark.
const SPARKS: CSSProperties[] = Array.from({ length: 14 }, (_, i) => ({
    left: `${(i * 53 + 7) % 100}%`,
    width: `${3 + (i % 3)}px`,
    height: `${3 + (i % 3)}px`,
    background: ['#a78bfa', '#f472b6', '#38bdf8', '#fbbf24'][i % 4],
    animationDuration: `${9 + (i % 5) * 2}s`,
    animationDelay: `${-((i * 1.7) % 12)}s`,
}));

// Grid tile of the stage floor (px, before perspective) and how many beats one ring takes to cross the stage.
const FLOOR_TILE = 64;
const RING_BEATS = 2;
// Time constant (ms) of the crossfade between the idle stage and the stage that follows the music:
// about a second from one to the other, so turning music on or off never jumps.
const MIX_MS = 320;
// Tempo the live stage uses before the first beat (120 BPM), and how fast it settles onto the song's beat.
const DEFAULT_BEAT_MS = 500;
const ALIGN_MS = 600;

/** Linear interpolation between a and b. */
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * With music on, the stage plays along: one ring leaves the centre every half ring cycle and travels in
 * time with the beat, the floor moves one tile per beat, the floor glow flashes on every beat, the
 * spotlights brighten with the mids and the sparks with the highs.
 *
 * The idle stage (CSS animations) never stops. The music stage is a second copy of the rings, floor and
 * glow placed by JS each frame, and the two crossfade (`mix`, 0 to 1) when music starts or stops; the
 * spotlights and sparks blend from their resting brightness to the music's in the same way. Only
 * transform and opacity change, so the page is never repainted.
 */
function useMusicBackdrop(ref: RefObject<HTMLDivElement | null>, active: boolean) {
    const target = useRef(active ? 1 : 0);
    target.current = active ? 1 : 0;
    const wake = useRef<() => void>(() => undefined);

    useEffect(() => {
        const root = ref.current;
        if (!root) return undefined;
        const idle = root.querySelector<HTMLElement>('.tour-bg-idle');
        const live = root.querySelector<HTMLElement>('.tour-bg-live');
        const rings = Array.from(root.querySelectorAll<HTMLElement>('.tour-bg-live .tour-bg-rings i'));
        const grid = root.querySelector<HTMLElement>('.tour-bg-live .tour-bg-grid');
        const glow = root.querySelector<HTMLElement>('.tour-bg-live .tour-bg-floor-glow');
        // Layers that exist once and only change brightness: they blend from their CSS opacity.
        const blended = Array.from(root.querySelectorAll<HTMLElement>('.tour-bg-beam, .tour-bg-sparks'));
        let resting: number[] = [];
        let mix = 0;
        let frame = 0;
        let last = 0;
        // Continuous clock of the live stage (beats), its tempo, and its offset from the song's beat count.
        let position = 0;
        let beatMs = DEFAULT_BEAT_MS;
        let offset: number | null = null;

        /** Puts every layer back to its CSS state once the music stage has faded out completely. */
        const reset = () => {
            [idle, live, ...blended, ...rings, grid, glow].forEach((layer) => {
                layer?.style.removeProperty('opacity');
                layer?.style.removeProperty('transform');
            });
        };

        /** Animation frame: eases the crossfade and places the music layers from the current music state. */
        const tick = (time: number) => {
            const dt = last ? Math.min(100, time - last) : 16;
            last = time;
            const goal = target.current;
            mix += (goal - mix) * (1 - Math.exp(-dt / MIX_MS));
            if (Math.abs(goal - mix) < 0.003) mix = goal;
            if (mix === 0 && goal === 0) {
                reset();
                frame = 0;
                last = 0;
                return;
            }
            const music = readMusic(time);
            // The live stage keeps its own continuous clock (in beats). While the song gives a beat, it
            // follows it, easing any phase difference away instead of jumping; when the music stops (the
            // pulse module resets to beat 0) or before the first beat, it keeps going at the last tempo,
            // so fading in and out never snaps the rings or the floor to another place.
            const hasBeat = goal === 1 && Number.isFinite(music.sinceBeat) && music.beatMs > 0;
            if (hasBeat) {
                beatMs = music.beatMs;
                const songPosition = music.beats + Math.min(1, music.sinceBeat / music.beatMs);
                // Locking on, or the song jumped (restart, new track): start from where the stage is now.
                if (offset === null || Math.abs(songPosition + offset - position) > 0.75) offset = position - songPosition;
                // Drift to the nearest whole ring cycle, so rings and floor land exactly on the beats.
                const aligned = Math.round(offset / RING_BEATS) * RING_BEATS;
                offset += (aligned - offset) * (1 - Math.exp(-dt / ALIGN_MS));
                position = songPosition + offset;
            } else {
                offset = null;
                position += dt / beatMs;
            }
            if (idle) idle.style.opacity = (1 - mix).toFixed(3);
            if (live) live.style.opacity = mix.toFixed(3);
            rings.forEach((ring, i) => {
                const phase = (((position / RING_BEATS + i / rings.length) % 1) + 1) % 1;
                ring.style.transform = `translate(-50%, -50%) scale(${(0.15 + phase * 1.7).toFixed(3)})`;
                ring.style.opacity = ((1 - phase) * (0.25 + music.pulse * 0.75)).toFixed(3);
            });
            if (grid) grid.style.transform = `translate3d(0, ${((position % 1) * FLOOR_TILE).toFixed(1)}px, 0)`;
            if (glow) glow.style.opacity = Math.min(1, 0.3 + music.pulse * 0.7).toFixed(3);
            blended.forEach((layer, i) => {
                const level = layer.classList.contains('tour-bg-sparks') ? 0.35 + music.sparkle * 0.65 : 0.35 + music.melody * 0.65;
                layer.style.opacity = lerp(resting[i] ?? 1, Math.min(1, level), mix).toFixed(3);
            });
            frame = requestAnimationFrame(tick);
        };

        wake.current = () => {
            if (frame) return;
            // Resting brightness of the blended layers, read while they still have their CSS opacity.
            if (mix === 0) resting = blended.map((layer) => Number(getComputedStyle(layer).opacity) || 1);
            last = 0;
            frame = requestAnimationFrame(tick);
        };
        if (target.current) wake.current();
        return () => {
            cancelAnimationFrame(frame);
            frame = 0;
            reset();
        };
    }, [ref]);

    // Starting music wakes the loop; stopping it lets the loop fade out by itself.
    useEffect(() => {
        if (active) wake.current();
    }, [active]);
}

interface TournamentProps {
    /** Names of the wheel options, used to fill in the participants of a new tournament. */
    wheelNames: string[];
    onColorChange: (field: WheelColorField, color: string) => void;
}

/** Tournament mode: the setup or the live tournament, over the tournament background. */
function Tournament({ wheelNames, onColorChange }: TournamentProps) {
    const [tournament, setTournament] = useState<TournamentState | null>(readTournament);
    // Going back to the setup keeps the participants and the format of the previous tournament.
    const [setupSeed, setSetupSeed] = useState(() => ({
        config: tournament?.config ?? DEFAULT_CONFIG,
        entries: tournament
            ? [...tournament.participants].sort((x, y) => x.seed - y.seed).map((person, index) => ({ ...newEntry(person.name, index), color: person.color }))
            : wheelNames.slice(0, MAX_PARTICIPANTS).map((name, index) => newEntry(name, index)),
    }));
    const music = useMusic();
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const backdropRef = useRef<HTMLDivElement>(null);
    useMusicBackdrop(backdropRef, music.playing && !reducedMotion);

    useEffect(() => {
        writeTournament(tournament);
    }, [tournament]);

    /** Leaves the live view for the setup, prefilled with the current tournament. */
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
            {/* Tournament background: a stage with two sweeping spotlights, rings leaving the centre, a
                perspective floor grid and rising sparks; with music on, it crossfades into a copy that plays along (useMusicBackdrop). */}
            <div ref={backdropRef} className="tour-bg" aria-hidden="true">
                <span className="tour-bg-beam tour-bg-beam--left" />
                <span className="tour-bg-beam tour-bg-beam--right" />
                {/* The same rings, floor and glow twice: animated by CSS (idle) and in time with the music (live) */}
                {(['idle', 'live'] as const).map((kind) => (
                    <span key={kind} className={`tour-bg-stage tour-bg-${kind}`}>
                        <span className="tour-bg-rings"><i /><i /><i /><i /></span>
                        <span className="tour-bg-floor">
                            <span className="tour-bg-grid" />
                        </span>
                        <span className="tour-bg-floor-glow" />
                    </span>
                ))}
                <span className="tour-bg-sparks">
                    {SPARKS.map((spark, i) => <i key={i} style={spark} />)}
                </span>
            </div>
            <div className="tour-content">
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
        </section>
    );
}

export default Tournament;
