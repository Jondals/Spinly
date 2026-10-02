/**
 * Tests of the tournament logic (scripts/tournament.ts): seeding, byes, best-of duels, third place,
 * referee decisions, stats, odds, the duel wheel's landing sector, restart and sanitizing.
 */
import {
    addEvent,
    buildBracket,
    createTournament,
    DEFAULT_CONFIG,
    probabilityA,
    restartTournament,
    sanitizeTournament,
    seedOrder,
    spinDuel,
    tournamentStats,
    undoLast,
    type Side,
    type Tournament,
    type TournamentConfig,
} from './tournament';

/** n participants named P1, P2… */
const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, color: 'pink' as const }));
/** A tournament with n participants in list order. */
const make = (n: number, config: Partial<TournamentConfig> = {}): Tournament => createTournament({ ...DEFAULT_CONFIG, seeding: 'order', ...config }, names(n));
/** Name of a participant by id. */
const nameOf = (t: Tournament, id: string | null) => t.participants.find((p) => p.id === id)?.name ?? null;

/** Plays the current duel, giving each spin to the given side, in order. */
function play(t: Tournament, sides: Side[]): Tournament {
    let next = t;
    for (const side of sides) {
        const current = buildBracket(next).current;
        if (!current) break;
        next = addEvent(next, { match: current.id, winner: side, ms: 4200 });
    }
    return next;
}

describe('knockout tournament', () => {
    it('classic seeding: seeds 1 and 2 can only meet in the final', () => {
        expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
        expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    });

    it('with 5 participants: an 8-slot bracket, with byes for the top seeds', () => {
        const t = make(5);
        const bracket = buildBracket(t);
        expect(bracket.rounds.map((round) => round.length)).toEqual([4, 2, 1]);
        const byes = bracket.rounds[0].filter((match) => match.bye).map((match) => nameOf(t, match.winner));
        expect(byes.sort()).toEqual(['P1', 'P2', 'P3']);
        // The only first-round duel: 4 against 5. Then the semifinals and the final.
        expect(bracket.playable).toBe(4);
        expect(nameOf(t, bracket.current?.a ?? null)).toBe('P4');
        expect(nameOf(t, bracket.current?.b ?? null)).toBe('P5');
        // The byes are already waiting in the semifinals.
        expect(nameOf(t, bracket.rounds[1][0].a)).toBe('P1');
    });

    it('best of 3 is won by whoever reaches 2 and moves on; the final is best of 5', () => {
        let t = make(4, { bestOf: 3, finalBestOf: 5 });
        t = play(t, ['a', 'b']);
        let bracket = buildBracket(t);
        expect(bracket.current?.id).toBe('r0m0');
        expect([bracket.current?.winsA, bracket.current?.winsB]).toEqual([1, 1]);
        t = play(t, ['a']);
        bracket = buildBracket(t);
        expect(nameOf(t, bracket.rounds[0][0].winner)).toBe('P1');
        expect(nameOf(t, bracket.rounds[1][0].a)).toBe('P1');
        expect(bracket.current?.id).toBe('r0m1');
        t = play(t, ['b', 'b']);
        bracket = buildBracket(t);
        expect(bracket.current?.id).toBe('r1m0');
        expect(bracket.current?.bestOf).toBe(5);
        t = play(t, ['a', 'a', 'b', 'a']);
        bracket = buildBracket(t);
        expect(nameOf(t, bracket.champion)).toBe('P1');
        expect(bracket.current).toBeNull();
        expect(bracket.decided).toBe(bracket.playable);
    });

    it('the third-place match pits the semifinal losers against each other before the final', () => {
        let t = make(4, { bestOf: 1, finalBestOf: 1, thirdPlace: true });
        t = play(t, ['a', 'b']);
        const bracket = buildBracket(t);
        expect(bracket.current?.id).toBe('third');
        expect([nameOf(t, bracket.third?.a ?? null), nameOf(t, bracket.third?.b ?? null)]).toEqual(['P4', 'P2']);
        t = play(t, ['b']);
        expect(buildBracket(t).current?.id).toBe('r1m0');
        expect(nameOf(t, buildBracket(t).third?.winner ?? null)).toBe('P2');
    });

    it('the referee awards a duel without spinning; undo reverts it', () => {
        let t = make(4);
        const first = buildBracket(t).current;
        t = addEvent(t, { match: first?.id ?? '', winner: 'b', ms: 0, forced: true });
        let bracket = buildBracket(t);
        expect(bracket.rounds[0][0].forced).toBe(true);
        expect(nameOf(t, bracket.rounds[0][0].winner)).toBe('P4');
        t = undoLast(t);
        bracket = buildBracket(t);
        expect(bracket.rounds[0][0].winner).toBeNull();
    });

    it('stats count spins, average duration and comebacks', () => {
        let t = make(4, { bestOf: 3 });
        t = play(t, ['b', 'a', 'a']); // P1 comes back
        t = play(t, ['a', 'a']);
        const stats = tournamentStats(t, buildBracket(t));
        expect(stats.spins).toBe(5);
        expect(stats.averageMs).toBe(4200);
        expect(stats.comebackRate).toBe(0.5);
    });

    it('seed odds favour the better seed; even odds are 50%', () => {
        const even = make(4);
        expect(probabilityA(even, buildBracket(even).current!)).toBe(0.5);
        const seeded = make(4, { odds: 'seed' });
        // 1 against 4: strengths 4 and 1.
        expect(probabilityA(seeded, buildBracket(seeded).current!)).toBeCloseTo(0.8);
    });

    it('the pointer always lands inside the winner\'s sector', () => {
        let seed = 7;
        /** Deterministic pseudo-random numbers in [0, 1). */
        const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (const probability of [0.5, 0.8, 0.2]) {
            let rotation = 0;
            for (let i = 0; i < 200; i++) {
                const result = spinDuel(probability, rotation, random);
                expect(result.rotation).toBeGreaterThan(rotation + 5 * 360 - 1);
                // Angle of the disc under the pointer (at the top). A is the sector that ends at the top.
                const under = (((360 - result.rotation) % 360) + 360) % 360;
                const inA = under >= 360 * (1 - probability);
                expect(inA).toBe(result.winner === 'a');
                rotation = result.rotation;
            }
        }
    });

    it('restart goes back to the start with the same participants', () => {
        let t = make(4);
        t = play(t, ['a', 'a']);
        const again = restartTournament(t, () => 0.3);
        expect(again.events).toEqual([]);
        expect(again.participants.map((p) => p.name).sort()).toEqual(['P1', 'P2', 'P3', 'P4']);
    });

    it('saved data is validated: garbage out, impossible spins ignored', () => {
        expect(sanitizeTournament(null)).toBeNull();
        expect(sanitizeTournament({ version: 1, participants: [{ id: 'x', name: 'Solo', seed: 1 }], events: [] })).toBeNull();
        const t = play(make(3), ['a', 'a']);
        const stored = JSON.parse(JSON.stringify({
            ...t,
            config: { ...t.config, bestOf: 11, finalBestOf: 2.5, odds: 'hack' },
            participants: [...t.participants, { id: 'bad', name: '', seed: 9 }, 'nada'],
            events: [...t.events, { match: 'r9m9', winner: 'a' }, { match: 'r0m0', winner: 'z' }],
        }));
        const clean = sanitizeTournament(stored);
        expect(clean).not.toBeNull();
        expect(clean?.participants).toHaveLength(3);
        expect(clean?.config.bestOf).toBe(DEFAULT_CONFIG.bestOf);
        expect(clean?.config.finalBestOf).toBe(DEFAULT_CONFIG.finalBestOf);
        // Any whole best of from 1 to 10 is valid.
        expect(sanitizeTournament({ ...stored, config: { ...stored.config, bestOf: 4, finalBestOf: 10 } })?.config).toMatchObject({ bestOf: 4, finalBestOf: 10 });
        expect(clean?.config.odds).toBe('equal');
        expect(clean?.events).toHaveLength(3);
        // A spin for a duel that does not exist changes nothing.
        expect(buildBracket(clean as Tournament).decided).toBe(buildBracket(t).decided);
    });
});
