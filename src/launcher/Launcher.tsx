import { useEffect, useSyncExternalStore } from 'react';
import { BrandMark } from '../options/BrandMark';
import type { LauncherController } from './controller';

export function Launcher({ controller }: { controller: LauncherController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    void controller.refresh();
    const refresh = () => { if (document.visibilityState === 'visible') void controller.refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      controller.dispose();
    };
  }, [controller]);
  const panelLabel = state.checking ? 'Checking Side Panel…' : !state.panel ? 'Side Panel unavailable' : state.panel.open ? 'Close Side Panel' : 'Open Side Panel';
  return <main className="launcher">
    <header className="launcher-header"><BrandMark /><div><h1>Likedex</h1><p>Your likes, within reach.</p></div></header>
    <div className="launcher-actions">
      <button type="button" className="launcher-row" aria-label={panelLabel} aria-describedby="panel-description"
        disabled={state.checking || !state.panel || state.panelPending} aria-busy={state.checking || state.panelPending}
        onClick={() => { void controller.togglePanel(); }}>
        <img className="launcher-row-icon" src="/launcher/likedex-open-side-panel.png" alt="" width="48" height="48" />
        <span><strong>{panelLabel}</strong><small id="panel-description">{state.panel?.open ? 'Hide the quick browsing panel' : 'Browse beside your current page'}</small></span>
      </button>
      {state.panelError && <p className="launcher-error" role="alert">{state.panelError}</p>}
      <button type="button" className="launcher-row" aria-label="Open Full Library" aria-describedby="library-description"
        disabled={state.libraryPending} aria-busy={state.libraryPending} onClick={() => { void controller.openLibrary(); }}>
        <img className="launcher-row-icon" src="/launcher/likedex-open-full-library.png" alt="" width="48" height="48" />
        <span><strong>Open Full Library</strong><small id="library-description">Search, filter, sort and inspect details</small></span>
      </button>
      {state.libraryError && <p className="launcher-error" role="alert">{state.libraryError}</p>}
    </div>
  </main>;
}
