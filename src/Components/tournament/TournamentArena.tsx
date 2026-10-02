/**
 * TournamentArena: the stage where the current duel is played.
 *
 * The two rivals face each other on both sides of the wheel, each in their own color: their seed, a big
 * name, a big score, one pip per spin win needed, their slice of the wheel and (in referee mode) a button
 * to award them the duel. Side A is on the left and owns the left half of the wheel; side B, the right.
 * Under the wheel, one line says what is at stake and which duel comes next. Once there is a champion the
 * arena turns into the podium.
 */
import type { CSSProperties } from 'react';
import Icon from '../common/Icon';
import DuelWheel from './DuelWheel';
import type { WheelColorField } from '../wheel/Wheel';
import { colorCss, upcomingMatch, winsNeeded, type Bracket, type Participant, type Side } from '../../scripts/tournament';
import { useTournamentText } from '../../scripts/tournament-strings';
import { matchRoundName } from './TournamentViews';

interface TournamentArenaProps {
    bracket: Bracket;
    people: Map<string, Participant>;
    probability: number;
    quickSpin: boolean;
    referee: boolean;
    spinning: boolean;
    /** Name of whoever just won a duel, announced until the next spin. */
    lastWon: string | null;
    /** Formats a 0-1 fraction as a percentage for the active language. */
    percent: (fraction: number) => string;
    onSpinStart: () => void;
    onRecord: (winner: Side, ms: number, forced?: boolean) => void;
    onNew: () => void;
    onRestart: () => void;
    onColorChange: (field: WheelColorField, color: string) => void;
}

interface FighterProps {
    person: Participant | undefined;
    side: Side;
    wins: number;
    need: number;
    share: string;
    /** Leading the duel right now. */
    ahead: boolean;
    referee: boolean;
    spinning: boolean;
    onForce: () => void;
}

/** One rival: seed, name, score, win pips, slice of the wheel and the referee button. */
function Fighter({ person, side, wins, need, share, ahead, referee, spinning, onForce }: FighterProps) {
    const { tt } = useTournamentText();
    const name = person?.name ?? tt('tbd');
    return (
        <div className={`tour-fighter tour-fighter--${side}${ahead ? ' tour-fighter--ahead' : ''}`}>
            <span className="tour-fighter-seed">{person ? tt('seed', { n: person.seed }) : '—'}</span>
            <strong className="tour-fighter-name">{name}</strong>
            <span className="tour-fighter-score" aria-label={tt('winsAria', { name, wins, need })}>{wins}</span>
            <span className="tour-fighter-pips" aria-hidden="true">
                {Array.from({ length: need }, (_, i) => <i key={i} className={i < wins ? 'tour-pip--on' : undefined} />)}
            </span>
            <span className="tour-fighter-share">{tt('probability', { pct: share })}</span>
            {referee && person && (
                <button
                    type="button"
                    className="tour-fighter-force"
                    onClick={onForce}
                    disabled={spinning}
                    title={tt('forceAria', { name })}
                >
                    <Icon name="flag" size={13} />
                    {tt('force', { name })}
                </button>
            )}
        </div>
    );
}

/** The champion's podium, shown in place of the duel once the tournament is over. */
function Podium({ bracket, people, onNew, onRestart }: Pick<TournamentArenaProps, 'bracket' | 'people' | 'onNew' | 'onRestart'>) {
    const { tt } = useTournamentText();
    const final = bracket.rounds[bracket.rounds.length - 1][0];
    const winner = bracket.champion ? people.get(bracket.champion) : undefined;
    const runnerUp = final.loser ? people.get(final.loser) : undefined;
    const third = bracket.third?.winner ? people.get(bracket.third.winner) : undefined;
    return (
        <section className="tour-arena tour-arena--done" style={{ '--a': colorCss(winner?.color), '--b': colorCss(winner?.color) } as CSSProperties}>
            <div className="tour-podium">
                <span className="tour-podium-trophy"><Icon name="trophy" size={44} /></span>
                <span className="tour-podium-label">{tt('champion')}</span>
                <strong className="tour-podium-name">{winner?.name ?? tt('tbd')}</strong>
                <ul className="tour-podium-places">
                    {runnerUp && <li><b>2</b>{runnerUp.name}</li>}
                    {third && <li><b>3</b>{third.name}</li>}
                </ul>
                <p className="tour-podium-text">{tt('finishedText')}</p>
                <div className="tour-podium-actions">
                    <button type="button" className="spinly-btn-primary tour-cta" onClick={onNew}>
                        <Icon name="plus" />
                        {tt('configure')}
                    </button>
                    <button type="button" className="tour-ghost-btn" onClick={onRestart}>
                        <Icon name="restart" size={15} />
                        {tt('restartShort')}
                    </button>
                </div>
            </div>
        </section>
    );
}

/** The arena: the current duel (or the podium once there is a champion). */
function TournamentArena({ bracket, people, probability, quickSpin, referee, spinning, lastWon, percent, onSpinStart, onRecord, onNew, onRestart, onColorChange }: TournamentArenaProps) {
    const { tt, roundLabel } = useTournamentText();
    const { current } = bracket;
    if (!current) return <Podium bracket={bracket} people={people} onNew={onNew} onRestart={onRestart} />;

    const a = current.a ? people.get(current.a) : undefined;
    const b = current.b ? people.get(current.b) : undefined;
    const need = winsNeeded(current.bestOf);
    const duelNumber = Math.min(bracket.decided + 1, bracket.playable);

    // What is at stake right now, in one sentence.
    const status = (() => {
        if (spinning) return tt('statusSpinning');
        if (!a || !b) return '';
        if (!current.spins.length) return lastWon ? tt('statusWon', { name: lastWon }) : tt('statusReady');
        const pointA = current.winsA === need - 1;
        const pointB = current.winsB === need - 1;
        if (pointA && pointB) return tt('statusDecider');
        if (pointA || pointB) return tt('statusMatchPoint', { name: (pointA ? a : b).name });
        const last = current.spins[current.spins.length - 1];
        return tt('statusPoint', { name: (last === 'a' ? a : b).name });
    })();
    const tense = !spinning && current.spins.length > 0 && (current.winsA === need - 1 || current.winsB === need - 1);

    const next = upcomingMatch(bracket);
    /** Name of a participant of the next duel, or "To be decided". */
    const nextName = (id: string | null) => (id ? people.get(id)?.name : undefined) ?? tt('tbd');
    const style = { '--a': colorCss(a?.color), '--b': colorCss(b?.color) } as CSSProperties;

    return (
        <section className="tour-arena" style={style}>
            <div className="tour-arena-head">
                <span className="tour-arena-round">{tt('statusDuel', { round: roundLabel(matchRoundName(bracket, current)), n: duelNumber, total: bracket.playable })}</span>
                <span className="tour-arena-format">{tt('firstTo', { n: current.bestOf, k: need })}</span>
                <span className="tour-arena-help">{tt('arenaHelp')}</span>
            </div>
            <div className="tour-arena-stage">
                <Fighter
                    person={a}
                    side="a"
                    wins={current.winsA}
                    need={need}
                    share={percent(probability)}
                    ahead={current.winsA > current.winsB}
                    referee={referee}
                    spinning={spinning}
                    onForce={() => onRecord('a', 0, true)}
                />
                <div className="tour-arena-center">
                    <DuelWheel
                        a={a}
                        b={b}
                        probability={probability}
                        quickSpin={quickSpin}
                        disabled={false}
                        onSpinStart={onSpinStart}
                        onResult={(winner, ms) => onRecord(winner, ms)}
                        onColorChange={onColorChange}
                    />
                </div>
                <Fighter
                    person={b}
                    side="b"
                    wins={current.winsB}
                    need={need}
                    share={percent(1 - probability)}
                    ahead={current.winsB > current.winsA}
                    referee={referee}
                    spinning={spinning}
                    onForce={() => onRecord('b', 0, true)}
                />
            </div>
            <div className="tour-arena-foot">
                <p className={`tour-arena-status${tense ? ' tour-arena-status--tense' : ''}`} role="status" aria-live="polite">{status}</p>
                {next && (
                    <p className="tour-arena-next">
                        <span>{tt('upNext')}</span>
                        {nextName(next.a)} <em>vs</em> {nextName(next.b)}
                    </p>
                )}
            </div>
        </section>
    );
}

export default TournamentArena;
