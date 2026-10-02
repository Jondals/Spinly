/**
 * TournamentLive: the tournament being played.
 *
 * Top to bottom: a slim bar (name, round, one progress segment per duel and the actions), the arena with
 * the current duel (TournamentArena) and the board with the bracket, the standings or the history plus a
 * few stats. Every change goes through `onChange` with a new Tournament, which the parent saves; the
 * bracket is always derived from it with buildBracket.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import SegmentedToggle from '../common/SegmentedToggle';
import TournamentArena from './TournamentArena';
import type { WheelColorField } from '../wheel/Wheel';
import TournamentBracket from './TournamentBracket';
import { HistoryView, matchRoundName, StandingsView } from './TournamentViews';
import { playDuelWin, playFanfare, playWin } from '../../scripts/sound';
import {
    addEvent,
    allMatches,
    buildBracket,
    colorCss,
    playOrder,
    probabilityA,
    restartTournament,
    tournamentStats,
    undoLast,
    type Participant,
    type Side,
    type Tournament,
} from '../../scripts/tournament';
import { useTournamentText } from '../../scripts/tournament-strings';

type View = 'bracket' | 'players' | 'history';

// Restarting asks for a second click within this time, like deleting in the app's lists.
const CONFIRM_MS = 2600;

interface TournamentLiveProps {
    tournament: Tournament;
    onChange: (next: Tournament) => void;
    onNew: () => void;
    onColorChange: (field: WheelColorField, color: string) => void;
}

// Confetti pieces of the champion celebration: position, delay, drift and color, fixed per piece.
const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    delay: `${((i * 0.13) % 1.6).toFixed(2)}s`,
    drift: `${((i % 7) - 3) * 14}px`,
    color: ['var(--item-amber)', 'var(--item-pink)', 'var(--item-sky)', 'var(--item-mint)', 'var(--item-violet)'][i % 5],
}));

interface ChampionOverlayProps {
    champion: Participant;
    runnerUp: Participant | undefined;
    third: Participant | undefined;
    tournamentName: string;
    onClose: () => void;
    onNew: () => void;
}

/** Champion celebration: confetti, the trophy, the champion's name, the podium and what to do next. */
function ChampionOverlay({ champion, runnerUp, third, tournamentName, onClose, onNew }: ChampionOverlayProps) {
    const { tt } = useTournamentText();
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement>(null);
    return (
        <Modal
            labelledBy={titleId}
            onClose={onClose}
            backdropClassName="wheel-overlay tour-champion-backdrop"
            className="tour-champion"
            initialFocus={closeRef}
        >
            <span className="tour-confetti" aria-hidden="true">
                {CONFETTI.map((piece, i) => (
                    <i key={i} style={{ left: piece.left, animationDelay: piece.delay, '--drift': piece.drift, background: piece.color } as CSSProperties} />
                ))}
            </span>
            <span className="tour-champion-glow" aria-hidden="true" style={{ '--side': colorCss(champion.color) } as CSSProperties} />
            <span className="tour-champion-trophy" aria-hidden="true"><Icon name="trophy" size={46} /></span>
            <span className="tour-champion-badge">{tt('championBadge')}</span>
            <p id={titleId} className="tour-champion-name">{champion.name}</p>
            {tournamentName && <p className="tour-champion-of">{tt('championOf', { name: tournamentName })}</p>}
            {(runnerUp || third) && (
                <ul className="tour-champion-podium">
                    {runnerUp && <li><b>2</b>{runnerUp.name}</li>}
                    {third && <li><b>3</b>{third.name}</li>}
                </ul>
            )}
            <div className="tour-champion-actions">
                <button ref={closeRef} type="button" className="tour-ghost-btn tour-champion-btn" onClick={onClose}>
                    <Icon name="bracket" size={16} />
                    {tt('viewBracket')}
                </button>
                <button type="button" className="spinly-btn-primary tour-cta" onClick={onNew}>
                    <Icon name="plus" />
                    {tt('configure')}
                </button>
            </div>
        </Modal>
    );
}

/** Slim top bar, the arena and the board. */
function TournamentLive({ tournament, onChange, onNew, onColorChange }: TournamentLiveProps) {
    const { tt, roundLabel, lang } = useTournamentText();
    const [view, setView] = useState<View>('bracket');
    const [spinning, setSpinning] = useState(false);
    const [lastWon, setLastWon] = useState<string | null>(null);
    const [showChampion, setShowChampion] = useState(false);
    const [confirmRestart, setConfirmRestart] = useState(false);
    const confirmTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

    /** The bracket is always derived from the saved tournament. */
    const bracket = useMemo(() => buildBracket(tournament), [tournament]);
    /** Participants by id. */
    const people = useMemo(() => new Map(tournament.participants.map((person) => [person.id, person])), [tournament.participants]);
    const stats = tournamentStats(tournament, bracket);
    const { current, champion } = bracket;
    const probability = current ? probabilityA(tournament, current) : 0.5;
    const { config } = tournament;

    /** Records a spin (or a referee decision) and announces it if it decides the duel or the tournament. */
    const record = (winner: Side, ms: number, forced = false) => {
        setSpinning(false);
        if (!current) return;
        const next = addEvent(tournament, { match: current.id, winner, ms, forced: forced || undefined });
        const after = buildBracket(next);
        const decided = allMatches(after).find((match) => match.id === current.id);
        // A sound for every result: a spin, a duel won, or the whole tournament.
        if (after.champion) playFanfare();
        else if (decided?.winner) playDuelWin();
        else playWin();
        if (decided?.winner) setLastWon(people.get(decided.winner)?.name ?? null);
        if (after.champion) setShowChampion(true);
        onChange(next);
    };

    /** Restarts right away (from the podium, where nothing is lost). */
    const restartNow = () => {
        window.clearTimeout(confirmTimer.current);
        setConfirmRestart(false);
        setLastWon(null);
        onChange(restartTournament(tournament));
    };

    /** First click arms the restart button; a second one within CONFIRM_MS restarts the tournament. */
    const restart = () => {
        if (!confirmRestart) {
            setConfirmRestart(true);
            window.clearTimeout(confirmTimer.current);
            confirmTimer.current = window.setTimeout(() => setConfirmRestart(false), CONFIRM_MS);
            return;
        }
        restartNow();
    };

    /** At most one decimal, with a decimal comma in Spanish: 0.5 → "0.5" / "0,5", 50 → "50". */
    const decimal = (value: number) => {
        const rounded = String(Math.round(value * 10) / 10);
        return lang === 'es' ? rounded.replace('.', ',') : rounded;
    };
    /** A 0-1 fraction as a percentage with at most one decimal. */
    const percent = (fraction: number) => decimal(fraction * 100);

    const championName = champion ? people.get(champion)?.name ?? '' : '';
    const finalMatch = bracket.rounds[bracket.rounds.length - 1][0];
    // The bar names the round; the arena says which duel of it is being played.
    const topStatus = current
        ? roundLabel(matchRoundName(bracket, current))
        : championName ? tt('statusChampion', { name: championName }) : tt('statusDone');
    // One progress segment per duel that is actually played, in play order.
    const segments = playOrder(bracket).filter((match) => !match.bye);
    const views = [
        { id: 'bracket' as const, label: <><Icon name="bracket" size={14} />{tt('tabBracket')}</> },
        { id: 'players' as const, label: <><Icon name="users" size={14} />{tt('tabPlayers')}</> },
        { id: 'history' as const, label: <><Icon name="history" size={14} />{tt('tabHistory')}</> },
    ];

    return (
        <div className="tour-live">
            <header className="tour-bar">
                <div className="tour-bar-title">
                    <span className="tour-icon-tile" aria-hidden="true"><Icon name="trophy" size={18} /></span>
                    <div className="tour-bar-text">
                        <h2>{config.name || tt('badge')}</h2>
                        <p>
                            {topStatus}
                            <span aria-hidden="true">·</span>
                            {tt('playersCount', { n: tournament.participants.length })}
                        </p>
                    </div>
                </div>

                <div className="tour-bar-progress">
                    <span className="tour-bar-progress-text">{tt('progress', { n: bracket.decided, total: bracket.playable })}</span>
                    <span
                        className="tour-segments"
                        role="progressbar"
                        aria-label={tt('progress', { n: bracket.decided, total: bracket.playable })}
                        aria-valuemin={0}
                        aria-valuemax={bracket.playable}
                        aria-valuenow={bracket.decided}
                    >
                        {segments.map((match) => (
                            <i key={match.id} className={match.winner ? 'tour-segment--done' : match === current ? 'tour-segment--live' : undefined} />
                        ))}
                    </span>
                </div>

                <div className="tour-bar-actions" role="toolbar" aria-label={tt('toolsAria')}>
                    <button
                        type="button"
                        className={`tour-tool${config.quickSpin ? ' tour-tool--on' : ''}`}
                        aria-pressed={config.quickSpin}
                        onClick={() => onChange({ ...tournament, config: { ...config, quickSpin: !config.quickSpin } })}
                        disabled={spinning}
                        title={tt('quickSpinDesc')}
                    >
                        <Icon name="zap" size={15} />
                        <span>{tt('quickSpin')}</span>
                    </button>
                    <button
                        type="button"
                        className="tour-tool"
                        onClick={() => { setLastWon(null); onChange(undoLast(tournament)); }}
                        disabled={spinning || !tournament.events.length}
                        aria-label={tt('undo')}
                        title={tt('undo')}
                    >
                        <Icon name="undo" size={15} />
                        <span>{tt('undoShort')}</span>
                    </button>
                    <button
                        type="button"
                        className={`tour-tool${confirmRestart ? ' tour-tool--armed' : ''}`}
                        onClick={restart}
                        disabled={spinning}
                        aria-label={confirmRestart ? tt('restartConfirm') : tt('restart')}
                        title={confirmRestart ? tt('restartConfirm') : tt('restart')}
                    >
                        <Icon name="restart" size={15} />
                        <span>{confirmRestart ? tt('restartConfirmShort') : tt('restartShort')}</span>
                    </button>
                    <button type="button" className="tour-tool" onClick={onNew} disabled={spinning} aria-label={tt('configure')} title={tt('configure')}>
                        <Icon name="plus" size={15} />
                        <span>{tt('configureShort')}</span>
                    </button>
                </div>
            </header>

            <TournamentArena
                bracket={bracket}
                people={people}
                probability={probability}
                quickSpin={config.quickSpin}
                referee={config.referee}
                spinning={spinning}
                lastWon={lastWon}
                percent={percent}
                onSpinStart={() => { setSpinning(true); setLastWon(null); }}
                onRecord={record}
                onNew={onNew}
                onRestart={restartNow}
                onColorChange={onColorChange}
            />

            <section className="tour-board" aria-label={tt('bracketTitle')}>
                <div className="tour-board-head">
                    <SegmentedToggle<View> className="tour-tabs" ariaLabel={tt('viewsAria')} value={view} options={views} onChange={setView} />
                    <dl className="tour-stats">
                        <div><dt>{tt('statSpins')}</dt><dd>{stats.spins}</dd></div>
                        <div><dt>{tt('statAverage')}</dt><dd>{decimal(stats.averageMs / 1000)} s</dd></div>
                        <div><dt>{tt('statComebacks')}</dt><dd>{percent(stats.comebackRate)}%</dd></div>
                    </dl>
                </div>
                <p className="tour-board-info">{tt('phaseInfo', { n: config.bestOf, f: config.finalBestOf })}</p>
                <div className="tour-board-body">
                    {view === 'bracket' && <TournamentBracket bracket={bracket} people={people} />}
                    {view === 'players' && <StandingsView tournament={tournament} bracket={bracket} people={people} />}
                    {view === 'history' && <HistoryView tournament={tournament} bracket={bracket} people={people} />}
                </div>
            </section>

            {showChampion && champion && people.get(champion) && (
                <ChampionOverlay
                    champion={people.get(champion) as Participant}
                    runnerUp={finalMatch.loser ? people.get(finalMatch.loser) : undefined}
                    third={bracket.third?.winner ? people.get(bracket.third.winner) : undefined}
                    tournamentName={config.name}
                    onClose={() => setShowChampion(false)}
                    onNew={() => { setShowChampion(false); onNew(); }}
                />
            )}
        </div>
    );
}

export default TournamentLive;
