/**
 * Header: the top bar with the logo, language switch, settings (volumes, light mode and music), profile
 * menu and, on mobile, the hamburger button that opens the wheel manager drawer.
 */
import LanguageSwitch from '../i18n/LanguageSwitch';
import ProfileMenu from './ProfileMenu';
import SettingsMenu from './SettingsMenu';
import { useTranslation } from '../i18n/LanguageProvider';
import '../../css/Header.css';

interface HeaderProps {
    isMenuOpen: boolean;
    onToggleMenu: () => void;
}

/** Renders the app header. */
function Header({ isMenuOpen, onToggleMenu }: HeaderProps) {
    const { t } = useTranslation();

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
                {/* On mobile the language is picked inside the drawer */}
                <LanguageSwitch variant="button" className="spinly-lang--header" />

                <SettingsMenu />

                <ProfileMenu />

                {/* Mobile only, where the manager is a drawer: the last one, on the right edge */}
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
            </div>
        </header>
    );
}

export default Header;
