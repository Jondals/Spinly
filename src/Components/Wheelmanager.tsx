import React, { useState } from 'react';
import '../css/WheelManager.css';

interface WheelmanagerProps {
    activeSection: string;
    onSectionChange: (section: string) => void;
}

const SECTIONS = [
    { id: 'editor', label: 'Wheel editor' },
    { id: 'presets', label: 'Presets' },
    { id: 'themes', label: 'Themes' }
];

function Wheelmanager({ activeSection, onSectionChange }: WheelmanagerProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={`Wheelmanager ${isOpen ? 'Wheelmanager--open' : ''}`}>
            {/* Botón desplegable: visible SOLO en mobile (display:none en desktop) */}
            <button
                type="button"
                className="wheelmanager-toggle"
                onClick={() => setIsOpen(prev => !prev)}
                aria-expanded={isOpen}
                aria-controls="wheelmanager-body"
            >
                <span>Wheel Manager</span>
                <span className="toggle-arrow" aria-hidden="true">▾</span>
            </button>

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
    );
}

export default Wheelmanager;