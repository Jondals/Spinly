/**
 * LanguageSwitch: the English / Spanish switch (a flag button in the header, a toggle in the mobile menu).
 */
import Icon, { type IconName } from '../common/Icon';
import SegmentedToggle from '../common/SegmentedToggle';
import { useTranslation } from './LanguageProvider';
import type { SpinlyLang } from '../../scripts/strings';

// Each language is named in itself, so people who do not understand the active language still recognise it.
const LANGUAGES: ReadonlyArray<{ id: SpinlyLang; name: string; flag: IconName }> = [
    { id: 'en', name: 'English', flag: 'flagGb' },
    { id: 'es', name: 'Español', flag: 'flagEs' },
];

interface LanguageSwitchProps {
    /** button: flag of the active language that toggles it (header). choice: a toggle with both (mobile drawer). */
    variant: 'button' | 'choice';
    className?: string;
}

/** Renders the language switch in the requested variant. */
function LanguageSwitch({ variant, className = '' }: LanguageSwitchProps) {
    const { lang, setLang, t } = useTranslation();

    if (variant === 'choice') {
        return (
            <SegmentedToggle<SpinlyLang>
                kind="choice"
                className={`spinly-lang-choice ${className}`.trim()}
                ariaLabel={t('header', 'language')}
                value={lang}
                onChange={setLang}
                options={LANGUAGES.map(({ id, name, flag }) => ({
                    id,
                    label: <><Icon name={flag} className="spinly-flag" />{name}<span className="spinly-lang-code" aria-hidden="true">{id.toUpperCase()}</span></>,
                }))}
            />
        );
    }

    const current = LANGUAGES.find((item) => item.id === lang) ?? LANGUAGES[0];
    return (
        <button
            type="button"
            className={`spinly-lang ${className}`.trim()}
            onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
            // The accessible name starts with the visible code (EN/ES), as accessibility guidelines require.
            aria-label={`${current.id.toUpperCase()} · ${t('header', 'switchLang')}`}
            title={t('header', 'switchLang')}
        >
            <Icon name={current.flag} className="spinly-flag" />
            <span className="spinly-lang-code">{current.id.toUpperCase()}</span>
        </button>
    );
}

export default LanguageSwitch;
