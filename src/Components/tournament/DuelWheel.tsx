import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import Icon from '../common/Icon';
import Tooltip from '../common/Tooltip';
import { useTranslation } from '../i18n/LanguageProvider';
import { useSoundPreference, useSpinTicks } from '../../hooks/useSpinSound';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useMusicPulse } from '../../hooks/useMusicPulse';
import { useMusic } from '../music/MusicProvider';
import type { WheelColorField } from '../wheel/Wheel';
import { colorCss, spinDuel, type Participant, type Side } from '../../scripts/tournament';
import { useTournamentText } from '../../scripts/tournament-strings';

const ColorPicker = lazy(() => import('../editor/ColorPicker'));

/** Color efectivo de una variable CSS (el del tema activo). */
const cssColor = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000000';

// Giro normal como la ruleta principal (4,2 s) o rápido.
export const DUEL_SPIN_MS = 4200;
export const QUICK_SPIN_MS = 1400;

const RIM_LIGHTS = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 2 * Math.PI;
    return { x: 50 + 48.6 * Math.sin(angle), y: 50 - 48.6 * Math.cos(angle), delay: `${(-(i / 24) * 2.4).toFixed(2)}s` };
});

const colorVar = (participant: Participant | undefined) => colorCss(participant?.color ?? 'indigo');

interface DuelWheelProps {
    a: Participant | undefined;
    b: Participant | undefined;
    /** Probabilidad de A en cada giro (0-1). */
    probability: number;
    quickSpin: boolean;
    /** Sin duelo en juego (torneo terminado): la ruleta queda quieta. */
    disabled: boolean;
    onSpinStart: () => void;
    onResult: (winner: Side, ms: number) => void;
    /** Flecha y luces: los mismos colores del tema que la ruleta principal (se guardan en él). */
    onColorChange: (field: WheelColorField, color: string) => void;
}

/**
 * La ruleta del duelo: el mismo aro, luces y disco que la ruleta principal (clases de Wheel.css), con
 * dos sectores del tamaño de la probabilidad de cada participante. Espacio también gira.
 */
function DuelWheel({ a, b, probability, quickSpin, disabled, onSpinStart, onResult, onColorChange }: DuelWheelProps) {
    const { t } = useTranslation();
    const { tt } = useTournamentText();
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const discRef = useRef<HTMLDivElement>(null);
    const timer = useRef<number | undefined>(undefined);
    const sound = useSoundPreference();
    // Un tic por cada doceavo de vuelta: con solo dos sectores apenas sonaría.
    useSpinTicks(discRef, spinning, 12, sound.enabled);
    const duration = quickSpin ? QUICK_SPIN_MS : DUEL_SPIN_MS;
    // Con música, las luces del aro siguen su ritmo, como en la ruleta principal.
    const music = useMusic();
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const containerRef = useRef<HTMLDivElement>(null);
    const lightsFollowMusic = music.playing && !reducedMotion;
    useMusicPulse(containerRef, lightsFollowMusic);
    const pointerRef = useRef<HTMLButtonElement>(null);
    const lightsRef = useRef<HTMLButtonElement>(null);
    const [picker, setPicker] = useState<{ field: WheelColorField; anchor: HTMLElement; color: string } | null>(null);
    const togglePicker = (field: WheelColorField, anchor: HTMLElement | null) => {
        if (!anchor) return;
        const cssVar = field === 'pointerColor' ? '--wheel-pointer-color' : '--wheel-light-color';
        setPicker((open) => (open?.field === field ? null : { field, anchor, color: cssColor(cssVar) }));
    };

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const spin = () => {
        if (spinning || disabled || !a || !b) return;
        const result = spinDuel(probability, rotation);
        setSpinning(true);
        setRotation(result.rotation);
        onSpinStart();
        timer.current = window.setTimeout(() => {
            setSpinning(false);
            onResult(result.winner, duration);
        }, duration);
    };

    const spinRef = useRef(spin);
    useEffect(() => {
        spinRef.current = spin;
    });

    // Espacio gira el duelo, salvo en campos, botones o diálogos (igual que la ruleta principal).
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.code !== 'Space' && event.key !== ' ') || event.repeat) return;
            const target = event.target as HTMLElement | null;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
            if (target?.closest('button, [role="dialog"]')) return;
            event.preventDefault();
            spinRef.current();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const split = probability * 360;
    const discStyle = {
        background: `conic-gradient(${colorVar(a)} 0deg ${split}deg, ${colorVar(b)} ${split}deg 360deg)`,
        transform: `rotate(${rotation}deg)`,
        transitionDuration: `${duration}ms`,
        '--option-count': 2,
    } as CSSProperties;
    const odds = probability === 0.5
        ? t('wheel', 'oddsEqual', { pct: 50, n: 2 })
        : `${a?.name ?? ''}: ${Math.round(probability * 100)}% · ${b?.name ?? ''}: ${100 - Math.round(probability * 100)}%`;

    return (
        <div className="spinly-duel-wheel">
            <div className="spinly-duel-stage">
                <div
                    ref={containerRef}
                    className={`wheel-container spinly-duel-container${spinning ? ' wheel-container--spinning' : ''}${lightsFollowMusic ? ' wheel-container--music' : ''}`}
                    aria-label={tt('wheelAria', { a: a?.name ?? tt('tbd'), b: b?.name ?? tt('tbd') })}
                    role="group"
                >
                    <button
                        ref={pointerRef}
                        type="button"
                        className="wheel-pointer-btn"
                        onClick={() => togglePicker('pointerColor', pointerRef.current)}
                        aria-label={t('wheel', 'pointerColor')}
                        aria-expanded={picker?.field === 'pointerColor'}
                        title={t('wheel', 'pointerColor')}
                    >
                        <Icon name="pointer" className="wheel-pointer" size={40} />
                    </button>
                    {/* Toda la ruleta abre el color de las luces; la flecha queda por encima con el suyo */}
                    <button
                        ref={lightsRef}
                        type="button"
                        className="wheel-lights-btn"
                        onClick={() => togglePicker('lightColor', lightsRef.current)}
                        aria-label={t('wheel', 'lightsColor')}
                        aria-expanded={picker?.field === 'lightColor'}
                        title={t('wheel', 'lightsColor')}
                    />
                    <svg className="wheel-rim" viewBox="0 0 100 100" aria-hidden="true">
                        {/* Degradados propios: los de la ruleta principal quedan dentro de un display: none */}
                        <defs>
                            <linearGradient id="duel-rim-gradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" className="wheel-rim-stop-top" />
                                <stop offset="1" className="wheel-rim-stop-bottom" />
                            </linearGradient>
                            <radialGradient id="duel-light-halo">
                                <stop offset="0" className="wheel-light-halo-core" />
                                <stop offset="1" className="wheel-light-halo-edge" />
                            </radialGradient>
                        </defs>
                        <circle className="wheel-rim-ring" cx="50" cy="50" r="48.6" />
                        <circle className="wheel-rim-inner" cx="50" cy="50" r="47.1" />
                        {RIM_LIGHTS.map((light, i) => (
                            <circle key={`halo-${i}`} className="wheel-light-halo" cx={light.x} cy={light.y} r="3.2" />
                        ))}
                        {RIM_LIGHTS.map((light, i) => (
                            <circle key={i} className="wheel-light wheel-light--rim" cx={light.x} cy={light.y} r="0.75" style={{ animationDelay: light.delay }} />
                        ))}
                        <circle className="wheel-hub" cx="50" cy="50" r="5" />
                    </svg>
                    <div ref={discRef} className="wheel-disc" style={discStyle}>
                        {[a, b].map((participant, index) => (
                            <span
                                key={index}
                                className="wheel-label"
                                style={{ transform: `rotate(${index === 0 ? split / 2 : split + (360 - split) / 2}deg)` }}
                            >
                                <span className="wheel-label-text">{participant?.name ?? tt('tbd')}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            {picker && (
                <Suspense fallback={null}>
                    <ColorPicker
                        key={picker.field}
                        color={picker.color}
                        onChange={(color) => onColorChange(picker.field, color)}
                        onClose={() => setPicker(null)}
                        anchorEl={picker.anchor}
                        placement={picker.field === 'lightColor' ? 'around' : 'below'}
                    />
                </Suspense>
            )}
            <div className="wheel-spin-zone spinly-duel-spin-zone">
                <button
                    type="button"
                    className={`wheel-spin-button spinly-btn-primary${spinning ? ' wheel-spin-button--spinning' : ''}`}
                    data-sound="none"
                    onClick={spin}
                    disabled={spinning || disabled || !a || !b}
                >
                    <Icon name="spin" className="wheel-spin-icon" />
                    <span className="wheel-spin-button-text">{spinning ? tt('spinning') : tt('spinDuel')}</span>
                </button>
                <div className="wheel-spin-hint">
                    <span className="wheel-spin-key">{t('wheel', 'space')}</span>
                    <span className="wheel-spin-hint-text">{t('wheel', 'toSpin')}</span>
                    <span className="wheel-spin-hint-sep" aria-hidden="true">·</span>
                    <Tooltip className="wheel-spin-odds" ariaLabel={`${t('wheel', 'certified')}: ${t('wheel', 'oddsAria')}`} content={odds}>
                        <Icon name="shieldCheck" className="wheel-spin-hint-icon" />
                        <span className="wheel-spin-hint-text">{t('wheel', 'certified')}</span>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

export default DuelWheel;
