/**
 * Entry point: loads React DOM as its own chunk and mounts the app inside a transition.
 */
import React, { startTransition, useEffect, useState } from 'react';
// Before App: each component's styles must be able to override the base.
import './css/shared.css';
import App from './App';
import { LanguageProvider } from './Components/i18n/LanguageProvider';
import { setAppRemount } from './scripts/account-data';
import { startChatterlyBridge } from './scripts/chatterly-bridge';

/** Changing the key remounts App: that is how data from another device is applied without reloading. */
function Root() {
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    setAppRemount(() => setGeneration((value) => value + 1));
    return () => setAppRemount(null);
  }, []);
  return <App key={generation} />;
}

// React DOM lives in its own file, which index.html preloads (inline-css.cjs adds the preload): it is
// downloaded alongside this one and evaluated in a separate task. Evaluating everything together was a
// long task that blocked the main thread during load.
// When Spinly was opened from Chatterly, tell it we are ready (does nothing otherwise).
startChatterlyBridge();

void import(/* webpackChunkName: "react-dom" */ 'react-dom/client').then(({ createRoot }) => {
  const root = createRoot(document.getElementById('root') as HTMLElement);
  // In a transition: the first render is split into chunks and yields the main thread between them. The
  // splash is already painted, so mounting the app must not block its animation or user input.
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