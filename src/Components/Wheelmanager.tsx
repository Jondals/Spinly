import React, { useEffect } from 'react';
import { useTranslation } from '../lib/i18n';
import '../css/WheelManager.css';

export type WheelSectionId = 'options' | 'presets' | 'themes';

interface WheelmanagerProps {
    activeSection: WheelSectionId;
    onSectionChange: (section: WheelSectionId) => void;
    isOpen: boolean;
    isAnimated: boolean;
    onClose: () => void;
}

function Wheelmanager({ activeSection, onSectionChange, isOpen, isAnimated, onClose }: WheelmanagerProps) {
    const { t } = useTranslation();
    // En mobile el drawer se cierra con Escape
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const sections: Array<{ id: WheelSectionId; icon: React.ReactNode }> = [
        {
            id: 'options',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                    <path d="M12 3v8.5M12 12l7.8 4.5M12 12L4.2 7.5" />
                </svg>
            ),
        },
        {
            id: 'presets',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="10" width="18" height="4" rx="1" /><rect x="3" y="16" width="18" height="4" rx="1" />
                </svg>
            ),
        },
        {
            id: 'themes',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" /><circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none" />
                    <path d="M12 21a9 9 0 0 1 0-18 9 9 0 0 1 5 1.5c1.5.8 1 3-.6 3H14a4 4 0 0 0 0 8h1c1.5 0 2 1.6 1 2.7A8.6 8.6 0 0 1 12 21Z" />
                </svg>
            ),
        },
    ];
    const labelFor = (id: WheelSectionId): string => {
        if (id === 'options') return t('manager', 'editor');
        if (id === 'presets') return t('manager', 'presets');
        return t('manager', 'themes');
    };

    return (
        <>
            {/* Overlay: solo visible en mobile y cierra el drawer al tocar fuera */}
            <div
                className={`Wheelmanager-backdrop ${isOpen ? 'Wheelmanager-backdrop--visible' : ''}`}
                onClick={onClose}
                aria-hidden="true"
            />

            <div className={`Wheelmanager ${isOpen ? 'Wheelmanager--open' : ''} ${isAnimated ? 'Wheelmanager--animated' : ''}`}>
                {/* Contenido: en desktop siempre visible, en mobile depende de --open */}
                <div className="wheelmanager-body" id="wheelmanager-body">
                    <h1>{t('manager', 'title')}</h1>
                    <h3>{t('manager', 'subtitle')}</h3>
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            className={`button-menu ${activeSection === section.id ? 'button-menu--active' : ''}`}
                            onClick={() => onSectionChange(section.id)}
                        >
                            <span className="button-menu-icon" aria-hidden="true">{section.icon}</span>
                            <span>{labelFor(section.id)}</span>
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}

export default Wheelmanager;