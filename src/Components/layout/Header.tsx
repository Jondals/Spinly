import Icon from '../common/Icon';
import LanguageSwitch from '../i18n/LanguageSwitch';
import ProfileMenu from './ProfileMenu';
import { useTranslation } from '../i18n/LanguageProvider';
import { useColorScheme } from '../../hooks/useColorScheme';
import '../../css/Header.css';

interface HeaderProps {
    isMenuOpen: boolean;
    onToggleMenu: () => void;
}

function Header({ isMenuOpen, onToggleMenu }: HeaderProps) {
    const { t } = useTranslation();
    const { scheme, toggle: toggleScheme } = useColorScheme();

    return (
        <header className="Header">
            <img
                src="/Images/spinly-logo-64.webp"
                srcSet="/Images/spinly-logo-64.webp 64w, /Images/spinly-logo-128.webp 128w"
                sizes="(max-width: 750px) 2rem, 2.5rem"
                width={64}
                height={63}
                alt={t('header', 'logoAlt')}
                className="spinly-logo"
            />
            <h1>Spinly</h1>

            <div className="spinly-actions">
                {/* Solo en móvil, donde el gestor es un drawer */}
                <button
                    type="button"
                    className={`spinly-menu-button ${isMenuOpen ? 'spinly-menu-button--open' : ''}`}
                    onClick={onToggleMenu}
                    aria-label={isMenuOpen ? t('header', 'closeMenu') : t('header', 'openMenu')}
                    aria-expanded={isMenuOpen}
                    aria-controls="wheelmanager-body"
                >
                    <span className="hamburger-line" aria-hidden="true" />
                    <span className="hamburger-line" aria-hidden="true" />
                    <span className="hamburger-line" aria-hidden="true" />
                </button>

                {/* En móvil el idioma se elige dentro del drawer */}
                <LanguageSwitch variant="button" className="spinly-lang--header" />

                <button type="button" className="spinly-theme" onClick={toggleScheme} aria-label={t('header', 'toggleTheme')}>
                    <Icon name={scheme === 'dark' ? 'sun' : 'moon'} size={32} />
                </button>

                <ProfileMenu />
            </div>
        </header>
    );
}

export default Header;
