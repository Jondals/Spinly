import Icon, { type IconName } from '../common/Icon';
import LanguageSwitch from '../i18n/LanguageSwitch';
import { useTranslation } from '../i18n/LanguageProvider';
import { useDismiss } from '../../hooks/useDismiss';
import '../../css/WheelManager.css';

export type WheelSectionId = 'options' | 'presets' | 'themes';

const SECTIONS: ReadonlyArray<{ id: WheelSectionId; icon: IconName; label: 'editor' | 'presets' | 'themes' }> = [
    { id: 'options', icon: 'wheel', label: 'editor' },
    { id: 'presets', icon: 'presets', label: 'presets' },
    { id: 'themes', icon: 'themes', label: 'themes' },
];

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
                </div>
            </nav>
        </>
    );
}

export default WheelManager;
