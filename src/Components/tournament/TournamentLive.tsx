import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import SegmentedToggle from '../common/SegmentedToggle';
import DuelWheel from './DuelWheel';
import type { WheelColorField } from '../wheel/Wheel';
import TournamentBracket from './TournamentBracket';
import { playWin } from '../../scripts/sound';
import {
    addEvent,
    buildBracket,
    colorCss,
    probabilityA,
    restartTournament,
    roundName,
    tournamentStats,
    undoLast,
    winsNeeded,
    type Bracket,
    type Match,
    type Participant,
    type Side,
    type Tournament,
} from '../../scripts/tournament';
import { useTournamentText } from '../../scripts/tournament-strings';

type View = 'bracket' | 'players' | 'history';

// El reinicio pide una segunda pulsación en este tiempo, como borrar en las listas de la app.
const CONFIRM_MS = 2600;

interface TournamentLiveProps {
    tournament: Tournament;
    onChange: (next: Tournament) => void;
    onNew: () => void;
    onColorChange: (field: WheelColorField, color: string) => void;
}

const matchRound = (bracket: Bracket, match: Match) => roundName(match.round, bracket.rounds.length, match.third);

/** Lista de participantes con su puesto y su balance. */
function PlayersView({ tournament, bracket, people }: { tournament: Tournament; bracket: Bracket; people: Map<string, Participant> }) {
    const { tt, roundLabel } = useTournamentText();
    const matches = [...bracket.rounds.flat(), ...(bracket.third ? [bracket.third] : [])];
    const final = bracket.rounds[bracket.rounds.length - 1][0];
    const rows = [...tournament.participants].sort((x, y) => x.seed - y.seed).map((person) => {
        const played = matches.filter((match) => !match.bye && (match.a === person.id || match.b === person.id));
        const duels = played.filter((match) => match.winner === person.id).length;
        const spins = played.reduce((sum, match) => sum + (match.a === person.id ? match.winsA : match.winsB), 0);
        const lostMain = matches.find((match) => !match.third && match.loser === person.id);
        const waitsThird = bracket.third && !bracket.third.winner && (bracket.third.a === person.id || bracket.third.b === person.id);
        let rank: string;
        let tone = '';
        if (bracket.champion === person.id) { rank = tt('rankChampion'); tone = 'gold'; }
        else if (final.winner && final.loser === person.id) { rank = tt('rankRunnerUp'); tone = 'silver'; }
        else if (bracket.third?.winner === person.id) { rank = tt('rankThird'); tone = 'bronze'; }
        else if (bracket.current && (bracket.current.a === person.id || bracket.current.b === person.id)) { rank = tt('rankPlaying'); tone = 'live'; }
        else if (lostMain && !waitsThird) { rank = tt('rankOut', { round: roundLabel(matchRound(bracket, bracket.third?.loser === person.id ? bracket.third : lostMain)).toLowerCase() }); tone = 'out'; }
        else rank = tt('rankAlive');
        return { person, duels, spins, rank, tone };
    });
    return (
        <ul className="spinly-tour-players">
            {rows.map(({ person, duels, spins, rank, tone }) => (
                <li key={person.id} className={`spinly-tour-player spinly-panel-card${tone === 'out' ? ' spinly-tour-player--out' : ''}`}>
                    <span className="spinly-tour-player-seed" title={tt('seed', { n: person.seed })}>{person.seed}</span>
                    <span className="spinly-match-dot" style={{ backgroundColor: colorCss(person.color) }} />
                    <span className="spinly-tour-player-main">
                        <strong>{person.name}</strong>
                        <span>{tt('record', { duels, spins })}</span>
                    </span>
                    <span className={`spinly-tour-rank${tone ? ` spinly-tour-rank--${tone}` : ''}`}>{rank}</span>
                </li>
            ))}
        </ul>
    );
}

/** Historial de giros, del más reciente al más antiguo, con el marcador de cada momento. */
function HistoryView({ tournament, bracket, people }: { tournament: Tournament; bracket: Bracket; people: Map<string, Participant> }) {
    const { tt, roundLabel } = useTournamentText();
    const matches = new Map([...bracket.rounds.flat(), ...(bracket.third ? [bracket.third] : [])].map((match) => [match.id, match]));
    const score = new Map<string, [number, number]>();
    const items: Array<{ key: number; round: string; a: string; b: string; text: string; tally: string; forced: boolean; won: boolean }> = [];
    tournament.events.forEach((event, index) => {
        const match = matches.get(event.match);
        if (!match || !match.a || !match.b) return;
        const [wa, wb] = score.get(match.id) ?? [0, 0];
        const next: [number, number] = event.forced ? [wa, wb] : event.winner === 'a' ? [wa + 1, wb] : [wa, wb + 1];
        score.set(match.id, next);
        const name = people.get(event.winner === 'a' ? match.a : match.b)?.name ?? '';
        const need = winsNeeded(match.bestOf);
        const won = event.forced || next[0] >= need || next[1] >= need;
        items.push({
            key: index,
            round: roundLabel(matchRound(bracket, match)),
            a: people.get(match.a)?.name ?? '',
            b: people.get(match.b)?.name ?? '',
            text: event.forced ? tt('historyForced', { name }) : won ? tt('historyWon', { name, score: `${Math.max(...next)}–${Math.min(...next)}` }) : tt('historySpin', { name }),
            tally: `${next[0]} – ${next[1]}`,
            forced: Boolean(event.forced),
            won,
        });
    });
    if (!items.length) return <p className="spinly-tour-empty">{tt('historyEmpty')}</p>;
    return (
        <ol className="spinly-tour-history">
            {items.reverse().map((item) => (
                <li key={item.key} className={`spinly-tour-history-item${item.won ? ' spinly-tour-history-item--won' : ''}`}>
                    <span className="spinly-tour-history-round">{item.round}</span>
                    <span className="spinly-tour-history-duel">{item.a} <em>vs</em> {item.b}</span>
                    <span className="spinly-tour-history-text">{item.forced && <Icon name="flag" size={12} />}{item.text}</span>
                    <span className="spinly-tour-history-tally">{item.tally}</span>
                </li>
            ))}
        </ol>
    );
}

/** Celebración del campeón, con el mismo cristal que el resultado de la ruleta principal. */
function ChampionOverlay({ name, tournamentName, onClose, onNew }: { name: string; tournamentName: string; onClose: () => void; onNew: () => void }) {
    const { tt } = useTournamentText();
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement>(null);
    return (
        <Modal
            labelledBy={titleId}
            onClose={onClose}
            backdropClassName="wheel-overlay"
            className="wheel-overlay-card spinly-champion-card"
            initialFocus={closeRef}
        >
            <span className="spinly-champion-burst" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</span>
            <span className="wheel-overlay-badge spinly-badge">
                <Icon name="trophy" size={12} />
                {tt('championBadge')}
            </span>
            <p id={titleId} className="wheel-overlay-name">{name}</p>
            {tournamentName && <p className="spinly-champion-of">{tt('championOf', { name: tournamentName })}</p>}
            <div className="spinly-champion-actions">
                <button ref={closeRef} type="button" className="spinly-btn-primary spinly-new-btn" onClick={onClose}>
                    <Icon name="bracket" />
                    {tt('viewBracket')}
                </button>
                <button type="button" className="spinly-btn-primary" onClick={onNew}>
                    <Icon name="trophy" />
                    {tt('configure')}
                </button>
            </div>
        </Modal>
    );
}

/** El torneo en juego: cabecera, cuadro (o participantes, o historial), estadísticas y el duelo actual. */
function TournamentLive({ tournament, onChange, onNew, onColorChange }: TournamentLiveProps) {
    const { tt, roundLabel, lang } = useTournamentText();
    const [view, setView] = useState<View>('bracket');
    const [spinning, setSpinning] = useState(false);
    const [lastWon, setLastWon] = useState<string | null>(null);
    const [showChampion, setShowChampion] = useState(false);
    const [confirmRestart, setConfirmRestart] = useState(false);
    const confirmTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

    const bracket = useMemo(() => buildBracket(tournament), [tournament]);
    const people = useMemo(() => new Map(tournament.participants.map((person) => [person.id, person])), [tournament.participants]);
    const stats = tournamentStats(tournament, bracket);
    const { current, champion } = bracket;
    const a = current?.a ? people.get(current.a) : undefined;
    const b = current?.b ? people.get(current.b) : undefined;
    const probability = current ? probabilityA(tournament, current) : 0.5;
    const { config } = tournament;

    // Registra un giro (o una decisión del árbitro) y avisa si con él se decide el duelo o el torneo.
    const record = (winner: Side, ms: number, forced = false) => {
        if (!current) return;
        const next = addEvent(tournament, { match: current.id, winner, ms, forced: forced || undefined });
        const after = buildBracket(next);
        const decided = after.rounds.flat().concat(after.third ? [after.third] : []).find((match) => match.id === current.id);
        if (decided?.winner) {
            setLastWon(people.get(decided.winner)?.name ?? null);
            playWin();
        }
        if (after.champion) setShowChampion(true);
        onChange(next);
    };

    const restart = () => {
        if (!confirmRestart) {
            setConfirmRestart(true);
            window.clearTimeout(confirmTimer.current);
            confirmTimer.current = window.setTimeout(() => setConfirmRestart(false), CONFIRM_MS);
            return;
        }
        window.clearTimeout(confirmTimer.current);
        setConfirmRestart(false);
        setLastWon(null);
        onChange(restartTournament(tournament));
    };

    // Con un decimal como mucho y la coma en español: 0.5 → "50", 1.4 → "1,4".
    const decimal = (value: number) => {
        const rounded = String(Math.round(value * 10) / 10);
        return lang === 'es' ? rounded.replace('.', ',') : rounded;
    };
    const percent = (fraction: number) => decimal(fraction * 100);

    const need = current ? winsNeeded(current.bestOf) : 0;
    const status = (() => {
        const championName = champion ? people.get(champion)?.name ?? '' : '';
        if (championName) return tt('statusChampion', { name: championName });
        if (spinning) return tt('statusSpinning');
        if (!current || !a || !b) return '';
        if (!current.spins.length) return lastWon ? tt('statusWon', { name: lastWon }) : tt('statusReady');
        const pointA = current.winsA === need - 1;
        const pointB = current.winsB === need - 1;
        if (pointA && pointB) return tt('statusDecider');
        if (pointA || pointB) return tt('statusMatchPoint', { name: (pointA ? a : b).name });
        const last = current.spins[current.spins.length - 1];
        return tt('statusPoint', { name: (last === 'a' ? a : b).name });
    })();

    const duelNumber = current ? bracket.decided + 1 : bracket.decided;
    const topStatus = current
        ? tt('statusDuel', { round: roundLabel(matchRound(bracket, current)), n: Math.min(duelNumber, bracket.playable), total: bracket.playable })
        : tt('statusDone');
    const views = [
        { id: 'bracket' as const, label: <><Icon name="bracket" size={14} />{tt('tabBracket')}</> },
        { id: 'players' as const, label: <><Icon name="users" size={14} />{tt('tabPlayers', { n: tournament.participants.length })}</> },
        { id: 'history' as const, label: <><Icon name="history" size={14} />{tt('tabHistory')}</> },
    ];

    return (
        <div className="spinly-tour-live">
            <header className="spinly-tour-top">
                <div className="spinly-tour-titles">
                    <span className="spinly-tour-badge"><Icon name="trophy" size={14} />{config.name || tt('badge')}</span>
                    <span className={`spinly-tour-chip${current ? ' spinly-tour-chip--live' : ''}`}><i aria-hidden="true" />{topStatus}</span>
                    <span className="spinly-tour-count"><Icon name="users" size={14} />{tt('playersCount', { n: tournament.participants.length })}</span>
                </div>
                <div className="spinly-tour-controls">
                    <SegmentedToggle<View> className="spinly-tour-tabs" ariaLabel={tt('viewsAria')} value={view} options={views} onChange={setView} />
                    <button
                        type="button"
                        className={`spinly-tour-tool${config.quickSpin ? ' spinly-tour-tool--on' : ''}`}
                        aria-pressed={config.quickSpin}
                        onClick={() => onChange({ ...tournament, config: { ...config, quickSpin: !config.quickSpin } })}
                        disabled={spinning}
                    >
                        <Icon name="zap" size={14} />
                        <span>{tt('quickSpin')}</span>
                    </button>
                    <button type="button" className="spinly-tour-icon-btn" onClick={() => { setLastWon(null); onChange(undoLast(tournament)); }} disabled={spinning || !tournament.events.length} aria-label={tt('undo')} title={tt('undo')}>
                        <Icon name="undo" size={16} />
                    </button>
                    <button
                        type="button"
                        className={`spinly-tour-icon-btn${confirmRestart ? ' spinly-tour-icon-btn--armed' : ''}`}
                        onClick={restart}
                        disabled={spinning}
                        aria-label={confirmRestart ? tt('restartConfirm') : tt('restart')}
                        title={confirmRestart ? tt('restartConfirm') : tt('restart')}
                    >
                        <Icon name="restart" size={16} />
                    </button>
                    <button type="button" className="spinly-tour-icon-btn" onClick={onNew} disabled={spinning} aria-label={tt('configure')} title={tt('configure')}>
                        <Icon name="sliders" size={16} />
                    </button>
                </div>
            </header>

            <div className="spinly-tour-body">
                <div className="spinly-tour-main">
                    <section className="spinly-tour-card spinly-tour-board">
                        {view === 'bracket' && (
                            <>
                                <div className="spinly-tour-board-head">
                                    <h3><Icon name="bracket" size={16} />{tt('bracketTitle')}</h3>
                                    <span>{tt('phaseInfo', { n: config.bestOf, f: config.finalBestOf })}</span>
                                </div>
                                <div className="spinly-tour-board-scroll">
                                    <TournamentBracket bracket={bracket} people={people} />
                                </div>
                            </>
                        )}
                        {view === 'players' && <PlayersView tournament={tournament} bracket={bracket} people={people} />}
                        {view === 'history' && <HistoryView tournament={tournament} bracket={bracket} people={people} />}
                    </section>
                    <dl className="spinly-tour-stats">
                        <div className="spinly-tour-stat"><dt>{tt('statSpins')}</dt><dd>{stats.spins}</dd></div>
                        <div className="spinly-tour-stat"><dt>{tt('statAverage')}</dt><dd>{decimal(stats.averageMs / 1000)} s</dd></div>
                        <div className="spinly-tour-stat"><dt>{tt('statComebacks')}</dt><dd>{percent(stats.comebackRate)}%</dd></div>
                        <div className="spinly-tour-stat"><dt>{tt('statProgress')}</dt><dd>{bracket.decided} / {bracket.playable}</dd></div>
                    </dl>
                </div>

                <aside className="spinly-tour-duel">
                    <div className="spinly-tour-card spinly-duel-head">
                        {[a, b].map((person, index) => (
                            <div key={index} className={`spinly-duel-side spinly-duel-side--${index ? 'b' : 'a'}`}>
                                <span className="spinly-match-dot" style={{ backgroundColor: person ? colorCss(person.color) : undefined }} />
                                <span className="spinly-duel-side-text">
                                    <strong>{person?.name ?? tt('tbd')}</strong>
                                    <span style={{ color: person ? `color-mix(in srgb, ${colorCss(person.color)} 70%, var(--font-color))` : undefined }}>
                                        {tt('probability', { pct: percent(index ? 1 - probability : probability) })}
                                    </span>
                                </span>
                            </div>
                        ))}
                        <div className="spinly-duel-score">
                            <span className="spinly-duel-score-box">
                                <b style={{ color: a ? `color-mix(in srgb, ${colorCss(a.color)} 70%, var(--font-color))` : undefined }}>{current?.winsA ?? 0}</b>
                                <i>-</i>
                                <b style={{ color: b ? `color-mix(in srgb, ${colorCss(b.color)} 70%, var(--font-color))` : undefined }}>{current?.winsB ?? 0}</b>
                            </span>
                            <span className="spinly-duel-score-info">{current ? tt('duelInfo', { n: current.bestOf, k: current.spins.length + 1 }) : tt('statusDone')}</span>
                        </div>
                    </div>

                    <DuelWheel
                        a={a}
                        b={b}
                        probability={probability}
                        quickSpin={config.quickSpin}
                        disabled={!current}
                        onSpinStart={() => { setSpinning(true); setLastWon(null); }}
                        onResult={(winner, ms) => { setSpinning(false); record(winner, ms); }}
                        onColorChange={onColorChange}
                    />

                    {status && <p className="spinly-duel-status" role="status" aria-live="polite">{status}</p>}

                    {config.referee && current && a && b && (
                        <div className="spinly-duel-referee">
                            <button type="button" className="spinly-duel-force" onClick={() => record('a', 0, true)} disabled={spinning} aria-label={tt('forceAria', { name: a.name })}>
                                <Icon name="flag" size={13} />{tt('force', { name: a.name })}
                            </button>
                            <span className="spinly-duel-referee-label">{tt('refereeMode')}</span>
                            <button type="button" className="spinly-duel-force spinly-duel-force--b" onClick={() => record('b', 0, true)} disabled={spinning} aria-label={tt('forceAria', { name: b.name })}>
                                {tt('force', { name: b.name })}<Icon name="flag" size={13} />
                            </button>
                        </div>
                    )}
                </aside>
            </div>

            {showChampion && champion && (
                <ChampionOverlay
                    name={people.get(champion)?.name ?? ''}
                    tournamentName={config.name}
                    onClose={() => setShowChampion(false)}
                    onNew={() => { setShowChampion(false); onNew(); }}
                />
            )}
        </div>
    );
}

export default TournamentLive;
