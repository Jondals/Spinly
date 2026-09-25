import React, { startTransition, useEffect, useState } from 'react';
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

// React DOM va en su propio archivo, que index.html precarga (lo añade inline-css.cjs): se descarga a
// la vez que este y se evalúa en otra tarea. Evaluarlo todo junto era una tarea larga que bloqueaba el
// hilo principal durante la carga.
void import(/* webpackChunkName: "react-dom" */ 'react-dom/client').then(({ createRoot }) => {
  const root = createRoot(document.getElementById('root') as HTMLElement);
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
});