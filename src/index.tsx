import React from 'react';
import ReactDOM from 'react-dom/client';
// Antes que App: los estilos de cada componente deben poder sobrescribir la base.
import './css/shared.css';
import App from './App';
import { LanguageProvider } from './Components/i18n/LanguageProvider';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);