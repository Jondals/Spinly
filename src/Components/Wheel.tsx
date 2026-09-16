import React, { useState } from 'react';
import '../css/Wheel.css';
import {SPIN_DURATION, getWheelBackground, spinWheel, getLabelTransform, isLightColor} from '../scripts/wheel.js';

interface WheelOption {
    id: string;
    name: string;
    color: string;
}

interface WheelProps {
    options: WheelOption[];
}

function Wheel({ options }: WheelProps) {
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [winner, setWinner] = useState<string | null>(null);
    const hasOptions = options.length > 0;

    const handleSpin = () => {
        if (spinning || !hasOptions) return;
        setWinner(null);
        setSpinning(true);
        const result = spinWheel(options, rotation);
        setRotation(result.rotation);
        setTimeout(() => { setSpinning(false); setWinner(result.winner);}, SPIN_DURATION);
    };

    return (
        <div className="Wheel">
            <div className="wheel-container">
                <div className="wheel-pointer" />
                <div className={`wheel-disc ${!hasOptions ? 'wheel-disc--empty' : ''}`}
                    style={{background: getWheelBackground(options), transform: `rotate(${rotation}deg)`, transitionDuration: `${SPIN_DURATION}ms`, '--option-count': options.length || 1} as React.CSSProperties}
                >

                    {!hasOptions && (<p className="wheel-empty-text"> Añade opciones para girar </p>)}

                    {options.map((option, index) => (
                        <span key={option.id} className={`wheel-label ${isLightColor(option.color) ? 'wheel-label--dark' : ''}`} style={{transform: getLabelTransform(index, options.length)}}>
                            <span className="wheel-label-text">{option.name}</span>
                        </span>
                    ))}

                    <div className="wheel-hub"/>
                </div>
            </div>

            <button className="wheel-spin-button" onClick={handleSpin} disabled={spinning || !hasOptions}> {spinning ? 'GIRANDO...' : 'GIRAR'} </button>
            {winner && !spinning && (<p className="wheel-result"> ¡Toca {winner}! </p>)}
        </div>
    );
}

export default Wheel;