import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from '../common/Icon';
import LanguageSwitch from '../i18n/LanguageSwitch';
import { useTranslation } from '../i18n/LanguageProvider';
import { useDismiss } from '../../hooks/useDismiss';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import AudioControls from '../music/AudioControls';
import { MOBILE_QUERY } from '../../scripts/layout';
import '../../css/WheelManager.css';

export type WheelSectionId = 'options' | 'presets' | 'themes';

const SECTIONS: ReadonlyArray<{ id: WheelSectionId; icon: IconName; label: 'editor' | 'presets' | 'themes' }> = [
    { id: 'options', icon: 'sliders', label: 'editor' },
    { id: 'presets', icon: 'bookmark', label: 'presets' },
    { id: 'themes', icon: 'palette', label: 'themes' },
];

// Preferencia del dispositivo, como el idioma: no viaja con la cuenta ni se borra al cerrar sesión.
const CREDIT_HIDDEN_KEY = 'spinly-credit-hidden';
// Coincide con la transición de .wheelmanager-credit--closing (WheelManager.css).
const CREDIT_CLOSE_MS = 260;

const readCreditHidden = (): boolean => {
    try {
        return localStorage.getItem(CREDIT_HIDDEN_KEY) === '1';
    } catch {
        return false;
    }
};

interface WheelManagerProps {
    activeSection: WheelSectionId;
    onSectionChange: (section: WheelSectionId) => void;
    isOpen: boolean;
    isAnimated: boolean;
    onClose: () => void;
}

/** Navegación entre secciones. En escritorio es una columna fija; en móvil, un drawer. */
function WheelManager({ activeSection, onSectionChange, isOpen, isAnimated, onClose }: WheelManagerProps) {
    const { t } = useTranslation();
    // El toque fuera lo gestiona el backdrop; aquí solo Escape.
    useDismiss(isOpen, onClose);
    const isMobile = useMediaQuery(MOBILE_QUERY);
    const [creditHidden, setCreditHidden] = useState(readCreditHidden);
    const [creditClosing, setCreditClosing] = useState(false);
    const closeTimer = useRef<number | undefined>(undefined);

    useEffect(() => () => window.clearTimeout(closeTimer.current), []);

    // Primero la animación de salida; después se desmonta y se recuerda.
    const hideCredit = () => {
        setCreditClosing(true);
        closeTimer.current = window.setTimeout(() => {
            setCreditHidden(true);
            try {
                localStorage.setItem(CREDIT_HIDDEN_KEY, '1');
            } catch {
                // Sin acceso a storage: se oculta solo hasta recargar.
            }
        }, CREDIT_CLOSE_MS);
    };

    return (
        <>
            <div
                className={`Wheelmanager-backdrop ${isOpen ? 'Wheelmanager-backdrop--visible' : ''}`}
                onClick={onClose}
                aria-hidden="true"
            />

            <nav
                className={`Wheelmanager ${isOpen ? 'Wheelmanager--open' : ''} ${isAnimated ? 'Wheelmanager--animated' : ''}`}
                aria-label={t('manager', 'title')}
            >
                <div className="wheelmanager-body" id="wheelmanager-body">
                    <h2 className="wheelmanager-title">{t('manager', 'title')}</h2>
                    <p className="wheelmanager-subtitle">{t('manager', 'subtitle')}</p>
                    {SECTIONS.map((section) => {
                        const isActive = activeSection === section.id;
                        return (
                            <button
                                key={section.id}
                                type="button"
                                className={`button-menu ${isActive ? 'button-menu--active' : ''}`}
                                aria-current={isActive ? 'page' : undefined}
                                onClick={() => onSectionChange(section.id)}
                            >
                                <span className="button-menu-icon"><Icon name={section.icon} size={18} /></span>
                                <span>{t('manager', section.label)}</span>
                            </button>
                        );
                    })}
                    <div className="wheelmanager-lang">
                        <p className="wheelmanager-lang-title">{t('header', 'language')}</p>
                        <LanguageSwitch variant="choice" />
                    </div>
                    {/* En escritorio la música y los sonidos están en la esquina de la ruleta */}
                    {isMobile && (
                        <div className="wheelmanager-audio">
                            <p className="wheelmanager-lang-title">{t('music', 'audio')}</p>
                            <AudioControls variant="drawer" />
                        </div>
                    )}
                </div>
                {!creditHidden && (
                    <div className={`wheelmanager-credit${creditClosing ? ' wheelmanager-credit--closing' : ''}`}>
                        <a className="wheelmanager-credit-link" href="https://github.com/Jondals" target="_blank" rel="noopener noreferrer">
                            <span className="wheelmanager-credit-mark" aria-hidden="true">
                                <Icon name="github" size={18} />
                            </span>
                            <span className="wheelmanager-credit-text">
                                <span className="wheelmanager-credit-label">{t('manager', 'credit')}</span>
                                <span className="wheelmanager-credit-name">Jondals</span>
                            </span>
                            <Icon name="arrowUpRight" size={14} className="wheelmanager-credit-arrow" />
                        </a>
                        <button
                            type="button"
                            className="wheelmanager-credit-close"
                            onClick={hideCredit}
                            disabled={creditClosing}
                            aria-label={t('manager', 'hideCredit')}
                            title={t('manager', 'hideCredit')}
                        >
                            <Icon name="close" size={12} />
                        </button>
                    </div>
                )}
            </nav>
        </>
    );
}

export default WheelManager;
