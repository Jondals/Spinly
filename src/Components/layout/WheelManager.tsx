/**
 * WheelManager: the section navigation (wheel editor, presets, themes, tournament), plus the language,
 * the audio controls on mobile and the author credit. A fixed column on desktop, a drawer on mobile.
 */
import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from '../common/Icon';
import LanguageSwitch from '../i18n/LanguageSwitch';
import { useTranslation } from '../i18n/LanguageProvider';
import { useDismiss } from '../../hooks/useDismiss';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import AudioControls from '../music/AudioControls';
import { MOBILE_QUERY } from '../../scripts/layout';
import '../../css/WheelManager.css';

export type WheelSectionId = 'options' | 'presets' | 'themes' | 'tournament';

const SECTIONS: ReadonlyArray<{ id: WheelSectionId; icon: IconName; label: 'editor' | 'presets' | 'themes' | 'tournament' }> = [
    { id: 'options', icon: 'sliders', label: 'editor' },
    { id: 'presets', icon: 'bookmark', label: 'presets' },
    { id: 'themes', icon: 'palette', label: 'themes' },
    { id: 'tournament', icon: 'trophy', label: 'tournament' },
];

// A device preference, like the language: it does not travel with the account and survives signing out.
const CREDIT_HIDDEN_KEY = 'spinly-credit-hidden';
// Matches the .wheelmanager-credit--closing transition (WheelManager.css).
const CREDIT_CLOSE_MS = 260;

/** Whether the author credit was dismissed on this device. */
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

/** Navigation between sections. A fixed column on desktop; a drawer on mobile. */
function WheelManager({ activeSection, onSectionChange, isOpen, isAnimated, onClose }: WheelManagerProps) {
    const { t } = useTranslation();
    // Clicks outside are handled by the backdrop; this only listens to Escape.
    useDismiss(isOpen, onClose);
    const isMobile = useMediaQuery(MOBILE_QUERY);
    const [creditHidden, setCreditHidden] = useState(readCreditHidden);
    const [creditClosing, setCreditClosing] = useState(false);
    const closeTimer = useRef<number | undefined>(undefined);

    useEffect(() => () => window.clearTimeout(closeTimer.current), []);

    /** Hides the credit: first the exit animation, then it unmounts and the choice is remembered. */
    const hideCredit = () => {
        setCreditClosing(true);
        closeTimer.current = window.setTimeout(() => {
            setCreditHidden(true);
            try {
                localStorage.setItem(CREDIT_HIDDEN_KEY, '1');
            } catch {
                // No storage access: it stays hidden only until a reload.
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
                    {/* On desktop, music and sounds live in the wheel's corner */}
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
