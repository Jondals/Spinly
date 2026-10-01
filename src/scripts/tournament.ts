// Torneo eliminatorio con duelos a la ruleta, sin React. Lo que se guarda es mínimo: la configuración,
// los participantes (con su cabeza de serie) y la lista de giros en orden. El cuadro entero se
// reconstruye de ahí (buildBracket), así nunca puede quedar en un estado incoherente, y leer lo
// guardado se reduce a validar datos simples.
// - Cuadro: potencia de 2 por encima del número de participantes. Los huecos son pases directos y
//   se reparten a las mejores cabezas de serie, en el orden de siembra clásico (1 contra el último…).
// - Duelos al mejor de N (configurable por ronda normal y para la final). Gana quien llega antes a
//   N/2 + 1 giros ganados. Un árbitro puede dar el duelo por ganado sin girar.
// - Opcional: partido por el tercer puesto entre los perdedores de semifinales, antes de la final.

export const TOURNAMENT_VERSION = 1;
export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 32;
export const MAX_PARTICIPANT_NAME = 24;
export const MAX_TOURNAMENT_NAME = 40;
export const BEST_OF_CHOICES = [1, 3, 5, 7] as const;

/** Colores de la paleta de la app (--item-*), los mismos que las opciones de la ruleta. */
export const PARTICIPANT_COLORS = ['pink', 'sky', 'amber', 'mint', 'violet', 'coral', 'teal', 'indigo'] as const;
export type PaletteColor = (typeof PARTICIPANT_COLORS)[number];
/** Un color de la paleta (sigue al modo claro/oscuro) o uno elegido a mano (#rrggbb). */
export type ParticipantColor = PaletteColor | `#${string}`;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Valor CSS del color de un participante. */
export const colorCss = (color: ParticipantColor | undefined): string =>
    !color ? 'var(--color-border-light)' : color.startsWith('#') ? color : `var(--item-${color})`;

export type OddsMode = 'equal' | 'seed';
export type SeedingMode = 'random' | 'order';
export type Side = 'a' | 'b';

export interface TournamentConfig {
    name: string;
    /** Al mejor de cuántos giros se juega cada duelo normal. */
    bestOf: number;
    /** Y la final (y el tercer puesto no: juega como las rondas normales). */
    finalBestOf: number;
    /** equal: 50 %. seed: la mejor cabeza de serie tiene más sector de ruleta. */
    odds: OddsMode;
    seeding: SeedingMode;
    thirdPlace: boolean;
    /** Muestra "Forzar victoria" en cada duelo. */
    referee: boolean;
    /** Giros de 1,4 s en vez de 4,2 s. */
    quickSpin: boolean;
}

export interface Participant {
    id: string;
    name: string;
    color: ParticipantColor;
    /** 1 = mejor cabeza de serie. */
    seed: number;
}

/** Un giro de un duelo, o un duelo entero decidido por el árbitro (forced). */
export interface TournamentEvent {
    match: string;
    winner: Side;
    /** Duración del giro (ms); 0 si lo decidió el árbitro. */
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
    /** Ronda (0 = la primera); el tercer puesto va con la de la final. */
    round: number;
    slot: number;
    third: boolean;
    a: string | null;
    b: string | null;
    winsA: number;
    winsB: number;
    /** Resultado de cada giro, en orden. */
    spins: Side[];
    winner: string | null;
    loser: string | null;
    /** Pase directo: no hubo rival. */
    bye: boolean;
    /** Lo decidió el árbitro. */
    forced: boolean;
    bestOf: number;
}

export interface Bracket {
    rounds: Match[][];
    third: Match | null;
    /** El duelo que toca jugar ahora; null si ya hay campeón. */
    current: Match | null;
    champion: string | null;
    /** Duelos que se juegan (sin pases directos) y cuántos se han decidido. */
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

export const winsNeeded = (bestOf: number): number => Math.floor(bestOf / 2) + 1;

const nextPowerOfTwo = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/** Orden de siembra clásico: en un cuadro de 8, [1, 8, 4, 5, 2, 7, 3, 6]; 1 y 2 solo se cruzan en la final. */
export function seedOrder(size: number): number[] {
    let order = [1];
    while (order.length < size) {
        const next = order.length * 2 + 1;
        order = order.flatMap((seed) => [seed, next - seed]);
    }
    return order;
}

const newId = (): string => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Participantes con su cabeza de serie: en el orden dado o barajados. */
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

export function createTournament(config: TournamentConfig, entries: ReadonlyArray<{ name: string; color: ParticipantColor }>, random: () => number = Math.random): Tournament {
    return {
        version: TOURNAMENT_VERSION,
        config: { ...config },
        participants: seedParticipants(entries, config.seeding, random),
        events: [],
        startedAt: Date.now(),
    };
}

/** El mismo cuadro y participantes, desde el principio (y con otra siembra si era al azar). */
export function restartTournament(tournament: Tournament, random: () => number = Math.random): Tournament {
    const ordered = [...tournament.participants].sort((x, y) => x.seed - y.seed);
    return createTournament(tournament.config, ordered, random);
}

const emptyMatch = (id: string, round: number, slot: number, bestOf: number, third = false): Match => ({
    id, round, slot, third, a: null, b: null, winsA: 0, winsB: 0, spins: [], winner: null, loser: null, bye: false, forced: false, bestOf,
});

function settle(match: Match, winner: Side, forced: boolean): void {
    match.winner = winner === 'a' ? match.a : match.b;
    match.loser = winner === 'a' ? match.b : match.a;
    match.forced = forced;
}

/** Reconstruye el cuadro a partir de los participantes y los giros guardados. */
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

    // Lleva el ganador (y en semifinales, el perdedor al tercer puesto) a su sitio.
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

    // Pases directos de la primera ronda.
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
        // Solo cuentan giros de duelos en juego: lo demás (datos viejos o manipulados) se ignora.
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

    // Orden de juego: ronda a ronda; el tercer puesto justo antes de la final.
    const final = rounds[roundCount - 1][0];
    const queue = [...rounds.slice(0, -1).flat(), ...(third ? [third] : []), final];
    const current = queue.find((match) => !match.winner && match.a !== null && match.b !== null) ?? null;
    const playable = queue.filter((match) => !match.bye).length;
    const decided = queue.filter((match) => !match.bye && match.winner).length;
    return { rounds, third, current, champion: final.winner, playable, decided };
}

/** Probabilidad de que gane el lado A en cada giro. */
export function probabilityA(tournament: Tournament, match: Match): number {
    if (tournament.config.odds === 'equal' || !match.a || !match.b) return 0.5;
    const total = tournament.participants.length;
    const seedOf = (id: string) => tournament.participants.find((p) => p.id === id)?.seed ?? total;
    const strength = (id: string) => total + 1 - seedOf(id);
    return strength(match.a) / (strength(match.a) + strength(match.b));
}

export function addEvent(tournament: Tournament, event: Omit<TournamentEvent, 'at'>): Tournament {
    return { ...tournament, events: [...tournament.events, { ...event, at: Date.now() }] };
}

/** Deshace el último giro (o decisión del árbitro). */
export function undoLast(tournament: Tournament): Tournament {
    return { ...tournament, events: tournament.events.slice(0, -1) };
}

export type RoundName = 'final' | 'semifinal' | 'quarterfinal' | 'roundOf16' | 'roundOf32' | 'third';

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
    /** Giros de verdad (sin decisiones del árbitro). */
    spins: number;
    averageMs: number;
    /** Duelos remontados: ganados por quien perdió el primer giro, sobre los decididos girando. */
    comebackRate: number;
}

export function tournamentStats(tournament: Tournament, bracket: Bracket): TournamentStats {
    const spun = tournament.events.filter((event) => !event.forced);
    const averageMs = spun.length ? spun.reduce((sum, event) => sum + event.ms, 0) / spun.length : 0;
    const decided = [...bracket.rounds.flat(), ...(bracket.third ? [bracket.third] : [])]
        .filter((match) => match.winner && !match.bye && !match.forced && match.spins.length > 1);
    const comebacks = decided.filter((match) => {
        const winnerSide: Side = match.winner === match.a ? 'a' : 'b';
        return match.spins[0] !== winnerSide;
    }).length;
    return { spins: spun.length, averageMs, comebackRate: decided.length ? comebacks / decided.length : 0 };
}

// Lectura de lo guardado: cualquier dato que no encaje se descarta en vez de romper la app.
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const cleanText = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function sanitizeConfig(raw: unknown): TournamentConfig {
    const source = isRecord(raw) ? raw : {};
    const bestOf = (value: unknown, fallback: number) => (BEST_OF_CHOICES as readonly number[]).includes(value as number) ? (value as number) : fallback;
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

export const isParticipantColor = (value: unknown): value is ParticipantColor =>
    (PARTICIPANT_COLORS as readonly unknown[]).includes(value) || (typeof value === 'string' && HEX_COLOR.test(value));

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
    // Cabezas de serie consecutivas desde 1, aunque falte alguna.
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
 * Giro de un duelo: quién gana (según la probabilidad de A) y la rotación final de la ruleta para que
 * la flecha, arriba, caiga dentro de su sector. El sector de A va de 0° a 360·p en el sentido del
 * reloj desde arriba; el de B, el resto. Nunca cae en la raya entre los dos.
 */
export function spinDuel(probability: number, rotation: number, random: () => number = Math.random): { winner: Side; rotation: number } {
    const winner: Side = random() < probability ? 'a' : 'b';
    const split = 360 * probability;
    const [from, to] = winner === 'a' ? [0, split] : [split, 360];
    const margin = (to - from) * 0.12;
    const angle = from + margin + random() * (to - from - 2 * margin);
    const turns = 5 + Math.floor(random() * 3);
    const current = ((rotation % 360) + 360) % 360;
    const delta = ((360 - angle) - current + 720) % 360;
    return { winner, rotation: rotation + delta + turns * 360 };
}
