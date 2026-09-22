import React from 'react';
import ReactDOM from 'react-dom/client';
// Base visual compartida: se importa ANTES que App para que los estilos de cada
// componente (y sus estados) puedan sobreescribir estos valores base.
import './css/shared.css';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);