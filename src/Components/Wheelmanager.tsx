import React from 'react';
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
    return (
        <div className="Wheelmanager">
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
    );
}

export default Wheelmanager;