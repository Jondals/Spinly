import React from 'react';
import '../css/WheelManager.css';

function Wheelmanager() {
    return (
        <div className="Wheelmanager">
            <h1>Wheel Manager</h1>
            <h3>Configura tu giro</h3>
            <button className='button-menu'>Wheel editor</button>
            <button className='button-menu'>Presets</button>
            <button className='button-menu'>Themes</button>
           {/*<button className='button-menu-option'>+ Add Option</button>*/}
        </div>
    )
}

export default Wheelmanager;