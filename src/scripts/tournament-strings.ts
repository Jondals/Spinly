// Textos del modo torneo. Van aparte de strings.ts para viajar en el mismo trozo que carga el torneo
// bajo demanda: quien no lo abre no los descarga.
import { useCallback } from 'react';
import { useTranslation } from '../Components/i18n/LanguageProvider';
import { fillVars, type SpinlyLang, type TextVars } from './strings';
import type { RoundName } from './tournament';

type Entry = { en: string; es: string };

const TEXT = {
    // Configuración
    setupTitle: { en: 'NEW TOURNAMENT', es: 'NUEVO TORNEO' },
    setupSubtitle: { en: 'Knockout bracket decided by wheel duels', es: 'Cuadro eliminatorio decidido a duelos de ruleta' },
    namePlaceholder: { en: 'Tournament name (optional)', es: 'Nombre del torneo (opcional)' },
    nameLabel: { en: 'Tournament name', es: 'Nombre del torneo' },
    participants: { en: 'Participants', es: 'Participantes' },
    participantName: { en: 'Participant {n}', es: 'Participante {n}' },
    participantAria: { en: 'Name of participant {n}', es: 'Nombre del participante {n}' },
    addParticipant: { en: 'Add participant', es: 'Añadir participante' },
    removeParticipant: { en: 'Remove {name}', es: 'Quitar a {name}' },
    changeColor: { en: 'Change color of {name}', es: 'Cambiar el color de {name}' },
    fromWheel: { en: 'Use wheel options', es: 'Usar las opciones de la ruleta' },
    clearAll: { en: 'Clear list', es: 'Vaciar lista' },
    maxParticipants: { en: 'Max {max} participants', es: 'Máximo {max} participantes' },
    format: { en: 'Format', es: 'Formato' },
    duels: { en: 'Duels', es: 'Duelos' },
    final: { en: 'Final', es: 'Final' },
    bestOfN: { en: 'Best of {n}', es: 'Al mejor de {n}' },
    oddsLabel: { en: 'Odds per spin', es: 'Probabilidad por giro' },
    oddsEqual: { en: 'Even (50%)', es: 'Igualada (50 %)' },
    oddsSeed: { en: 'By seed', es: 'Por cabeza de serie' },
    seedingLabel: { en: 'Seeding', es: 'Cabezas de serie' },
    seedingRandom: { en: 'Random draw', es: 'Sorteo al azar' },
    seedingOrder: { en: 'List order', es: 'Orden de la lista' },
    thirdPlace: { en: 'Third place match', es: 'Partido por el tercer puesto' },
    referee: { en: 'Referee mode (force wins)', es: 'Modo árbitro (forzar victorias)' },
    quickSpin: { en: 'Quick spin', es: 'Giro rápido' },
    bracketInfo: { en: '{size}-slot bracket · {byes} byes', es: 'Cuadro de {size} · {byes} pases directos' },
    bracketFull: { en: '{size}-slot bracket', es: 'Cuadro de {size}' },
    needMore: { en: 'At least {min} participants are needed', es: 'Hacen falta al menos {min} participantes' },
    start: { en: 'START TOURNAMENT', es: 'EMPEZAR TORNEO' },
    stepPlayers: { en: '1 · PARTICIPANTS', es: '1 · PARTICIPANTES' },
    stepFormat: { en: '2 · FORMAT', es: '2 · FORMATO' },
    playersHint: { en: 'The list order is the seed order. Tap a circle to pick its color.', es: 'El orden de la lista es el de las cabezas de serie. Toca un círculo para elegir su color.' },
    shuffle: { en: 'Shuffle', es: 'Barajar' },
    styleLabel: { en: 'Tournament style', es: 'Estilo del torneo' },
    styleCustom: { en: 'Custom', es: 'Personalizado' },
    styleQuick: { en: 'Quick', es: 'Rápido' },
    styleQuickDesc: { en: 'One spin per duel, fast spins', es: 'Un giro por duelo y giros rápidos' },
    styleClassic: { en: 'Classic', es: 'Clásico' },
    styleClassicDesc: { en: 'Best of 3, final best of 5', es: 'Al mejor de 3, final al mejor de 5' },
    styleEpic: { en: 'Epic', es: 'Épico' },
    styleEpicDesc: { en: 'Best of 5, final best of 7 and third place', es: 'Al mejor de 5, final al mejor de 7 y tercer puesto' },
    rulesLabel: { en: 'Rules', es: 'Reglas' },
    duelsDesc: { en: 'First to {k} spin wins takes the duel', es: 'Gana el duelo quien llegue antes a {k} giros ganados' },
    duelsDescOne: { en: 'A single spin decides the duel', es: 'Un solo giro decide el duelo' },
    oddsQuestion: { en: 'How is the wheel split?', es: '¿Cómo se reparte la ruleta?' },
    oddsEqualDesc: { en: 'Each side gets half of the wheel', es: 'Cada uno tiene media ruleta' },
    oddsSeedDesc: { en: 'Higher seeds (top of the list) get a bigger slice', es: 'Los primeros de la lista tienen un trozo más grande' },
    seedingQuestion: { en: 'Who plays whom?', es: '¿Quién se enfrenta a quién?' },
    seedingRandomDesc: { en: 'The bracket is drawn when it starts', es: 'El cuadro se sortea al empezar' },
    seedingOrderDesc: { en: '1st vs last, 2nd vs second to last…', es: '1.º contra el último, 2.º contra el penúltimo…' },
    extrasLabel: { en: 'Extras', es: 'Extras' },
    thirdPlaceDesc: { en: 'The semifinal losers play for the podium', es: 'Los que pierden en semifinales juegan por el podio' },
    refereeDesc: { en: 'Buttons to give a duel to someone without spinning', es: 'Botones para dar un duelo por ganado sin girar' },
    quickSpinDesc: { en: 'Spins last 1.4 s instead of 4.2 s (can be changed while playing)', es: 'Los giros duran 1,4 s en vez de 4,2 s (se puede cambiar jugando)' },
    previewLabel: { en: 'First round', es: 'Primera ronda' },
    previewDrawn: { en: 'Pairings are drawn when the tournament starts.', es: 'Los emparejamientos se sortean al empezar el torneo.' },
    previewMore: { en: '+{n} more', es: '+{n} más' },
    adjustRules: { en: 'Customize rules', es: 'Personalizar reglas' },
    rulesSummary: { en: '{bestOf} · Final {finalBestOf} · {odds} · {seeding}', es: '{bestOf} · Final {finalBestOf} · {odds} · {seeding}' },
    summary: { en: '{n} participants · {duels} duels · {size}-slot bracket', es: '{n} participantes · {duels} duelos · cuadro de {size}' },
    pickColor: { en: 'Color of {name}', es: 'Color de {name}' },
    // En juego
    badge: { en: 'KNOCKOUT TOURNAMENT', es: 'TORNEO ELIMINATORIO' },
    statusDuel: { en: '{round} · Duel {n} of {total}', es: '{round} · Duelo {n} de {total}' },
    statusDone: { en: 'Tournament finished', es: 'Torneo terminado' },
    playersCount: { en: '{n} participants', es: '{n} participantes' },
    viewsAria: { en: 'Tournament views', es: 'Vistas del torneo' },
    tabBracket: { en: 'Live bracket', es: 'Cuadro en vivo' },
    tabPlayers: { en: 'Participants ({n})', es: 'Participantes ({n})' },
    tabHistory: { en: 'History', es: 'Historial' },
    undo: { en: 'Undo last spin', es: 'Deshacer el último giro' },
    restart: { en: 'Restart tournament', es: 'Reiniciar torneo' },
    restartConfirm: { en: 'Click again to restart', es: 'Pulsa otra vez para reiniciar' },
    configure: { en: 'New tournament', es: 'Nuevo torneo' },
    bracketTitle: { en: 'Knockout bracket', es: 'Cuadro eliminatorio' },
    phaseInfo: { en: 'Best of {n} · Final best of {f}', es: 'Al mejor de {n} · Final al mejor de {f}' },
    roundFinal: { en: 'Grand final', es: 'Gran final' },
    roundSemifinal: { en: 'Semifinals', es: 'Semifinales' },
    roundQuarterfinal: { en: 'Quarterfinals', es: 'Cuartos de final' },
    roundRoundOf16: { en: 'Round of 16', es: 'Octavos de final' },
    roundRoundOf32: { en: 'Round of 32', es: 'Dieciseisavos' },
    roundThird: { en: 'Third place', es: 'Tercer puesto' },
    stateDone: { en: 'Finished', es: 'Finalizado' },
    stateLive: { en: 'LIVE', es: 'EN JUEGO' },
    stateActive: { en: 'Active duel', es: 'Duelo activo' },
    stateNext: { en: 'Up next', es: 'Próximo' },
    stateBye: { en: 'Bye', es: 'Pase directo' },
    stateForced: { en: 'Referee decision', es: 'Decisión arbitral' },
    tbd: { en: 'To be decided', es: 'Por definir' },
    champion: { en: 'Champion', es: 'Campeón' },
    finalist: { en: 'Finalist {n}', es: 'Finalista {n}' },
    statSpins: { en: 'Total spins', es: 'Giros totales' },
    statAverage: { en: 'Average spin', es: 'Duración media' },
    statComebacks: { en: 'Comeback rate', es: 'Tasa de remontadas' },
    statProgress: { en: 'Duels played', es: 'Duelos jugados' },
    // Duelo
    probability: { en: 'Odds: {pct}%', es: 'Probabilidad: {pct}%' },
    duelInfo: { en: 'Best of {n} · Spin {k}', es: 'Al mejor de {n} · Giro {k}' },
    spinDuel: { en: 'SPIN DUEL', es: 'GIRAR DUELO' },
    spinning: { en: 'SPINNING...', es: 'GIRANDO...' },
    statusReady: { en: 'Ready for the first spin', es: 'Listo para el primer giro' },
    statusMatchPoint: { en: 'Match point for {name}', es: 'Punto de partido para {name}' },
    statusDecider: { en: 'Decider: the next spin wins it all', es: 'Punto decisivo: el próximo giro lo decide' },
    statusSpinning: { en: 'Spinning…', es: 'Girando…' },
    statusPoint: { en: 'Point for {name}', es: 'Punto para {name}' },
    statusWon: { en: '{name} wins the duel', es: '{name} gana el duelo' },
    statusChampion: { en: '{name} is the champion!', es: '¡{name} es el campeón!' },
    refereeMode: { en: 'Referee mode', es: 'Modo árbitro' },
    force: { en: 'Force {name} win', es: 'Forzar victoria {name}' },
    forceAria: { en: 'Give the duel to {name} without spinning', es: 'Dar el duelo a {name} sin girar' },
    wheelAria: { en: 'Duel wheel: {a} against {b}', es: 'Ruleta del duelo: {a} contra {b}' },
    // Campeón
    championBadge: { en: 'CHAMPION', es: 'CAMPEÓN' },
    championOf: { en: 'Winner of {name}', es: 'Ganador de {name}' },
    closeChampion: { en: 'Close', es: 'Cerrar' },
    viewBracket: { en: 'View bracket', es: 'Ver cuadro' },
    // Participantes e historial
    seed: { en: 'Seed {n}', es: 'Cabeza de serie {n}' },
    record: { en: '{duels} duels won · {spins} spins won', es: '{duels} duelos ganados · {spins} giros ganados' },
    rankChampion: { en: 'Champion', es: 'Campeón' },
    rankRunnerUp: { en: 'Runner-up', es: 'Subcampeón' },
    rankThird: { en: 'Third place', es: 'Tercer puesto' },
    rankOut: { en: 'Out in {round}', es: 'Eliminado en {round}' },
    rankPlaying: { en: 'Playing now', es: 'Jugando ahora' },
    rankAlive: { en: 'Still in', es: 'Sigue en juego' },
    historyEmpty: { en: 'No spins yet: the history fills up as you play.', es: 'Aún no hay giros: el historial se llena al jugar.' },
    historySpin: { en: 'Point for {name}', es: 'Punto para {name}' },
    historyForced: { en: 'Referee gives the duel to {name}', es: 'El árbitro da el duelo a {name}' },
    historyWon: { en: '{name} wins {score}', es: '{name} gana {score}' },
} as const satisfies Record<string, Entry>;

export type TournamentTextKey = keyof typeof TEXT;

export function tournamentText(key: TournamentTextKey, lang: SpinlyLang, vars?: TextVars): string {
    return fillVars(TEXT[key][lang], vars);
}

const ROUND_KEYS: Record<RoundName, TournamentTextKey> = {
    final: 'roundFinal',
    semifinal: 'roundSemifinal',
    quarterfinal: 'roundQuarterfinal',
    roundOf16: 'roundRoundOf16',
    roundOf32: 'roundRoundOf32',
    third: 'roundThird',
};

/** tt(clave, variables) en el idioma activo, y el nombre de una ronda. */
export function useTournamentText() {
    const { lang } = useTranslation();
    const tt = useCallback((key: TournamentTextKey, vars?: TextVars) => tournamentText(key, lang, vars), [lang]);
    const roundLabel = useCallback((name: RoundName) => tournamentText(ROUND_KEYS[name], lang), [lang]);
    return { tt, roundLabel, lang };
}
