/**
 * Knockout tournament decided by wheel duels. Framework-free (no React).
 *
 * Only the minimum is stored: the config, the participants (with their seed) and the ordered list of
 * spins. The whole bracket is rebuilt from that (buildBracket), so it can never end up in an
 * inconsistent state, and reading saved data comes down to validating plain values.
 * - Bracket: the next power of two above the participant count. Empty slots are byes, handed to the
 *   top seeds in classic seeding order (1 against the last one…).
 * - Duels are best of N, from 1 to 10 (one setting for regular rounds, another for the final). Whoever
 *   first reaches floor(N/2) + 1 spin wins takes the duel. A referee can award a duel without spinning.
 * - Optional third-place match between the semifinal losers, played right before the final.
 */

export const TOURNAMENT_VERSION = 1;
export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 32;
export const MAX_PARTICIPANT_NAME = 24;
export const MAX_TOURNAMENT_NAME = 40;
/** Range of the "best of" setting (spins per duel). */
export const MIN_BEST_OF = 1;
export const MAX_BEST_OF = 10;

/** The app palette (--item-*), the same colors as the wheel options. */
export const PARTICIPANT_COLORS = ['pink', 'sky', 'amber', 'mint', 'violet', 'coral', 'teal', 'indigo'] as const;
export type PaletteColor = (typeof PARTICIPANT_COLORS)[number];
/** A palette color (follows light/dark mode) or a hand-picked one (#rrggbb). */
export type ParticipantColor = PaletteColor | `#${string}`;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** CSS value for a participant color. */
export const colorCss = (color: ParticipantColor | undefined): string =>
    !color ? 'var(--color-border-light)' : color.startsWith('#') ? color : `var(--item-${color})`;

export type OddsMode = 'equal' | 'seed';
export type SeedingMode = 'random' | 'order';
export type Side = 'a' | 'b';

export interface TournamentConfig {
    name: string;
    /** Best of how many spins each regular duel is played. */
    bestOf: number;
    /** Same for the final (the third-place match plays like a regular round). */
    finalBestOf: number;
    /** equal: 50%. seed: the better seed gets a bigger slice of the wheel. */
    odds: OddsMode;
    seeding: SeedingMode;
    thirdPlace: boolean;
    /** Shows "give the duel" buttons in every duel. */
    referee: boolean;
    /** 1.4 s spins instead of 4.2 s. */
    quickSpin: boolean;
}

export interface Participant {
    id: string;
    name: string;
    color: ParticipantColor;
    /** 1 = top seed. */
    seed: number;
}

/** One spin of a duel, or a whole duel decided by the referee (forced). */
export interface TournamentEvent {
    match: string;
    winner: Side;
    /** Spin duration (ms); 0 when the referee decided it. */
    ms: number;
    forced?: boolean;
    at: number;
}

export interface Tournament {
    version: typeof TOURNAMENT_VERSION;
    config: TournamentConfig;
    participants: Participant[];
    events: TournamentEvent[];
    startedAt: number;
}

export interface Match {
    id: string;
    /** Round (0 = the first one); the third-place match shares the final's round. */
    round: number;
    slot: number;
    third: boolean;
    a: string | null;
    b: string | null;
    winsA: number;
    winsB: number;
    /** Result of each spin, in order. */
    spins: Side[];
    winner: string | null;
    loser: string | null;
    /** Bye: there was no opponent. */
    bye: boolean;
    /** Decided by the referee. */
    forced: boolean;
    bestOf: number;
}

export interface Bracket {
    rounds: Match[][];
    third: Match | null;
    /** The duel to play now; null once there is a champion. */
    current: Match | null;
    champion: string | null;
    /** Duels that are actually played (byes excluded) and how many are decided. */
    playable: number;
    decided: number;
}

export const DEFAULT_CONFIG: TournamentConfig = {
    name: '',
    bestOf: 3,
    finalBestOf: 5,
    odds: 'equal',
    seeding: 'random',
    thirdPlace: false,
    referee: false,
    quickSpin: false,
};

/** Spin wins needed to take a best-of-N duel. */
export const winsNeeded = (bestOf: number): number => Math.floor(bestOf / 2) + 1;

/** Most spins a best-of-N duel can take (when both sides stay level until the end). */
export const maxSpins = (bestOf: number): number => winsNeeded(bestOf) * 2 - 1;

/** A best-of value as a whole number within [MIN_BEST_OF, MAX_BEST_OF]. */
export const clampBestOf = (value: number): number =>
    Math.min(MAX_BEST_OF, Math.max(MIN_BEST_OF, Math.round(Number.isFinite(value) ? value : MIN_BEST_OF)));

/** Smallest power of two that fits n participants (at least 2). */
const nextPowerOfTwo = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/** Classic seeding order: for an 8-slot bracket, [1, 8, 4, 5, 2, 7, 3, 6]; 1 and 2 can only meet in the final. */
export function seedOrder(size: number): number[] {
    let order = [1];
    while (order.length < size) {
        const next = order.length * 2 + 1;
        order = order.flatMap((seed) => [seed, next - seed]);
    }
    return order;
}

/** Random, practically unique participant id. */
const newId = (): string => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Gives each participant a seed: in the given order, or shuffled for a random draw. */
export function seedParticipants(entries: ReadonlyArray<{ name: string; color: ParticipantColor }>, seeding: SeedingMode, random: () => number = Math.random): Participant[] {
    const list = entries.map((entry) => ({ ...entry }));
    if (seeding === 'random') {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
    }
    return list.map((entry, index) => ({ id: newId(), name: entry.name, color: entry.color, seed: index + 1 }));
}

/** Creates a fresh tournament (no spins yet) from a config and a list of participants. */
export function createTournament(config: TournamentConfig, entries: ReadonlyArray<{ name: string; color: ParticipantColor }>, random: () => number = Math.random): Tournament {
    return {
        version: TOURNAMENT_VERSION,
        config: { ...config },
        participants: seedParticipants(entries, config.seeding, random),
        events: [],
        startedAt: Date.now(),
    };
}

/** Same bracket and participants, from the start (drawn again if seeding is random). */
export function restartTournament(tournament: Tournament, random: () => number = Math.random): Tournament {
    const ordered = [...tournament.participants].sort((x, y) => x.seed - y.seed);
    return createTournament(tournament.config, ordered, random);
}

/** An empty match slot of the bracket. */
const emptyMatch = (id: string, round: number, slot: number, bestOf: number, third = false): Match => ({
    id, round, slot, third, a: null, b: null, winsA: 0, winsB: 0, spins: [], winner: null, loser: null, bye: false, forced: false, bestOf,
});

/** Marks a match as decided in favour of one side. */
function settle(match: Match, winner: Side, forced: boolean): void {
    match.winner = winner === 'a' ? match.a : match.b;
    match.loser = winner === 'a' ? match.b : match.a;
    match.forced = forced;
}

/** Rebuilds the bracket from the participants and the saved spins. */
export function buildBracket(tournament: Tournament): Bracket {
    const { participants, config } = tournament;
    const size = nextPowerOfTwo(participants.length);
    const roundCount = Math.log2(size);
    const bySeed = new Map(participants.map((p) => [p.seed, p.id]));
    const rounds: Match[][] = [];
    for (let round = 0; round < roundCount; round++) {
        const count = size / 2 ** (round + 1);
        const bestOf = round === roundCount - 1 ? config.finalBestOf : config.bestOf;
        rounds.push(Array.from({ length: count }, (_, slot) => emptyMatch(`r${round}m${slot}`, round, slot, bestOf)));
    }
    const third = config.thirdPlace && roundCount >= 2 ? emptyMatch('third', roundCount - 1, 1, config.bestOf, true) : null;
    const order = seedOrder(size);
    rounds[0].forEach((match, slot) => {
        match.a = bySeed.get(order[slot * 2]) ?? null;
        match.b = bySeed.get(order[slot * 2 + 1]) ?? null;
    });

    // Moves the winner (and, in the semifinals, the loser to the third-place match) to its next slot.
    const advance = (match: Match) => {
        if (match.third || !match.winner) return;
        const next = rounds[match.round + 1]?.[Math.floor(match.slot / 2)];
        if (next) {
            if (match.slot % 2 === 0) next.a = match.winner;
            else next.b = match.winner;
        }
        if (third && match.round === roundCount - 2 && match.loser) {
            if (match.slot % 2 === 0) third.a = match.loser;
            else third.b = match.loser;
        }
    };

    // First-round byes.
    for (const match of rounds[0]) {
        if (match.a && !match.b) {
            match.bye = true;
            match.winner = match.a;
        } else if (!match.a && match.b) {
            match.bye = true;
            match.winner = match.b;
        }
        advance(match);
    }

    const all = [...rounds.flat(), ...(third ? [third] : [])];
    const byId = new Map(all.map((match) => [match.id, match]));
    for (const event of tournament.events) {
        const match = byId.get(event.match);
        // Only spins of duels in play count: anything else (old or tampered data) is ignored.
        if (!match || match.winner || !match.a || !match.b) continue;
        if (event.forced) {
            settle(match, event.winner, true);
        } else {
            match.spins.push(event.winner);
            if (event.winner === 'a') match.winsA += 1;
            else match.winsB += 1;
            const need = winsNeeded(match.bestOf);
            if (match.winsA >= need) settle(match, 'a', false);
            else if (match.winsB >= need) settle(match, 'b', false);
        }
        advance(match);
    }

    const final = rounds[roundCount - 1][0];
    const queue = playOrder({ rounds, third });
    const current = queue.find((match) => !match.winner && match.a !== null && match.b !== null) ?? null;
    const playable = queue.filter((match) => !match.bye).length;
    const decided = queue.filter((match) => !match.bye && match.winner).length;
    return { rounds, third, current, champion: final.winner, playable, decided };
}

/** Every match in play order: round by round, with the third-place match right before the final. */
export function playOrder(bracket: Pick<Bracket, 'rounds' | 'third'>): Match[] {
    const { rounds, third } = bracket;
    return [...rounds.slice(0, -1).flat(), ...(third ? [third] : []), rounds[rounds.length - 1][0]];
}

/** Every match of the bracket, including the third-place match. */
export const allMatches = (bracket: Pick<Bracket, 'rounds' | 'third'>): Match[] =>
    [...bracket.rounds.flat(), ...(bracket.third ? [bracket.third] : [])];

/** The duel that will be played after the current one (it may still be missing a participant). */
export function upcomingMatch(bracket: Bracket): Match | null {
    if (!bracket.current) return null;
    const queue = playOrder(bracket);
    const from = queue.indexOf(bracket.current);
    return queue.find((match, index) => index > from && !match.winner && !match.bye) ?? null;
}

/** Probability that side A wins each spin. */
export function probabilityA(tournament: Tournament, match: Match): number {
    if (tournament.config.odds === 'equal' || !match.a || !match.b) return 0.5;
    const total = tournament.participants.length;
    /** Seed of a participant (the last one if unknown). */
    const seedOf = (id: string) => tournament.participants.find((p) => p.id === id)?.seed ?? total;
    /** Strength used for the odds: the better the seed, the higher. */
    const strength = (id: string) => total + 1 - seedOf(id);
    return strength(match.a) / (strength(match.a) + strength(match.b));
}

/** Appends a spin (or a referee decision) with the current timestamp. */
export function addEvent(tournament: Tournament, event: Omit<TournamentEvent, 'at'>): Tournament {
    return { ...tournament, events: [...tournament.events, { ...event, at: Date.now() }] };
}

/** Undoes the last spin (or referee decision). */
export function undoLast(tournament: Tournament): Tournament {
    return { ...tournament, events: tournament.events.slice(0, -1) };
}

export type RoundName = 'final' | 'semifinal' | 'quarterfinal' | 'roundOf16' | 'roundOf32' | 'third';

/** Name of a round from how many matches it has left until the final. */
export function roundName(round: number, roundCount: number, third = false): RoundName {
    if (third) return 'third';
    const matches = 2 ** (roundCount - round - 1);
    if (matches === 1) return 'final';
    if (matches === 2) return 'semifinal';
    if (matches === 4) return 'quarterfinal';
    if (matches === 8) return 'roundOf16';
    return 'roundOf32';
}

export interface TournamentStats {
    /** Real spins (referee decisions excluded). */
    spins: number;
    averageMs: number;
    /** Comebacks: duels won by whoever lost the first spin, over the duels decided by spinning. */
    comebackRate: number;
}

/** Spin count, average spin duration and comeback rate. */
export function tournamentStats(tournament: Tournament, bracket: Bracket): TournamentStats {
    const spun = tournament.events.filter((event) => !event.forced);
    const averageMs = spun.length ? spun.reduce((sum, event) => sum + event.ms, 0) / spun.length : 0;
    const decided = allMatches(bracket).filter((match) => match.winner && !match.bye && !match.forced && match.spins.length > 1);
    const comebacks = decided.filter((match) => {
        const winnerSide: Side = match.winner === match.a ? 'a' : 'b';
        return match.spins[0] !== winnerSide;
    }).length;
    return { spins: spun.length, averageMs, comebackRate: decided.length ? comebacks / decided.length : 0 };
}

// Reading saved data: anything that does not fit is dropped instead of breaking the app.

/** True for plain objects (not arrays or null). */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Collapses whitespace and trims a string to `max` characters; '' for anything else. */
const cleanText = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Validates a saved config, falling back to the defaults field by field. */
export function sanitizeConfig(raw: unknown): TournamentConfig {
    const source = isRecord(raw) ? raw : {};
    /** A valid best-of value (a whole number from 1 to 10), or the fallback. */
    const bestOf = (value: unknown, fallback: number) =>
        typeof value === 'number' && Number.isInteger(value) && value >= MIN_BEST_OF && value <= MAX_BEST_OF ? value : fallback;
    return {
        name: cleanText(source.name, MAX_TOURNAMENT_NAME),
        bestOf: bestOf(source.bestOf, DEFAULT_CONFIG.bestOf),
        finalBestOf: bestOf(source.finalBestOf, DEFAULT_CONFIG.finalBestOf),
        odds: source.odds === 'seed' ? 'seed' : 'equal',
        seeding: source.seeding === 'order' ? 'order' : 'random',
        thirdPlace: source.thirdPlace === true,
        referee: source.referee === true,
        quickSpin: source.quickSpin === true,
    };
}

/** True for a palette color name or a #rrggbb hex color. */
export const isParticipantColor = (value: unknown): value is ParticipantColor =>
    (PARTICIPANT_COLORS as readonly unknown[]).includes(value) || (typeof value === 'string' && HEX_COLOR.test(value));

/** Validates a saved tournament; null when it cannot be played. */
export function sanitizeTournament(raw: unknown): Tournament | null {
    if (!isRecord(raw) || raw.version !== TOURNAMENT_VERSION || !Array.isArray(raw.participants) || !Array.isArray(raw.events)) return null;
    const participants: Participant[] = [];
    const seeds = new Set<number>();
    for (const item of raw.participants.slice(0, MAX_PARTICIPANTS)) {
        if (!isRecord(item)) continue;
        const name = cleanText(item.name, MAX_PARTICIPANT_NAME);
        const seed = item.seed;
        if (!name || typeof item.id !== 'string' || typeof seed !== 'number' || !Number.isInteger(seed) || seed < 1 || seeds.has(seed)) continue;
        seeds.add(seed);
        participants.push({ id: item.id.slice(0, 64), name, color: isParticipantColor(item.color) ? item.color : 'indigo', seed });
    }
    if (participants.length < MIN_PARTICIPANTS) return null;
    // Consecutive seeds from 1, even if one went missing.
    participants.sort((x, y) => x.seed - y.seed).forEach((participant, index) => { participant.seed = index + 1; });
    const events: TournamentEvent[] = [];
    for (const item of raw.events.slice(0, 2000)) {
        if (!isRecord(item) || typeof item.match !== 'string' || (item.winner !== 'a' && item.winner !== 'b')) continue;
        events.push({
            match: item.match.slice(0, 16),
            winner: item.winner,
            ms: typeof item.ms === 'number' && Number.isFinite(item.ms) ? Math.max(0, Math.min(item.ms, 60000)) : 0,
            forced: item.forced === true || undefined,
            at: typeof item.at === 'number' && Number.isFinite(item.at) ? item.at : 0,
        });
    }
    return {
        version: TOURNAMENT_VERSION,
        config: sanitizeConfig(raw.config),
        participants,
        events,
        startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : Date.now(),
    };
}

/**
 * Where each side sits on the duel wheel, in degrees clockwise from the top. A takes the left side
 * (it ends at the top, going clockwise) and B the right side, so the wheel matches the scoreboard,
 * where A is on the left. With even odds each one gets exactly half.
 */
export function duelSectors(probability: number): { a: [number, number]; b: [number, number] } {
    const split = 360 * (1 - probability);
    return { a: [split, 360], b: [0, split] };
}

/**
 * One duel spin: who wins (from A's probability) and the wheel's final rotation, so that the pointer
 * at the top lands inside the winner's sector (see duelSectors). It never lands on the line between them.
 */
export function spinDuel(probability: number, rotation: number, random: () => number = Math.random): { winner: Side; rotation: number } {
    const winner: Side = random() < probability ? 'a' : 'b';
    const [from, to] = duelSectors(probability)[winner];
    const margin = (to - from) * 0.12;
    const angle = from + margin + random() * (to - from - 2 * margin);
    const turns = 5 + Math.floor(random() * 3);
    const current = ((rotation % 360) + 360) % 360;
    const delta = ((360 - angle) - current + 720) % 360;
    return { winner, rotation: rotation + delta + turns * 360 };
}
