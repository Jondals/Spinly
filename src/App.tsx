import React from 'react';
import Header from './Components/Header'
import Wheelmanager from './Components/Wheelmanager'
import Options from './Components/Options'
import Wheel from './Components/Wheel'
import './index.css';

function App() {
  return (
    <div className="App">
      <Header></Header>

      <div className="Main">
        <Wheelmanager></Wheelmanager>
        <Options></Options>
        <Wheel></Wheel>
      </div>
    </div>
  );
}

export default App;