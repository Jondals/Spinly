import React, { startTransition, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
// Antes que App: los estilos de cada componente deben poder sobrescribir la base.
import './css/shared.css';
import App from './App';
import { LanguageProvider } from './Components/i18n/LanguageProvider';
import { setAppRemount } from './scripts/account-data';

/** Cambiar la key vuelve a montar App: así se aplican datos de otro dispositivo sin recargar. */
function Root() {
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    setAppRemount(() => setGeneration((value) => value + 1));
    return () => setAppRemount(null);
  }, []);
  return <App key={generation} />;
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
// En transición: el primer render se trocea y cede el hilo principal entre trozos. La pantalla de
// carga ya está pintada, así que montar la app no debe bloquear su animación ni la entrada del usuario.
startTransition(() => {
  root.render(
    <React.StrictMode>
      <LanguageProvider>
        <Root />
      </LanguageProvider>
    </React.StrictMode>
  );
});