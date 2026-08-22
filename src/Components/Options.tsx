import React, { useState } from 'react';
import '../css/Options.css';
import {
    createDefaultOptions,
    addOption,
    removeOption,
    updateOption
} from '../scripts/option-wheel.js';



function Options() {
    const [options, setOptions] = useState(createDefaultOptions());

    return (
        <div className="Options">

            <div className="options-title">
                <p>OPCIONES</p>
                <span className='number-items'>{options.length} Items</span>
            </div>

            <div className="container-options">
                {options.map(option => (
                    <div className="option-item" key={option.id}>

                        <span className="drag">⠿</span>
                        <span className={`option-color option-color-${option.color}`}/>

                        <input value={option.name} onChange={e => setOptions(prev =>
                                    updateOption(
                                        prev,
                                        option.id,
                                        e.target.value
                                    )
                                )
                            }
                        />

                        <button className='remove-option-button' onClick={() => setOptions(prev => removeOption(prev, option.id))}>×</button>
                    </div>
                ))}
            </div>

            <div className="options-bottom">
                <button className='add-option-button' onClick={() => setOptions(prev => addOption(prev))}>
                    <span>⊕</span>
                    Añadir opción
                </button>
            </div>
        </div>
    );
}

export default Options;