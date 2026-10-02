/**
 * TournamentSetup: the form shown before a tournament starts.
 *
 * Left, who plays: a fixed field to add participants and one colored tile per participant (or the wheel
 * options in one click), in seed order. Right, how they play, with every rule in view: a style preset
 * (Quick, Classic, Epic) that fills in the rules, how many spins each duel has (best of 1 to 10), how the
 * pairs are made, whether everyone has the same chances and the extras, then one line that sums it all up
 * above the start button.
 */
import { lazy, Suspense, useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import Icon, { type IconName } from '../common/Icon';
import {
    clampBestOf,
    colorCss,
    MAX_BEST_OF,
    MAX_PARTICIPANT_NAME,
    MAX_PARTICIPANTS,
    MAX_TOURNAMENT_NAME,
    maxSpins,
    MIN_BEST_OF,
    MIN_PARTICIPANTS,
    PARTICIPANT_COLORS,
    seedOrder,
    winsNeeded,
    type OddsMode,
    type ParticipantColor,
    type SeedingMode,
    type TournamentConfig,
} from '../../scripts/tournament';
import { useTournamentText, type TournamentTextKey } from '../../scripts/tournament-strings';
import { selectOnFocus } from '../../hooks/selectOnFocus';

const ColorPicker = lazy(() => import('../editor/ColorPicker'));

export interface SetupEntry {
    key: string;
    name: string;
    color: ParticipantColor;
}

let entryCounter = 0;
/** A new row of the participant list, with a unique key and the next palette color. */
export const newEntry = (name: string, index: number): SetupEntry => ({
    key: `e${(entryCounter += 1)}`,
    name: name.slice(0, MAX_PARTICIPANT_NAME),
    color: PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length],
});

// Style presets: the quick way to pick a format. Changing any rule afterwards turns it into "Custom".
const STYLES: ReadonlyArray<{ id: string; icon: IconName; title: TournamentTextKey; desc: TournamentTextKey; config: Partial<TournamentConfig> }> = [
    { id: 'quick', icon: 'zap', title: 'styleQuick', desc: 'styleQuickDesc', config: { bestOf: 1, finalBestOf: 1, thirdPlace: false, quickSpin: true } },
    { id: 'classic', icon: 'trophy', title: 'styleClassic', desc: 'styleClassicDesc', config: { bestOf: 3, finalBestOf: 5, thirdPlace: false, quickSpin: false } },
    { id: 'epic', icon: 'flag', title: 'styleEpic', desc: 'styleEpicDesc', config: { bestOf: 5, finalBestOf: 7, thirdPlace: true, quickSpin: false } },
];

/** True when every rule of a style preset matches the config. */
const matchesStyle = (config: TournamentConfig, style: Partial<TournamentConfig>) =>
    (Object.keys(style) as Array<keyof TournamentConfig>).every((key) => config[key] === style[key]);

/** A participant color as hex, for the color picker (palette colors live in CSS variables). */
const toHex = (color: ParticipantColor): string =>
    color.startsWith('#') ? color : getComputedStyle(document.documentElement).getPropertyValue(`--item-${color}`).trim() || '#6366f1';

interface TournamentSetupProps {
    initialConfig: TournamentConfig;
    initialEntries: SetupEntry[];
    wheelNames: string[];
    onStart: (config: TournamentConfig, entries: Array<{ name: string; color: ParticipantColor }>) => void;
}

/**
 * A switch row: a real checkbox (keyboard accessible) drawn as a switch, with its name and, below it,
 * what it does. The description is linked with aria-describedby so it is not part of the name.
 */
function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (value: boolean) => void }) {
    const labelId = useId();
    const descId = useId();
    return (
        <label className={`tour-switch${checked ? ' tour-switch--on' : ''}`}>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-labelledby={labelId} aria-describedby={descId} />
            <span className="tour-switch-track" aria-hidden="true"><span className="tour-switch-thumb" /></span>
            <span className="tour-switch-text">
                <span id={labelId} className="tour-switch-label">{label}</span>
                <span id={descId} className="tour-switch-desc">{desc}</span>
            </span>
        </label>
    );
}

/**
 * A plain question with two answers (a radiogroup). The chosen answer's explanation shows right below,
 * so there is always one sentence saying what the current choice does.
 */
function Question<T extends string>({ question, value, options, onChange, children }: {
    question: string;
    value: T;
    options: ReadonlyArray<{ id: T; icon: IconName; title: string; desc: string }>;
    onChange: (value: T) => void;
    children?: ReactNode;
}) {
    const titleId = useId();
    const chosen = options.find((option) => option.id === value);
    return (
        <div className="tour-question">
            <p id={titleId} className="tour-question-title">{question}</p>
            <div className="tour-answers" role="radiogroup" aria-labelledby={titleId}>
                {options.map((option) => {
                    const active = option.id === value;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            className={`tour-answer${active ? ' tour-answer--active' : ''}`}
                            onClick={() => onChange(option.id)}
                        >
                            <Icon name={option.icon} size={16} />
                            {option.title}
                        </button>
                    );
                })}
            </div>
            {chosen && <p className="tour-answer-desc">{chosen.desc}</p>}
            {children}
        </div>
    );
}

/** "Best of N" as a stepper: minus, the number (typed freely, 1 to 10), plus, and what it means. */
function BestOfStepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
    const { tt } = useTournamentText();
    const labelId = useId();
    const [draft, setDraft] = useState(String(value));
    // A preset or the other buttons can change the value from outside: the field follows it.
    useEffect(() => setDraft(String(value)), [value]);

    /** Applies a typed value as soon as it is a valid number; anything else waits for the blur. */
    const type = (raw: string) => {
        setDraft(raw);
        const number = Number(raw);
        if (raw.trim() !== '' && Number.isInteger(number) && number >= MIN_BEST_OF && number <= MAX_BEST_OF) onChange(number);
    };

    const meaning = value === 1 ? tt('duelsDescOne') : tt('duelsDesc', { k: winsNeeded(value), m: maxSpins(value) });
    return (
        <div className="tour-stepper">
            <div className="tour-stepper-row">
                <span className="tour-stepper-text">
                    <span id={labelId} className="tour-stepper-label">{label}</span>
                    <span className="tour-stepper-prefix" aria-hidden="true">{tt('bestOfPrefix')}</span>
                </span>
                <div className="tour-stepper-control">
                    <button type="button" onClick={() => onChange(clampBestOf(value - 1))} disabled={value <= MIN_BEST_OF} aria-label={tt('fewer', { label })}>
                        <span aria-hidden="true">−</span>
                    </button>
                    <input
                        type="number"
                        inputMode="numeric"
                        min={MIN_BEST_OF}
                        max={MAX_BEST_OF}
                        value={draft}
                        aria-labelledby={labelId}
                        onChange={(event) => type(event.target.value)}
                        onBlur={() => {
                            const fixed = clampBestOf(Number(draft));
                            setDraft(String(fixed));
                            onChange(fixed);
                        }}
                    />
                    <button type="button" onClick={() => onChange(clampBestOf(value + 1))} disabled={value >= MAX_BEST_OF} aria-label={tt('more', { label })}>
                        <span aria-hidden="true">+</span>
                    </button>
                </div>
            </div>
            <p className="tour-stepper-meaning">{meaning}</p>
        </div>
    );
}

/** The tournament setup: who plays and how, with every rule explained where it is chosen. */
function TournamentSetup({ initialConfig, initialEntries, wheelNames, onStart }: TournamentSetupProps) {
    const { tt, lang } = useTournamentText();
    const [config, setConfig] = useState<TournamentConfig>(initialConfig);
    const [entries, setEntries] = useState<SetupEntry[]>(initialEntries);
    const [picker, setPicker] = useState<{ key: string; anchor: HTMLElement; color: string } | null>(null);
    // Name typed in the fixed "add participant" field.
    const [draftName, setDraftName] = useState('');
    /** Updates one rule of the config. */
    const set = <K extends keyof TournamentConfig>(key: K, value: TournamentConfig[K]) => setConfig((prev) => ({ ...prev, [key]: value }));

    const named = entries.filter((entry) => entry.name.trim());
    const count = named.length;
    const size = 2 ** Math.ceil(Math.log2(Math.max(2, count)));
    const canStart = count >= MIN_PARTICIPANTS;
    const full = entries.length >= MAX_PARTICIPANTS;
    const duels = Math.max(0, count - 1) + (config.thirdPlace && count >= 4 ? 1 : 0);
    const activeStyle = STYLES.find((style) => matchesStyle(config, style.config));
    /** Display name of a row (its placeholder when empty). */
    const label = (entry: SetupEntry, index: number) => entry.name || tt('participantName', { n: index + 1 });

    /** Patches one row of the participant list. */
    const update = (key: string, patch: Partial<SetupEntry>) => setEntries((prev) => prev.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
    /** Adds the typed participant (or a numbered one if the field is empty) at the end, up to MAX_PARTICIPANTS. */
    const add = () => {
        if (full) return;
        const name = draftName.trim();
        setEntries((prev) => [...prev, newEntry(name || tt('participantName', { n: prev.length + 1 }), prev.length)]);
        setDraftName('');
    };
    /** Replaces the list with the current wheel options. */
    const fromWheel = () => setEntries(wheelNames.slice(0, MAX_PARTICIPANTS).map((name, index) => newEntry(name, index)));
    /** Shuffles the list (Fisher-Yates), which also shuffles the seeds. */
    const shuffle = () => setEntries((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [next[i], next[j]] = [next[j], next[i]];
        }
        return next;
    });

    // Seed odds example: the top of the list against the last one (strengths n and 1).
    const players = Math.max(count, 2);
    const examplePct = String(Math.round((players / (players + 1)) * 1000) / 10).replace('.', lang === 'es' ? ',' : '.');

    // First-round preview with list order (with a random draw there is nothing to show yet).
    const order = seedOrder(size);
    const pairs = Array.from({ length: size / 2 }, (_, slot) => [named[order[slot * 2] - 1], named[order[slot * 2 + 1] - 1]] as const);
    const shownPairs = pairs.slice(0, 8);

    return (
        <div className="tour-setup">
            <header className="tour-setup-head">
                <span className="tour-icon-tile" aria-hidden="true"><Icon name="trophy" size={20} /></span>
                <div className="tour-setup-head-text">
                    <h2>{tt('setupTitle')}</h2>
                    <p>{tt('setupSubtitle')}</p>
                </div>
            </header>

            <div className="tour-setup-grid">
                <section className="tour-panel tour-setup-players">
                    <div className="tour-panel-head">
                        <h3>{tt('participantsTitle')}</h3>
                        <span className="tour-count">{count} / {MAX_PARTICIPANTS}</span>
                    </div>

                    <form
                        className="tour-add"
                        onSubmit={(event) => {
                            event.preventDefault();
                            add();
                        }}
                    >
                        <input
                            className="spinly-field-input"
                            value={draftName}
                            maxLength={MAX_PARTICIPANT_NAME}
                            placeholder={tt('participantName', { n: entries.length + 1 })}
                            onChange={(event) => setDraftName(event.target.value)}
                            aria-label={tt('newParticipant')}
                            disabled={full}
                        />
                        <button type="submit" className="spinly-action-btn tour-add-btn" disabled={full} title={full ? tt('maxParticipants', { max: MAX_PARTICIPANTS }) : undefined}>
                            <Icon name="plus" size={15} />
                            {tt('addParticipant')}
                        </button>
                    </form>

                    <ol className="tour-roster">
                        {entries.map((entry, index) => (
                            <li key={entry.key} className="tour-player" style={{ '--side': colorCss(entry.color) } as CSSProperties}>
                                <span className="tour-player-seed">{index + 1}</span>
                                <button
                                    type="button"
                                    className="tour-player-swatch"
                                    onClick={(event) => {
                                        const anchor = event.currentTarget;
                                        setPicker((open) => (open?.key === entry.key ? null : { key: entry.key, anchor, color: toHex(entry.color) }));
                                    }}
                                    aria-label={tt('changeColor', { name: label(entry, index) })}
                                    aria-expanded={picker?.key === entry.key}
                                    title={tt('changeColor', { name: label(entry, index) })}
                                />
                                <input
                                    value={entry.name}
                                    maxLength={MAX_PARTICIPANT_NAME}
                                    placeholder={tt('participantName', { n: index + 1 })}
                                    {...selectOnFocus}
                                    onChange={(event) => update(entry.key, { name: event.target.value })}
                                    aria-label={tt('participantAria', { n: index + 1 })}
                                />
                                <button
                                    type="button"
                                    className="tour-player-remove"
                                    onClick={() => setEntries((prev) => prev.filter((item) => item.key !== entry.key))}
                                    aria-label={tt('removeParticipant', { name: label(entry, index) })}
                                >
                                    <Icon name="close" size={13} />
                                </button>
                            </li>
                        ))}
                    </ol>
                    {!entries.length && <p className="tour-hint tour-roster-empty">{tt('rosterEmpty')}</p>}

                    <div className="tour-setup-tools">
                        <button type="button" className="spinly-action-btn" onClick={fromWheel} disabled={wheelNames.length < MIN_PARTICIPANTS}>
                            <Icon name="spin" size={14} />
                            {tt('fromWheel')}
                        </button>
                        <button type="button" className="spinly-action-btn" onClick={shuffle} disabled={entries.length < 2}>
                            <Icon name="restart" size={14} />
                            {tt('shuffle')}
                        </button>
                        <button type="button" className="spinly-action-btn" onClick={() => setEntries([])} disabled={!entries.length}>
                            <Icon name="trash" size={14} />
                            {tt('clearAll')}
                        </button>
                    </div>
                </section>

                <section className="tour-panel tour-setup-format">
                    <div className="tour-panel-head">
                        <h3>{tt('formatTitle')}</h3>
                        <span className="tour-count">{activeStyle ? tt(activeStyle.title) : tt('styleCustom')}</span>
                    </div>

                    <input
                        className="spinly-field-input"
                        value={config.name}
                        maxLength={MAX_TOURNAMENT_NAME}
                        placeholder={tt('namePlaceholder')}
                        onChange={(event) => set('name', event.target.value)}
                        aria-label={tt('nameLabel')}
                    />

                    <div className="tour-styles" role="group" aria-label={tt('styleLabel')}>
                        {STYLES.map((style) => {
                            const active = activeStyle?.id === style.id;
                            return (
                                <button
                                    key={style.id}
                                    type="button"
                                    aria-pressed={active}
                                    className={`tour-style tour-style--${style.id}${active ? ' tour-style--active' : ''}`}
                                    onClick={() => setConfig((prev) => ({ ...prev, ...style.config }))}
                                >
                                    <span className="tour-style-icon"><Icon name={style.icon} size={16} /></span>
                                    <span className="tour-style-text">
                                        <strong>{tt(style.title)}</strong>
                                        <span>{tt(style.desc)}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="tour-steppers">
                        <BestOfStepper label={tt('roundsLabel')} value={config.bestOf} onChange={(value) => set('bestOf', value)} />
                        <BestOfStepper label={tt('finalLabel')} value={config.finalBestOf} onChange={(value) => set('finalBestOf', value)} />
                    </div>

                    <div className="tour-questions">
                        <Question<SeedingMode>
                            question={tt('seedingQuestion')}
                            value={config.seeding}
                            onChange={(value) => set('seeding', value)}
                            options={[
                                { id: 'random', icon: 'restart', title: tt('seedingRandom'), desc: tt('seedingRandomDesc') },
                                { id: 'order', icon: 'users', title: tt('seedingOrder'), desc: tt('seedingOrderDesc') },
                            ]}
                        />
                        <Question<OddsMode>
                            question={tt('oddsQuestion')}
                            value={config.odds}
                            onChange={(value) => set('odds', value)}
                            options={[
                                { id: 'equal', icon: 'spin', title: tt('oddsEqual'), desc: tt('oddsEqualDesc') },
                                { id: 'seed', icon: 'trophy', title: tt('oddsSeed'), desc: tt('oddsSeedDesc', { last: players, pct: examplePct }) },
                            ]}
                        />
                    </div>

                    {config.seeding === 'order' && canStart && (
                        <div className="tour-preview-box">
                            <span className="tour-label">{tt('previewLabel')}</span>
                            <ul className="tour-preview">
                                {shownPairs.map(([a, b], slot) => (
                                    <li key={slot}>
                                        <span><i style={{ backgroundColor: colorCss(a?.color) }} />{a?.name}</span>
                                        <em>{b ? 'vs' : '→'}</em>
                                        <span className={b ? undefined : 'tour-preview-bye'}>{b ? <><i style={{ backgroundColor: colorCss(b.color) }} />{b.name}</> : tt('stateBye')}</span>
                                    </li>
                                ))}
                                {pairs.length > shownPairs.length && <li className="tour-preview-more">{tt('previewMore', { n: pairs.length - shownPairs.length })}</li>}
                            </ul>
                        </div>
                    )}

                    <div className="tour-switches">
                        <Toggle label={tt('thirdPlace')} desc={tt('thirdPlaceDesc')} checked={config.thirdPlace} onChange={(value) => set('thirdPlace', value)} />
                        <Toggle label={tt('referee')} desc={tt('refereeDesc')} checked={config.referee} onChange={(value) => set('referee', value)} />
                        <Toggle label={tt('quickSpin')} desc={tt('quickSpinDesc')} checked={config.quickSpin} onChange={(value) => set('quickSpin', value)} />
                    </div>

                    <div className="tour-start-zone">
                        <p className="tour-hint" role="status">
                            {canStart ? tt('readyText', { n: count, duels, f: config.finalBestOf }) : tt('needMore', { min: MIN_PARTICIPANTS })}
                        </p>
                        <button
                            type="button"
                            className="spinly-btn-primary tour-start"
                            disabled={!canStart}
                            onClick={() => onStart(config, named.map((entry) => ({ name: entry.name.trim(), color: entry.color })))}
                        >
                            <Icon name="trophy" />
                            {tt('start')}
                        </button>
                    </div>
                </section>
            </div>

            {picker && (
                <Suspense fallback={null}>
                    <ColorPicker
                        key={picker.key}
                        color={picker.color}
                        onChange={(hex) => update(picker.key, { color: hex as ParticipantColor })}
                        onClose={() => setPicker(null)}
                        anchorEl={picker.anchor}
                    />
                </Suspense>
            )}
        </div>
    );
}

export default TournamentSetup;
