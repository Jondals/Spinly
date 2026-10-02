/**
 * Tournament mode texts (English and Spanish).
 *
 * They live apart from strings.ts so they ship in the same lazy chunk as the tournament view:
 * visitors who never open a tournament never download them.
 */
import { useCallback } from 'react';
import { useTranslation } from '../Components/i18n/LanguageProvider';
import { fillVars, type SpinlyLang, type TextVars } from './strings';
import type { RoundName } from './tournament';

type Entry = { en: string; es: string };

const TEXT = {
    // Setup
    setupTitle: { en: 'New tournament', es: 'Nuevo torneo' },
    setupSubtitle: { en: 'Elimination duels decided on the wheel: whoever wins moves on.', es: 'Duelos eliminatorios decididos en la ruleta: quien gana pasa de ronda.' },
    namePlaceholder: { en: 'Tournament name (optional)', es: 'Nombre del torneo (opcional)' },
    nameLabel: { en: 'Tournament name', es: 'Nombre del torneo' },
    participantName: { en: 'Participant {n}', es: 'Participante {n}' },
    participantAria: { en: 'Name of participant {n}', es: 'Nombre del participante {n}' },
    addParticipant: { en: 'Add', es: 'Añadir' },
    newParticipant: { en: 'New participant name', es: 'Nombre del nuevo participante' },
    rosterEmpty: { en: 'No participants yet: type a name above or use the wheel options.', es: 'Aún no hay participantes: escribe un nombre arriba o usa las opciones de la ruleta.' },
    removeParticipant: { en: 'Remove {name}', es: 'Quitar a {name}' },
    changeColor: { en: 'Change color of {name}', es: 'Cambiar el color de {name}' },
    fromWheel: { en: 'Use wheel options', es: 'Usar las opciones de la ruleta' },
    clearAll: { en: 'Clear list', es: 'Vaciar lista' },
    maxParticipants: { en: 'Max {max} participants', es: 'Máximo {max} participantes' },
    bestOfN: { en: 'Best of {n}', es: 'Al mejor de {n}' },
    oddsEqual: { en: 'Yes, 50/50', es: 'Sí, 50/50' },
    oddsSeed: { en: 'Top has the edge', es: 'Ventaja arriba' },
    seedingRandom: { en: 'Random draw', es: 'Sorteo' },
    seedingOrder: { en: 'List order', es: 'En orden' },
    thirdPlace: { en: 'Third place match', es: 'Tercer puesto' },
    referee: { en: 'Referee mode (force wins)', es: 'Modo árbitro' },
    quickSpin: { en: 'Quick spin', es: 'Giro rápido' },
    needMore: { en: 'At least {min} participants are needed to start.', es: 'Hacen falta al menos {min} participantes para empezar.' },
    start: { en: 'START TOURNAMENT', es: 'EMPEZAR TORNEO' },
    participantsTitle: { en: 'Participants', es: 'Participantes' },
    formatTitle: { en: 'Rules', es: 'Reglas' },
    shuffle: { en: 'Shuffle', es: 'Barajar' },
    styleLabel: { en: 'Quick start', es: 'Empieza rápido' },
    styleCustom: { en: 'Custom', es: 'Personalizado' },
    styleQuick: { en: 'Quick', es: 'Rápido' },
    styleQuickDesc: { en: '1 spin per duel', es: '1 giro por duelo' },
    styleClassic: { en: 'Classic', es: 'Clásico' },
    styleClassicDesc: { en: 'Best of 3 · final 5', es: 'Al mejor de 3 · final 5' },
    styleEpic: { en: 'Epic', es: 'Épico' },
    styleEpicDesc: { en: 'Best of 5 · final 7 · 3rd place', es: 'Al mejor de 5 · final 7 · 3.º' },
    roundsLabel: { en: 'Every duel', es: 'Cada duelo' },
    finalLabel: { en: 'The final', es: 'La final' },
    bestOfPrefix: { en: 'Best of', es: 'Al mejor de' },
    fewer: { en: '{label}: one spin fewer', es: '{label}: un giro menos' },
    more: { en: '{label}: one spin more', es: '{label}: un giro más' },
    duelsDesc: { en: 'First to {k} points wins · {m} spins at most', es: 'Gana quien llegue a {k} puntos · máx. {m} giros' },
    duelsDescOne: { en: 'A single spin decides the duel', es: 'Un solo giro decide el duelo' },
    oddsQuestion: { en: 'Same chances for everyone?', es: '¿Mismas posibilidades?' },
    oddsEqualDesc: { en: 'The wheel is split 50/50.', es: 'La ruleta se reparte al 50 %.' },
    oddsSeedDesc: { en: 'Higher in the list, bigger slice: 1st vs {last}th gets {pct}%.', es: 'Más arriba, más ruleta: el 1.º contra el {last}.º tiene el {pct} %.' },
    seedingQuestion: { en: 'Who plays whom?', es: '¿Quién se enfrenta a quién?' },
    seedingRandomDesc: { en: 'Pairs are drawn when it starts.', es: 'Las parejas se sortean al empezar.' },
    seedingOrderDesc: { en: '1st vs last, 2nd vs second to last…', es: '1.º contra el último, 2.º contra el penúltimo…' },
    extrasLabel: { en: 'Extras', es: 'Extras' },
    thirdPlaceDesc: { en: 'Semifinal losers play for 3rd', es: 'Los de semifinales juegan por el 3.º' },
    refereeDesc: { en: 'Give a duel without spinning', es: 'Dar un duelo sin girar' },
    quickSpinDesc: { en: '1.4 s spins instead of 4.2 s', es: 'Giros de 1,4 s en vez de 4,2 s' },
    previewLabel: { en: 'First round', es: 'Primera ronda' },
    previewMore: { en: '+{n} more', es: '+{n} más' },
    readyText: { en: '{n} participants · {duels} duels · final best of {f}', es: '{n} participantes · {duels} duelos · final al mejor de {f}' },
    // Live tournament: header and toolbar
    badge: { en: 'Knockout tournament', es: 'Torneo eliminatorio' },
    statusDuel: { en: '{round} · Duel {n} of {total}', es: '{round} · Duelo {n} de {total}' },
    statusDone: { en: 'Tournament finished', es: 'Torneo terminado' },
    progress: { en: '{n} of {total} duels played', es: '{n} de {total} duelos jugados' },
    playersCount: { en: '{n} participants', es: '{n} participantes' },
    viewsAria: { en: 'Tournament views', es: 'Vistas del torneo' },
    toolsAria: { en: 'Tournament actions', es: 'Acciones del torneo' },
    tabBracket: { en: 'Bracket', es: 'Cuadro' },
    tabPlayers: { en: 'Standings', es: 'Clasificación' },
    tabHistory: { en: 'History', es: 'Historial' },
    undo: { en: 'Undo last spin', es: 'Deshacer el último giro' },
    undoShort: { en: 'Undo', es: 'Deshacer' },
    restart: { en: 'Restart tournament', es: 'Reiniciar torneo' },
    restartShort: { en: 'Restart', es: 'Reiniciar' },
    restartConfirm: { en: 'Click again to restart', es: 'Pulsa otra vez para reiniciar' },
    restartConfirmShort: { en: 'Sure?', es: '¿Seguro?' },
    configure: { en: 'New tournament', es: 'Nuevo torneo' },
    configureShort: { en: 'New', es: 'Nuevo' },
    bracketTitle: { en: 'Knockout bracket', es: 'Cuadro eliminatorio' },
    phaseInfo: { en: 'Best of {n} · Final best of {f}', es: 'Al mejor de {n} · Final al mejor de {f}' },
    // Live tournament: bracket
    roundFinal: { en: 'Final', es: 'Final' },
    roundSemifinal: { en: 'Semifinals', es: 'Semifinales' },
    roundQuarterfinal: { en: 'Quarterfinals', es: 'Cuartos de final' },
    roundRoundOf16: { en: 'Round of 16', es: 'Octavos de final' },
    roundRoundOf32: { en: 'Round of 32', es: 'Dieciseisavos' },
    roundThird: { en: 'Third place', es: 'Tercer puesto' },
    stateLive: { en: 'Now playing', es: 'En juego' },
    stateNext: { en: 'Up next', es: 'Próximo' },
    stateBye: { en: 'Bye', es: 'Pase directo' },
    stateForced: { en: 'Referee', es: 'Árbitro' },
    tbd: { en: 'To be decided', es: 'Por definir' },
    champion: { en: 'Champion', es: 'Campeón' },
    statSpins: { en: 'Spins', es: 'Giros' },
    statAverage: { en: 'Average spin', es: 'Duración media' },
    statComebacks: { en: 'Comebacks', es: 'Remontadas' },
    // Duel panel
    vs: { en: 'VS', es: 'VS' },
    probability: { en: '{pct}% of the wheel', es: '{pct} % de la ruleta' },
    points: { en: 'points', es: 'puntos' },
    firstTo: { en: 'Best of {n} · first to {k} points wins', es: 'Al mejor de {n} · gana quien llegue antes a {k} puntos' },
    arenaHelp: { en: 'Spin the wheel: wherever it stops, that rival scores a point.', es: 'Gira la ruleta: el rival en el que se pare se lleva un punto.' },
    winsAria: { en: '{name}: {wins} of {need} spin wins', es: '{name}: {wins} de {need} giros ganados' },
    spinDuel: { en: 'SPIN DUEL', es: 'GIRAR DUELO' },
    spinning: { en: 'SPINNING...', es: 'GIRANDO...' },
    statusReady: { en: 'Ready for the first spin', es: 'Listo para el primer giro' },
    statusMatchPoint: { en: 'Match point for {name}', es: 'Punto de partido para {name}' },
    statusDecider: { en: 'Decider: the next spin wins it all', es: 'Punto decisivo: el próximo giro lo decide' },
    statusSpinning: { en: 'Spinning…', es: 'Girando…' },
    statusPoint: { en: 'Point for {name}', es: 'Punto para {name}' },
    statusWon: { en: '{name} wins the duel', es: '{name} gana el duelo' },
    statusChampion: { en: '{name} is the champion!', es: '¡{name} es el campeón!' },
    refereeMode: { en: 'Referee', es: 'Árbitro' },
    force: { en: 'Give to {name}', es: 'Dar a {name}' },
    forceAria: { en: 'Give the duel to {name} without spinning', es: 'Dar el duelo a {name} sin girar' },
    upNext: { en: 'Up next', es: 'Siguiente' },
    wheelAria: { en: 'Duel wheel: {a} against {b}', es: 'Ruleta del duelo: {a} contra {b}' },
    finishedText: { en: 'Every duel has been played. Restart with the same participants or set up a new one.', es: 'Ya se han jugado todos los duelos. Reinícialo con los mismos participantes o prepara uno nuevo.' },
    // Champion dialog
    championBadge: { en: 'CHAMPION', es: 'CAMPEÓN' },
    championOf: { en: 'Winner of {name}', es: 'Ganador de {name}' },
    viewBracket: { en: 'View bracket', es: 'Ver cuadro' },
    // Standings and history
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

/** Returns a tournament text in the given language, with its {placeholders} filled in. */
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

/** Hook with `tt(key, vars)` for the active language and `roundLabel(name)` for round names. */
export function useTournamentText() {
    const { lang } = useTranslation();
    /** A tournament text in the active language. */
    const tt = useCallback((key: TournamentTextKey, vars?: TextVars) => tournamentText(key, lang, vars), [lang]);
    /** The localized name of a round. */
    const roundLabel = useCallback((name: RoundName) => tournamentText(ROUND_KEYS[name], lang), [lang]);
    return { tt, roundLabel, lang };
}
