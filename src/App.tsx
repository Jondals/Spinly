import React, { useState } from 'react';
import Header from './Components/Header';
import Wheelmanager from './Components/Wheelmanager';
import Options from './Components/Options';
import Wheel from './Components/Wheel';
import Presets from './Components/Presets';
import Themes from './Components/Themes';
import { createDefaultOptions } from './scripts/option-wheel.js';

import './index.css';

function App() {
    const [options, setOptions] = useState(createDefaultOptions());
    const [activeSection, setActiveSection] = useState('editor');

    const renderPanel = () => {
        switch (activeSection) {
            case 'presets':
                return <Presets />;
            case 'themes':
                return <Themes />;
            case 'editor':
            default:
                return <Wheel options={options} />;
        }
    };

    return (
        <div className="App">
            <Header />
            <div className="Main">
                <Wheelmanager activeSection={activeSection} onSectionChange={setActiveSection} />
                <Options options={options} setOptions={setOptions} />
                {renderPanel()}
            </div>
        </div>
    );
}

export default App;