import type { CSSProperties } from 'react';
import Icon from '../common/Icon';
import { colorCss, roundName, type Bracket, type Match, type Participant } from '../../scripts/tournament';
import { useTournamentText } from '../../scripts/tournament-strings';

interface TournamentBracketProps {
    bracket: Bracket;
    people: Map<string, Participant>;
}

/** Tarjeta de un duelo en el cuadro: los dos participantes, el marcador y su estado. */
function MatchCard({ match, people, current, next }: { match: Match; people: Map<string, Participant>; current: boolean; next: boolean }) {
    const { tt } = useTournamentText();
    const rows = [
        { id: match.a, wins: match.winsA },
        { id: match.b, wins: match.winsB },
    ];
    const state = match.bye
        ? tt('stateBye')
        : match.winner
            ? match.forced ? tt('stateForced') : tt('stateDone')
            : current ? tt('stateActive') : next ? tt('stateNext') : '';
    return (
        <div className={`spinly-match${current ? ' spinly-match--live' : ''}${match.winner ? ' spinly-match--done' : ''}${match.bye ? ' spinly-match--bye' : ''}`}>
            {current && <span className="spinly-match-live">{tt('stateLive')}</span>}
            {rows.map((row, index) => {
                const person = row.id ? people.get(row.id) : undefined;
                const won = Boolean(match.winner && row.id === match.winner);
                const lost = Boolean(match.winner && row.id && row.id !== match.winner);
                return (
                    <div key={index} className={`spinly-match-row${won ? ' spinly-match-row--won' : ''}${lost ? ' spinly-match-row--lost' : ''}`}>
                        <span className="spinly-match-dot" style={{ backgroundColor: person ? colorCss(person.color) : undefined }} />
                        <span className="spinly-match-name">{person?.name ?? (match.bye ? '—' : tt('tbd'))}</span>
                        <span className="spinly-match-score">{match.bye || !person ? '' : row.wins}</span>
                    </div>
                );
            })}
            {state && <span className="spinly-match-state">{state}</span>}
        </div>
    );
}

/**
 * Cuadro eliminatorio: una columna por ronda, cada duelo centrado entre los dos que lo alimentan y
 * unido a ellos con líneas (CSS), y al final la tarjeta del campeón y, si lo hay, el tercer puesto.
 */
function TournamentBracket({ bracket, people }: TournamentBracketProps) {
    const { tt, roundLabel } = useTournamentText();
    const { rounds, current, champion, third } = bracket;
    const final = rounds[rounds.length - 1][0];
    // El siguiente duelo que se jugará tras el actual (para marcarlo como "Próximo").
    const queue = [...rounds.slice(0, -1).flat(), ...(third ? [third] : []), final];
    const upcoming = queue.find((match) => match !== current && !match.winner && !match.bye && queue.indexOf(match) > queue.indexOf(current ?? final));
    const championPerson = champion ? people.get(champion) : undefined;
    const finalists = [final.a, final.b].map((id) => (id ? people.get(id) : undefined));

    return (
        <div className="spinly-bracket" style={{ '--bracket-rounds': rounds.length } as CSSProperties}>
            {rounds.map((round, index) => {
                const isFinal = index === rounds.length - 1;
                const pairs: Match[][] = isFinal ? [round] : Array.from({ length: round.length / 2 }, (_, p) => round.slice(p * 2, p * 2 + 2));
                return (
                    <div key={index} className={`spinly-bracket-round${index > 0 ? ' spinly-bracket-round--fed' : ''}`}>
                        <p className="spinly-bracket-round-title">{roundLabel(roundName(index, rounds.length))}</p>
                        <div className="spinly-bracket-column">
                            {pairs.map((pair, p) => (
                                <div key={p} className={`spinly-bracket-pair${isFinal ? ' spinly-bracket-pair--final' : ''}`}>
                                    {pair.map((match) => (
                                        <div key={match.id} className="spinly-bracket-slot">
                                            <MatchCard match={match} people={people} current={match === current} next={match === upcoming} />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
            <div className="spinly-bracket-round spinly-bracket-round--podium">
                <p className="spinly-bracket-round-title">{tt('champion')}</p>
                <div className="spinly-bracket-column spinly-bracket-column--podium">
                    <div className={`spinly-champion${championPerson ? ' spinly-champion--crowned' : ''}`}>
                        <span className="spinly-champion-icon"><Icon name="trophy" size={22} /></span>
                        <strong className="spinly-champion-name">{championPerson?.name ?? tt('champion')}</strong>
                        <span className="spinly-champion-sub">{championPerson ? tt('roundFinal') : tt('tbd')}</span>
                        <ul className="spinly-champion-finalists">
                            {finalists.map((person, index) => (
                                <li key={index} className={person && champion && person.id !== champion ? 'spinly-champion-finalist--out' : undefined}>
                                    <span className="spinly-match-dot" style={{ backgroundColor: person ? colorCss(person.color) : undefined }} />
                                    {person?.name ?? tt('finalist', { n: index + 1 })}
                                </li>
                            ))}
                        </ul>
                    </div>
                    {third && (
                        <div className="spinly-bracket-third">
                            <p className="spinly-bracket-round-title">{roundLabel('third')}</p>
                            <MatchCard match={third} people={people} current={third === current} next={third === upcoming} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default TournamentBracket;
