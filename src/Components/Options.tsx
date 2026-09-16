import React, { useState } from 'react';
import '../css/Options.css';
import {addOption, removeOption, updateOption, reorderOptions, MAX_OPTION_LENGTH, MAX_OPTIONS} from '../scripts/option-wheel.js';

interface Option {
    id: string;
    name: string;
    color: string;
}

interface OptionsProps { options: Option[]; setOptions: React.Dispatch<React.SetStateAction<Option[]>>;}

function Options({ options, setOptions }: OptionsProps) {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);
    const reachedLimit = options.length >= MAX_OPTIONS;

    const handleDragStart = (index: number) => (event: React.DragEvent) => {
        setDragIndex(index);
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (index: number) => (event: React.DragEvent) => {
        event.preventDefault();
        if (index !== overIndex) setOverIndex(index);
    };

    const handleDrop = (index: number) => (event: React.DragEvent) => {
        event.preventDefault();
        if (dragIndex !== null && dragIndex !== index) {
            setOptions(prev => reorderOptions(prev, dragIndex, index));
        }
        setDragIndex(null);
        setOverIndex(null);
    };

    const handleDragEnd = () => {
        setDragIndex(null);
        setOverIndex(null);
    };

    return (
        <div className="Options">
            <div className="options-title">
                <p>OPCIONES</p>
                <span className="number-items">
                    {options.length} / {MAX_OPTIONS}
                </span>
            </div>

            <div className="container-options">
                {options.map((option, index) => (
                    <div
                        className={`option-item ${dragIndex === index ? 'option-item--dragging' : ''} ${overIndex === index && dragIndex !== index ? 'option-item--over' : ''}`}
                        key={option.id}
                        onDragOver={handleDragOver(index)}
                        onDrop={handleDrop(index)}
                    >
                        <span className="drag" draggable onDragStart={handleDragStart(index)} onDragEnd={handleDragEnd}>⠿</span>
                        <span className={`option-color option-color-${option.color}`}/>
                        <input value={option.name} maxLength={MAX_OPTION_LENGTH} onChange={event => setOptions(prev => updateOption(prev, option.id, event.target.value))}/>
                        <button className="remove-option-button" onClick={() => setOptions(prev => removeOption(prev, option.id))}>×</button>
                    </div>
                ))}
            </div>

            <div className="options-bottom">
                <button className="add-option-button" onClick={() => setOptions(prev => addOption(prev))} disabled={reachedLimit} title={reachedLimit ? `Máximo ${MAX_OPTIONS} opciones` : undefined}>
                    <span>⊕</span>
                    Añadir opción
                </button>
            </div>
        </div>
    );
}

export default Options;