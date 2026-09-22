import React, { useEffect } from 'react';
import '../css/WheelManager.css';

export type WheelSectionId = 'options' | 'presets' | 'themes';

interface WheelmanagerProps {
    activeSection: WheelSectionId;
    onSectionChange: (section: WheelSectionId) => void;
    isOpen: boolean;
    isAnimated: boolean;
    onClose: () => void;
}

const SECTIONS: Array<{ id: WheelSectionId; label: string }> = [
    { id: 'options', label: 'Wheel editor' },
    { id: 'presets', label: 'Presets' },
    { id: 'themes', label: 'Themes' },
];

function Wheelmanager({ activeSection, onSectionChange, isOpen, isAnimated, onClose }: WheelmanagerProps) {
    // En mobile el drawer se cierra con Escape
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

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
                    <h1>Wheel Manager</h1>
                    <h3>Configura tu giro</h3>
                    {SECTIONS.map(section => (
                        <button
                            key={section.id}
                            className={`button-menu ${activeSection === section.id ? 'button-menu--active' : ''}`}
                            onClick={() => onSectionChange(section.id)}
                        >
                            {section.label}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}

export default Wheelmanager;