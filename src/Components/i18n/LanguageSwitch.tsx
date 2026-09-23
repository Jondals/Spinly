import Icon, { type IconName } from '../common/Icon';
import SegmentedToggle from '../common/SegmentedToggle';
import { useTranslation } from './LanguageProvider';
import type { SpinlyLang } from '../../scripts/strings';

// Cada idioma se nombra en su propia lengua: así lo reconoce quien no entiende el idioma activo.
const LANGUAGES: ReadonlyArray<{ id: SpinlyLang; name: string; flag: IconName }> = [
    { id: 'en', name: 'English', flag: 'flagGb' },
    { id: 'es', name: 'Español', flag: 'flagEs' },
];

interface LanguageSwitchProps {
    /** button: bandera del idioma activo que alterna (cabecera). choice: selector con ambos (drawer móvil). */
    variant: 'button' | 'choice';
    className?: string;
}

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
                    label: <><Icon name={flag} className="spinly-flag" />{name}</>,
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
            aria-label={t('header', 'switchLang')}
            title={t('header', 'switchLang')}
        >
            <Icon name={current.flag} className="spinly-flag" />
        </button>
    );
}

export default LanguageSwitch;
