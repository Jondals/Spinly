/**
 * Secondary tournament views shown in the board next to the bracket:
 * - StandingsView: every participant with their current position and record.
 * - HistoryView: every spin, newest first, with the running score of its duel.
 */
import type { CSSProperties } from 'react';
import Icon from '../common/Icon';
import {
    allMatches,
    colorCss,
    roundName,
    winsNeeded,
    type Bracket,
    type Match,
    type Participant,
    type Tournament,
} from '../../scripts/tournament';
import { useTournamentText } from '../../scripts/tournament-strings';

interface ViewProps {
    tournament: Tournament;
    bracket: Bracket;
    people: Map<string, Participant>;
}

type Tone = 'gold' | 'silver' | 'bronze' | 'live' | 'alive' | 'out';

/** Round name of a match, for labels. */
export const matchRoundName = (bracket: Bracket, match: Match) => roundName(match.round, bracket.rounds.length, match.third);

/** Participants sorted by how far they got: podium first, then who is still in, then who is out. */
export function StandingsView({ tournament, bracket, people }: ViewProps) {
    const { tt, roundLabel } = useTournamentText();
    const matches = allMatches(bracket);
    const final = bracket.rounds[bracket.rounds.length - 1][0];
    const order: Record<Tone, number> = { gold: 0, silver: 1, bronze: 2, live: 3, alive: 4, out: 5 };

    const rows = tournament.participants.map((person) => {
        const played = matches.filter((match) => !match.bye && (match.a === person.id || match.b === person.id));
        const duels = played.filter((match) => match.winner === person.id).length;
        const spins = played.reduce((sum, match) => sum + (match.a === person.id ? match.winsA : match.winsB), 0);
        const lostMain = matches.find((match) => !match.third && match.loser === person.id);
        const waitsThird = bracket.third && !bracket.third.winner && (bracket.third.a === person.id || bracket.third.b === person.id);
        let rank: string;
        let tone: Tone;
        // How deep they went, so people knocked out later rank above those knocked out earlier.
        let depth = 0;
        if (bracket.champion === person.id) { rank = tt('rankChampion'); tone = 'gold'; }
        else if (final.winner && final.loser === person.id) { rank = tt('rankRunnerUp'); tone = 'silver'; }
        else if (bracket.third?.winner === person.id) { rank = tt('rankThird'); tone = 'bronze'; }
        else if (bracket.current && (bracket.current.a === person.id || bracket.current.b === person.id)) { rank = tt('rankPlaying'); tone = 'live'; }
        else if (lostMain && !waitsThird) {
            const outIn = bracket.third?.loser === person.id ? bracket.third : lostMain;
            rank = tt('rankOut', { round: roundLabel(matchRoundName(bracket, outIn)).toLowerCase() });
            tone = 'out';
            depth = lostMain.round;
        } else { rank = tt('rankAlive'); tone = 'alive'; }
        return { person, duels, spins, rank, tone, depth };
    }).sort((x, y) => order[x.tone] - order[y.tone] || y.depth - x.depth || x.person.seed - y.person.seed);

    return (
        <ol className="tour-standings">
            {rows.map(({ person, duels, spins, rank, tone }) => (
                <li
                    key={person.id}
                    className={`tour-standing tour-standing--${tone}`}
                    style={{ '--side': colorCss(person.color) } as CSSProperties}
                >
                    <span className="tour-standing-seed" title={tt('seed', { n: person.seed })}>#{person.seed}</span>
                    <span className="tour-standing-main">
                        <strong>{person.name}</strong>
                        <span>{tt('record', { duels, spins })}</span>
                    </span>
                    <span className={`tour-rank tour-rank--${tone}`}>
                        {(tone === 'gold' || tone === 'silver' || tone === 'bronze') && <Icon name="trophy" size={12} />}
                        {rank}
                    </span>
                </li>
            ))}
        </ol>
    );
}

/** Every spin, newest first, with the score of its duel at that moment. */
export function HistoryView({ tournament, bracket, people }: ViewProps) {
    const { tt, roundLabel } = useTournamentText();
    const matches = new Map(allMatches(bracket).map((match) => [match.id, match]));
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
            round: roundLabel(matchRoundName(bracket, match)),
            a: people.get(match.a)?.name ?? '',
            b: people.get(match.b)?.name ?? '',
            text: event.forced ? tt('historyForced', { name }) : won ? tt('historyWon', { name, score: `${Math.max(...next)}–${Math.min(...next)}` }) : tt('historySpin', { name }),
            tally: `${next[0]} – ${next[1]}`,
            forced: Boolean(event.forced),
            won,
        });
    });
    if (!items.length) {
        return (
            <p className="tour-empty">
                <Icon name="history" size={22} />
                {tt('historyEmpty')}
            </p>
        );
    }
    return (
        <ol className="tour-history">
            {items.reverse().map((item) => (
                <li key={item.key} className={`tour-history-item${item.won ? ' tour-history-item--won' : ''}`}>
                    <span className="tour-history-round">{item.round}</span>
                    <span className="tour-history-duel">{item.a} <em>vs</em> {item.b}</span>
                    <span className="tour-history-text">{item.forced && <Icon name="flag" size={12} />}{item.text}</span>
                    <span className="tour-history-tally">{item.tally}</span>
                </li>
            ))}
        </ol>
    );
}
