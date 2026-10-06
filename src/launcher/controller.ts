export interface LauncherBrowser {
  windows: { getCurrent(): Promise<{ id?: number | undefined }> };
  runtime: {
    getURL(path: string): string;
    getContexts(filter: { contextTypes: ['SIDE_PANEL']; windowIds: number[]; documentUrls: string[] }): Promise<{
      contextType: string; windowId: number; documentUrl?: string | undefined;
    }[]>;
    openOptionsPage(): Promise<void>;
  };
  // WXT's generated view type omits DOM members. Validate the official Window
  // result at this boundary instead of casting the whole browser API.
  extension: { getViews(filter: { windowId: number; type?: 'tab' }): unknown[] };
  sidePanel: { open(options: { windowId: number }): Promise<void>; close(options: { windowId: number }): Promise<void> };
}

function visibleDocument(view: unknown, documentUrl: string): boolean {
  if (!view || typeof view !== 'object' || !('location' in view) || !('document' in view)) return false;
  const { location, document } = view;
  return Boolean(location && typeof location === 'object' && 'href' in location && location.href === documentUrl
    && document && typeof document === 'object' && 'visibilityState' in document && document.visibilityState === 'visible');
}

export interface LauncherState {
  panel: { windowId: number; open: boolean } | null;
  checking: boolean;
  panelPending: boolean;
  libraryPending: boolean;
  panelError: string;
  libraryError: string;
}

// Only a transient browser query result. Nothing is persisted or sent to the worker.
export class LauncherController {
  private state: LauncherState = { panel: null, checking: true, panelPending: false, libraryPending: false, panelError: '', libraryError: '' };
  private listeners = new Set<() => void>();
  private revision = 0;
  private disposed = false;
  constructor(private readonly api: LauncherBrowser, private readonly dismissPanelAction: () => void = () => {}) {}
  getSnapshot = (): LauncherState => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<LauncherState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  dispose() { this.disposed = true; this.revision++; this.listeners.clear(); }
  refresh = async () => {
    if (this.disposed || this.state.panelPending) return;
    await this.queryPanel();
  };
  private async queryPanel() {
    const revision = ++this.revision;
    this.update({ checking: true, panelError: '', panel: null });
    try {
      const { id } = await this.api.windows.getCurrent();
      if (id === undefined || !Number.isInteger(id) || id < 0) throw new Error('No current window');
      const documentUrl = this.api.runtime.getURL('/sidepanel.html');
      const contexts = await this.api.runtime.getContexts({ contextTypes: ['SIDE_PANEL'], windowIds: [id], documentUrls: [documentUrl] });
      // Chrome 153's real SIDE_PANEL contexts report windowId -1. Use its
      // foreground view API for window identity/visibility, retaining the
      // authoritative context-type/document check. No shell state is stored.
      const windowless = await this.api.runtime.getContexts({ contextTypes: ['SIDE_PANEL'], windowIds: [-1], documentUrls: [documentUrl] });
      if (revision !== this.revision || this.disposed) return;
      const panelContext = [...contexts, ...windowless].some((context) => context.contextType === 'SIDE_PANEL'
        && (context.windowId === id || context.windowId === -1) && context.documentUrl === documentUrl);
      const tabs = this.api.extension.getViews({ windowId: id, type: 'tab' });
      const visiblePanelView = this.api.extension.getViews({ windowId: id }).some((view) => !tabs.includes(view) && visibleDocument(view, documentUrl));
      const open = panelContext && visiblePanelView;
      this.update({ panel: { windowId: id, open }, checking: false });
    } catch {
      if (revision !== this.revision || this.disposed) return;
      this.update({ checking: false, panel: null, panelError: 'Could not check the Side Panel. Reopen the launcher to retry.' });
    }
  }
  togglePanel = async () => {
    const { panel, checking, panelPending } = this.state;
    if (this.disposed || !panel || checking || panelPending) return;
    this.update({ panelPending: true, panelError: '' });
    try {
      // Invoke directly in the click handler, before any await, to retain the gesture.
      await (panel.open ? this.api.sidePanel.close({ windowId: panel.windowId }) : this.api.sidePanel.open({ windowId: panel.windowId }));
    } catch {
      this.update({ panelPending: false, panelError: panel.open ? 'Could not close the Side Panel. Try again.' : 'Could not open the Side Panel. Try again.' });
      return;
    }
    // Chrome truth after success; never optimistically invert the query result.
    await this.queryPanel();
    this.update({ panelPending: false });
    if (!this.disposed) this.dismissPanelAction();
  };
  openLibrary = async () => {
    if (this.disposed || this.state.libraryPending) return;
    this.update({ libraryPending: true, libraryError: '' });
    try { await this.api.runtime.openOptionsPage(); }
    catch { this.update({ libraryError: 'Could not open Full Library. Try again.' }); }
    finally { this.update({ libraryPending: false }); }
  };
}
