import { lazy, Suspense, useId, useState } from 'react';
import Icon, { type IconName } from '../common/Icon';
import PanelHeader from '../common/PanelHeader';
import SegmentedToggle from '../common/SegmentedToggle';
import {
    BEST_OF_CHOICES,
    colorCss,
    MAX_PARTICIPANT_NAME,
    MAX_PARTICIPANTS,
    MAX_TOURNAMENT_NAME,
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

const ColorPicker = lazy(() => import('../editor/ColorPicker'));

export interface SetupEntry {
    key: string;
    name: string;
    color: ParticipantColor;
}

let entryCounter = 0;
export const newEntry = (name: string, index: number): SetupEntry => ({
    key: `e${(entryCounter += 1)}`,
    name: name.slice(0, MAX_PARTICIPANT_NAME),
    color: PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length],
});

// Estilos predefinidos: la forma rápida de elegir formato. Si luego se toca algo, pasa a "Personalizado".
const STYLES: ReadonlyArray<{ id: string; icon: IconName; title: TournamentTextKey; desc: TournamentTextKey; config: Partial<TournamentConfig> }> = [
    { id: 'quick', icon: 'zap', title: 'styleQuick', desc: 'styleQuickDesc', config: { bestOf: 1, finalBestOf: 1, thirdPlace: false, quickSpin: true } },
    { id: 'classic', icon: 'trophy', title: 'styleClassic', desc: 'styleClassicDesc', config: { bestOf: 3, finalBestOf: 5, thirdPlace: false, quickSpin: false } },
    { id: 'epic', icon: 'flag', title: 'styleEpic', desc: 'styleEpicDesc', config: { bestOf: 5, finalBestOf: 7, thirdPlace: true, quickSpin: false } },
];

const matchesStyle = (config: TournamentConfig, style: Partial<TournamentConfig>) =>
    (Object.keys(style) as Array<keyof TournamentConfig>).every((key) => config[key] === style[key]);

/** Color de un participante en hex, para el selector (la paleta vive en variables CSS). */
const toHex = (color: ParticipantColor): string =>
    color.startsWith('#') ? color : getComputedStyle(document.documentElement).getPropertyValue(`--item-${color}`).trim() || '#6366f1';

interface TournamentSetupProps {
    initialConfig: TournamentConfig;
    initialEntries: SetupEntry[];
    wheelNames: string[];
    onStart: (config: TournamentConfig, entries: Array<{ name: string; color: ParticipantColor }>) => void;
}

/**
 * Interruptor compacto (checkbox real, accesible con teclado): una píldora con su nombre. La
 * explicación va en el `title` (aparece al pasar el ratón) y, para quien usa lector de pantalla,
 * en un texto que no se ve pero sí se lee.
 */
function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (value: boolean) => void }) {
    const descId = useId();
    return (
        <label className={`spinly-tour-switch${checked ? ' spinly-tour-switch--on' : ''}`} title={desc}>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-describedby={descId} />
            <span className="spinly-tour-switch-track" aria-hidden="true"><span className="spinly-tour-switch-thumb" /></span>
            <span className="spinly-tour-switch-label">{label}</span>
            <span id={descId} className="spinly-tour-sr">{desc}</span>
        </label>
    );
}

/** Opciones grandes con título y explicación (un radiogroup). `stacked`: una debajo de otra, para columnas estrechas. */
function ChoiceCards<T extends string>({ label, value, options, onChange, stacked = false }: {
    label: string;
    value: T;
    options: ReadonlyArray<{ id: T; icon: IconName; title: string; desc: string }>;
    onChange: (value: T) => void;
    stacked?: boolean;
}) {
    return (
        <div className={`spinly-tour-choices${stacked ? ' spinly-tour-choices--stacked' : ''}`} role="radiogroup" aria-label={label}>
            {options.map((option) => {
                const active = option.id === value;
                return (
                    <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`spinly-tour-choice${active ? ' spinly-tour-choice--active' : ''}`}
                        onClick={() => onChange(option.id)}
                    >
                        <span className="spinly-tour-choice-icon"><Icon name={option.icon} size={16} /></span>
                        <span className="spinly-tour-choice-text">
                            <strong>{option.title}</strong>
                            <span>{option.desc}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** Configuración del torneo en dos pasos: quién juega y cómo. Todo se explica donde se elige. */
function TournamentSetup({ initialConfig, initialEntries, wheelNames, onStart }: TournamentSetupProps) {
    const { tt } = useTournamentText();
    const [config, setConfig] = useState<TournamentConfig>(initialConfig);
    const [entries, setEntries] = useState<SetupEntry[]>(initialEntries);
    const [picker, setPicker] = useState<{ key: string; anchor: HTMLElement; color: string } | null>(null);
    // Cerrado de entrada cuando un estilo cubre la configuración; abierto si ya venía personalizada
    // (por ejemplo, al volver a configurar un torneo anterior), para que no quede nada escondido.
    const [rulesOpen, setRulesOpen] = useState(() => !STYLES.some((style) => matchesStyle(initialConfig, style.config)));
    const set = <K extends keyof TournamentConfig>(key: K, value: TournamentConfig[K]) => setConfig((prev) => ({ ...prev, [key]: value }));

    const named = entries.filter((entry) => entry.name.trim());
    const count = named.length;
    const size = 2 ** Math.ceil(Math.log2(Math.max(2, count)));
    const canStart = count >= MIN_PARTICIPANTS;
    const full = entries.length >= MAX_PARTICIPANTS;
    const duels = Math.max(0, count - 1) + (config.thirdPlace && count >= 4 ? 1 : 0);
    const activeStyle = STYLES.find((style) => matchesStyle(config, style.config));
    const label = (entry: SetupEntry, index: number) => entry.name || tt('participantName', { n: index + 1 });

    const update = (key: string, patch: Partial<SetupEntry>) => setEntries((prev) => prev.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
    const add = () => {
        if (full) return;
        setEntries((prev) => [...prev, newEntry(tt('participantName', { n: prev.length + 1 }), prev.length)]);
    };
    const fromWheel = () => setEntries(wheelNames.slice(0, MAX_PARTICIPANTS).map((name, index) => newEntry(name, index)));
    const shuffle = () => setEntries((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [next[i], next[j]] = [next[j], next[i]];
        }
        return next;
    });

    const bestOfOptions = BEST_OF_CHOICES.map((n) => ({ id: String(n), label: String(n) }));
    const winsText = (bestOf: number) => (bestOf === 1 ? tt('duelsDescOne') : tt('duelsDesc', { k: winsNeeded(bestOf) }));
    // Resumen de una línea, visible con las reglas plegadas: lo que ya está elegido no desaparece.
    const rulesSummary = tt('rulesSummary', {
        bestOf: tt('bestOfN', { n: config.bestOf }),
        finalBestOf: tt('bestOfN', { n: config.finalBestOf }),
        odds: config.odds === 'equal' ? tt('oddsEqual') : tt('oddsSeed'),
        seeding: config.seeding === 'random' ? tt('seedingRandom') : tt('seedingOrder'),
    });

    // Vista previa de la primera ronda: con orden de lista, exacta; con sorteo, se avisa.
    const order = seedOrder(size);
    const pairs = Array.from({ length: size / 2 }, (_, slot) => [named[order[slot * 2] - 1], named[order[slot * 2 + 1] - 1]] as const);
    const shownPairs = pairs.slice(0, 8);

    return (
        <div className="spinly-tour-setup">
            <section className="spinly-tour-card spinly-tour-setup-players">
                <PanelHeader icon="users" title={tt('stepPlayers')} badge={`${count} / ${MAX_PARTICIPANTS}`} />
                <p className="spinly-tour-desc spinly-tour-setup-hint">{tt('playersHint')}</p>
                <div className="spinly-tour-setup-tools">
                    <button type="button" className="spinly-tour-ghost" onClick={fromWheel} disabled={wheelNames.length < MIN_PARTICIPANTS}>
                        <Icon name="spin" size={14} />
                        {tt('fromWheel')}
                    </button>
                    <button type="button" className="spinly-tour-ghost" onClick={shuffle} disabled={entries.length < 2}>
                        <Icon name="restart" size={14} />
                        {tt('shuffle')}
                    </button>
                    <button type="button" className="spinly-tour-ghost" onClick={() => setEntries([])} disabled={!entries.length}>
                        <Icon name="trash" size={14} />
                        {tt('clearAll')}
                    </button>
                </div>
                <ol className="spinly-tour-entries">
                    {entries.map((entry, index) => (
                        <li key={entry.key} className="spinly-tour-entry spinly-panel-card">
                            <span className="spinly-tour-entry-seed">{index + 1}</span>
                            <button
                                type="button"
                                className="spinly-tour-swatch"
                                style={{ backgroundColor: colorCss(entry.color) }}
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
                                onChange={(event) => update(entry.key, { name: event.target.value })}
                                aria-label={tt('participantAria', { n: index + 1 })}
                            />
                            <button
                                type="button"
                                className="spinly-tour-entry-remove"
                                onClick={() => setEntries((prev) => prev.filter((item) => item.key !== entry.key))}
                                aria-label={tt('removeParticipant', { name: label(entry, index) })}
                            >×</button>
                        </li>
                    ))}
                </ol>
                <div className="spinly-tour-setup-add">
                    <button type="button" className="spinly-tour-add" onClick={add} disabled={full} title={full ? tt('maxParticipants', { max: MAX_PARTICIPANTS }) : undefined}>
                        <Icon name="plus" />
                        {tt('addParticipant')}
                    </button>
                </div>
            </section>

            <section className="spinly-tour-card spinly-tour-setup-format">
                <PanelHeader icon="trophy" title={tt('stepFormat')} badge={activeStyle ? tt(activeStyle.title) : tt('styleCustom')} />
                <div className="spinly-tour-form">
                    <label className="spinly-tour-field">
                        <span className="spinly-tour-label">{tt('nameLabel')}</span>
                        <input
                            className="spinly-field-input"
                            value={config.name}
                            maxLength={MAX_TOURNAMENT_NAME}
                            placeholder={tt('namePlaceholder')}
                            onChange={(event) => set('name', event.target.value)}
                        />
                    </label>

                    <div className="spinly-tour-field">
                        <span className="spinly-tour-label">{tt('styleLabel')}</span>
                        <div className="spinly-tour-styles">
                            {STYLES.map((style) => {
                                const active = activeStyle?.id === style.id;
                                return (
                                    <button
                                        key={style.id}
                                        type="button"
                                        aria-pressed={active}
                                        className={`spinly-tour-style${active ? ' spinly-tour-style--active' : ''}`}
                                        onClick={() => setConfig((prev) => ({ ...prev, ...style.config }))}
                                    >
                                        <Icon name={style.icon} size={18} />
                                        <strong>{tt(style.title)}</strong>
                                        <span>{tt(style.desc)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="spinly-tour-group">
                        <div className="spinly-tour-switches">
                            <Toggle label={tt('thirdPlace')} desc={tt('thirdPlaceDesc')} checked={config.thirdPlace} onChange={(value) => set('thirdPlace', value)} />
                            <Toggle label={tt('referee')} desc={tt('refereeDesc')} checked={config.referee} onChange={(value) => set('referee', value)} />
                            <Toggle label={tt('quickSpin')} desc={tt('quickSpinDesc')} checked={config.quickSpin} onChange={(value) => set('quickSpin', value)} />
                        </div>
                        <button
                            type="button"
                            className="spinly-tour-disclosure"
                            aria-expanded={rulesOpen}
                            aria-controls="spinly-tour-rules"
                            onClick={() => setRulesOpen((open) => !open)}
                        >
                            <Icon name="chevronUp" size={14} className={rulesOpen ? undefined : 'spinly-tour-disclosure-icon'} />
                            {tt('adjustRules')}
                            {!rulesOpen && <span className="spinly-tour-disclosure-summary">{rulesSummary}</span>}
                        </button>
                        {rulesOpen && (
                            <div id="spinly-tour-rules" className="spinly-tour-rules">
                                <div className="spinly-tour-field-row">
                                    <div className="spinly-tour-field">
                                        <span className="spinly-tour-field-title">{tt('duels')} · {tt('bestOfN', { n: config.bestOf })}</span>
                                        <SegmentedToggle kind="choice" ariaLabel={tt('duels')} value={String(config.bestOf)} options={bestOfOptions} onChange={(value) => set('bestOf', Number(value))} />
                                        <p className="spinly-tour-desc">{winsText(config.bestOf)}</p>
                                    </div>
                                    <div className="spinly-tour-field">
                                        <span className="spinly-tour-field-title">{tt('final')} · {tt('bestOfN', { n: config.finalBestOf })}</span>
                                        <SegmentedToggle kind="choice" ariaLabel={tt('final')} value={String(config.finalBestOf)} options={bestOfOptions} onChange={(value) => set('finalBestOf', Number(value))} />
                                        <p className="spinly-tour-desc">{winsText(config.finalBestOf)}</p>
                                    </div>
                                </div>
                                <div className="spinly-tour-field-row">
                                    <div className="spinly-tour-field">
                                        <span className="spinly-tour-field-title">{tt('oddsQuestion')}</span>
                                        <ChoiceCards<OddsMode>
                                            label={tt('oddsLabel')}
                                            value={config.odds}
                                            onChange={(value) => set('odds', value)}
                                            stacked
                                            options={[
                                                { id: 'equal', icon: 'spin', title: tt('oddsEqual'), desc: tt('oddsEqualDesc') },
                                                { id: 'seed', icon: 'trophy', title: tt('oddsSeed'), desc: tt('oddsSeedDesc') },
                                            ]}
                                        />
                                    </div>
                                    <div className="spinly-tour-field">
                                        <span className="spinly-tour-field-title">{tt('seedingQuestion')}</span>
                                        <ChoiceCards<SeedingMode>
                                            label={tt('seedingLabel')}
                                            value={config.seeding}
                                            onChange={(value) => set('seeding', value)}
                                            stacked
                                            options={[
                                                { id: 'random', icon: 'restart', title: tt('seedingRandom'), desc: tt('seedingRandomDesc') },
                                                { id: 'order', icon: 'users', title: tt('seedingOrder'), desc: tt('seedingOrderDesc') },
                                            ]}
                                        />
                                    </div>
                                </div>
                                {canStart && (
                                    <div className="spinly-tour-field">
                                        <span className="spinly-tour-field-title">{tt('previewLabel')}</span>
                                        {config.seeding === 'random' ? (
                                            <p className="spinly-tour-desc">{tt('previewDrawn')}</p>
                                        ) : (
                                            <ul className="spinly-tour-preview">
                                                {shownPairs.map(([a, b], slot) => (
                                                    <li key={slot}>
                                                        <span><i style={{ backgroundColor: colorCss(a?.color) }} />{a?.name}</span>
                                                        <em>{b ? 'vs' : '→'}</em>
                                                        <span className={b ? undefined : 'spinly-tour-preview-bye'}>{b ? <><i style={{ backgroundColor: colorCss(b.color) }} />{b.name}</> : tt('stateBye')}</span>
                                                    </li>
                                                ))}
                                                {pairs.length > shownPairs.length && <li className="spinly-tour-preview-more">{tt('previewMore', { n: pairs.length - shownPairs.length })}</li>}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <div className="spinly-tour-setup-start">
                    <p className="spinly-tour-hint" role="status">
                        {canStart ? tt('summary', { n: count, duels, size }) : tt('needMore', { min: MIN_PARTICIPANTS })}
                    </p>
                    <button
                        type="button"
                        className="spinly-btn-primary spinly-tour-start"
                        disabled={!canStart}
                        onClick={() => onStart(config, named.map((entry) => ({ name: entry.name.trim(), color: entry.color })))}
                    >
                        <Icon name="trophy" />
                        {tt('start')}
                    </button>
                </div>
            </section>

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
