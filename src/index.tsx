import React, { startTransition } from 'react';
import ReactDOM from 'react-dom/client';
// Antes que App: los estilos de cada componente deben poder sobrescribir la base.
import './css/shared.css';
import App from './App';
import { LanguageProvider } from './Components/i18n/LanguageProvider';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
// En transición: el primer render se trocea y cede el hilo principal entre trozos. La pantalla de
// carga ya está pintada, así que montar la app no debe bloquear su animación ni la entrada del usuario.
startTransition(() => {
  root.render(
    <React.StrictMode>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </React.StrictMode>
  );
});