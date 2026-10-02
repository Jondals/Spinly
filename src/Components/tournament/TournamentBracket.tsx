/**
 * TournamentBracket: the knockout bracket drawn as columns, one per round.
 *
 * Each match sits centred between the two that feed it and is joined to them with CSS lines. The
 * last column holds the champion (and the third-place match, if there is one). The duel being played
 * glows, the next one is outlined, winners get a check and losers fade out. When the bracket is wider
 * than the board it scrolls sideways, and it brings the duel in play into view whenever it changes.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import Icon from '../common/Icon';
import { colorCss, roundName, upcomingMatch, type Bracket, type Match, type Participant } from '../../scripts/tournament';
import { useTournamentText } from '../../scripts/tournament-strings';

interface TournamentBracketProps {
    bracket: Bracket;
    people: Map<string, Participant>;
}

/** One match of the bracket: both participants, their spin wins and, if relevant, its state. */
function MatchCard({ match, people, current, next }: { match: Match; people: Map<string, Participant>; current: boolean; next: boolean }) {
    const { tt } = useTournamentText();
    const rows = [
        { id: match.a, wins: match.winsA },
        { id: match.b, wins: match.winsB },
    ];
    const state = current ? tt('stateLive') : next ? tt('stateNext') : match.bye ? tt('stateBye') : match.forced ? tt('stateForced') : '';
    const classes = [
        'tour-match',
        current && 'tour-match--live',
        next && 'tour-match--next',
        match.winner && 'tour-match--done',
        match.bye && 'tour-match--bye',
    ].filter(Boolean).join(' ');
    return (
        <div className={classes}>
            {state && <span className="tour-match-state">{current && <i aria-hidden="true" />}{state}</span>}
            <div className="tour-match-rows">
                {rows.map((row, index) => {
                    const person = row.id ? people.get(row.id) : undefined;
                    const won = Boolean(match.winner && row.id === match.winner);
                    const lost = Boolean(match.winner && row.id && row.id !== match.winner);
                    return (
                        <div
                            key={index}
                            className={`tour-match-row${won ? ' tour-match-row--won' : ''}${lost ? ' tour-match-row--lost' : ''}${person ? '' : ' tour-match-row--empty'}`}
                            style={{ '--side': person ? colorCss(person.color) : 'transparent' } as CSSProperties}
                        >
                            <span className="tour-match-name">{person?.name ?? (match.bye ? '—' : tt('tbd'))}</span>
                            {won && <Icon name="check" size={12} className="tour-match-check" />}
                            <span className="tour-match-score">{match.bye || !person ? '' : row.wins}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** The whole bracket, plus the champion column (and the third-place match). */
function TournamentBracket({ bracket, people }: TournamentBracketProps) {
    const { tt, roundLabel } = useTournamentText();
    const { rounds, current, champion, third } = bracket;
    const upcoming = upcomingMatch(bracket);
    const championPerson = champion ? people.get(champion) : undefined;
    const scrollRef = useRef<HTMLDivElement>(null);

    // Scrolls sideways (only the bracket, never the page) so the duel in play is visible.
    useEffect(() => {
        const scroller = scrollRef.current;
        const live = scroller?.querySelector<HTMLElement>('.tour-match--live');
        if (!scroller || !live || scroller.scrollWidth <= scroller.clientWidth) return;
        const box = scroller.getBoundingClientRect();
        const card = live.getBoundingClientRect();
        if (card.left >= box.left && card.right <= box.right) return;
        const left = scroller.scrollLeft + card.left - box.left - (box.width - card.width) / 2;
        scroller.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, [current?.id]);

    return (
        <div ref={scrollRef} className="tour-bracket-scroll">
            <div className="tour-bracket" style={{ '--bracket-rounds': rounds.length } as CSSProperties}>
                {rounds.map((round, index) => {
                    const isFinal = index === rounds.length - 1;
                    // Matches go in pairs (the two that feed the same match of the next round).
                    const pairs: Match[][] = isFinal ? [round] : Array.from({ length: round.length / 2 }, (_, p) => round.slice(p * 2, p * 2 + 2));
                    return (
                        <div key={index} className={`tour-bracket-round${index > 0 ? ' tour-bracket-round--fed' : ''}`}>
                            <p className="tour-bracket-round-title">{roundLabel(roundName(index, rounds.length))}</p>
                            <div className="tour-bracket-column">
                                {pairs.map((pair, p) => (
                                    <div key={p} className={`tour-bracket-pair${isFinal ? ' tour-bracket-pair--final' : ''}`}>
                                        {pair.map((match) => (
                                            <div key={match.id} className="tour-bracket-slot">
                                                <MatchCard match={match} people={people} current={match === current} next={match === upcoming} />
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
                <div className="tour-bracket-round tour-bracket-round--podium">
                    <p className="tour-bracket-round-title">{tt('champion')}</p>
                    <div className="tour-bracket-column tour-bracket-column--podium">
                        <div
                            className={`tour-crown${championPerson ? ' tour-crown--crowned' : ''}`}
                            style={{ '--side': championPerson ? colorCss(championPerson.color) : undefined } as CSSProperties}
                        >
                            <span className="tour-crown-icon"><Icon name="trophy" size={20} /></span>
                            <strong className="tour-crown-name">{championPerson?.name ?? tt('tbd')}</strong>
                        </div>
                        {third && (
                            <div className="tour-bracket-third">
                                <p className="tour-bracket-round-title">{roundLabel('third')}</p>
                                <MatchCard match={third} people={people} current={third === current} next={third === upcoming} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TournamentBracket;
