import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Launcher } from '@/src/launcher/Launcher';
import { LauncherController, type LauncherBrowser } from '@/src/launcher/controller';
import { BrandMark } from '@/src/options/BrandMark';

const panelUrl = 'chrome-extension://likedex/sidepanel.html';
function setup(open = false) {
  const contexts = () => open ? [{ contextType: 'SIDE_PANEL', windowId: 7, documentUrl: panelUrl }] : [];
  const api = {
    windows: { getCurrent: vi.fn(async (): Promise<{ id?: number | undefined }> => ({ id: 7 })) },
    runtime: { getURL: vi.fn(() => panelUrl), getContexts: vi.fn<LauncherBrowser['runtime']['getContexts']>(async () => contexts()), openOptionsPage: vi.fn(async () => {}) },
    sidePanel: { open: vi.fn(async () => { open = true; }), close: vi.fn(async () => { open = false; }) },
    extension: { getViews: vi.fn((filter: { windowId: number; type?: 'tab' }) => filter.type === 'tab' || !open ? []
      : [{ location: { href: panelUrl }, document: { visibilityState: 'visible' } }]) },
  } satisfies LauncherBrowser;
  const controller = new LauncherController(api);
  return { controller, api };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('launcher Chrome truth and boundaries', () => {
  it('starts unresolved and cannot open a panel before querying Chrome', async () => {
    const { controller, api } = setup();
    expect(controller.getSnapshot()).toMatchObject({ checking: true, panel: null });
    await controller.togglePanel();
    expect(api.sidePanel.open).not.toHaveBeenCalled();
  });
  it('queries the current window, exact packaged document and SIDE_PANEL type', async () => {
    const { controller, api } = setup();
    await controller.refresh();
    expect(api.windows.getCurrent).toHaveBeenCalledWith();
    expect(api.runtime.getURL).toHaveBeenCalledWith('/sidepanel.html');
    expect(api.runtime.getContexts).toHaveBeenCalledWith({ contextTypes: ['SIDE_PANEL'], windowIds: [7], documentUrls: [panelUrl] });
    expect(api.runtime.getContexts).toHaveBeenCalledWith({ contextTypes: ['SIDE_PANEL'], windowIds: [-1], documentUrls: [panelUrl] });
    expect(api.extension.getViews).toHaveBeenCalledWith({ windowId: 7 });
    expect(controller.getSnapshot().panel).toEqual({ windowId: 7, open: false });
  });
  it.each([
    { contextType: 'SIDE_PANEL', windowId: 8, documentUrl: panelUrl },
    { contextType: 'TAB', windowId: 7, documentUrl: panelUrl },
    { contextType: 'SIDE_PANEL', windowId: 7, documentUrl: 'chrome-extension://likedex/other.html' },
  ])('rejects a nonmatching context %j', async (context) => {
    const { controller, api } = setup();
    api.runtime.getContexts.mockResolvedValue([context]);
    await controller.refresh();
    expect(controller.getSnapshot().panel?.open).toBe(false);
  });
  it.each([false, true])('calls the real %s-state operation synchronously from activation and re-queries', async (open) => {
    const { controller, api } = setup(open);
    await controller.refresh();
    const operation = controller.togglePanel();
    expect(open ? api.sidePanel.close : api.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
    expect(controller.getSnapshot().panelPending).toBe(true);
    await operation;
    expect(controller.getSnapshot()).toMatchObject({ panel: { windowId: 7, open: !open }, panelPending: false });
    expect(api.runtime.getContexts).toHaveBeenCalledTimes(4);
  });
  it('does not optimistically flip state even after an API resolves', async () => {
    const { controller, api } = setup();
    api.sidePanel.open.mockImplementation(async () => {});
    await controller.refresh(); await controller.togglePanel();
    expect(controller.getSnapshot().panel?.open).toBe(false);
  });
  it.each([false, true])('preserves %s state after failed operation; sanitizes and retries', async (open) => {
    const { controller, api } = setup(open);
    const method = open ? api.sidePanel.close : api.sidePanel.open;
    method.mockRejectedValueOnce(new Error('secret/provider/raw/ya29.sentinel'));
    await controller.refresh(); await controller.togglePanel();
    expect(controller.getSnapshot()).toMatchObject({ panel: { open }, panelPending: false });
    expect(controller.getSnapshot().panelError).toBe(`Could not ${open ? 'close' : 'open'} the Side Panel. Try again.`);
    await controller.togglePanel();
    expect(controller.getSnapshot().panel?.open).toBe(!open);
  });
  it.each(['window', 'contexts'] as const)('query failure in %s stays unknown; Full Library remains independent', async (boundary) => {
    const { controller, api } = setup();
    if (boundary === 'window') api.windows.getCurrent.mockRejectedValue(new Error('raw sentinel'));
    else api.runtime.getContexts.mockRejectedValue(new Error('raw sentinel'));
    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ panel: null, checking: false });
    expect(controller.getSnapshot().panelError).toBe('Could not check the Side Panel. Reopen the launcher to retry.');
    await controller.openLibrary();
    expect(api.runtime.openOptionsPage).toHaveBeenCalledWith();
  });
  it.each([undefined, -1, 1.5, NaN])('rejects invalid current window %s without side effects', async (id) => {
    const { controller, api } = setup();
    api.windows.getCurrent.mockImplementation(async () => id === undefined ? {} : { id });
    await controller.refresh(); await controller.togglePanel();
    expect(controller.getSnapshot().panel).toBeNull();
    expect(api.runtime.getContexts).not.toHaveBeenCalled(); expect(api.sidePanel.open).not.toHaveBeenCalled();
  });
  it('uses native Options API; failure is sanitized and retryable', async () => {
    const { controller, api } = setup();
    api.runtime.openOptionsPage.mockRejectedValueOnce(new Error('raw sentinel'));
    await controller.openLibrary();
    expect(controller.getSnapshot()).toMatchObject({ libraryPending: false, libraryError: 'Could not open Full Library. Try again.' });
    await controller.openLibrary();
    expect(controller.getSnapshot().libraryError).toBe(''); expect(api.runtime.openOptionsPage).toHaveBeenCalledTimes(2);
  });
  it('suppresses overlapping actions and refresh during a panel operation', async () => {
    const { controller, api } = setup(); const wait = deferred<void>();
    api.sidePanel.open.mockImplementation(() => wait.promise);
    await controller.refresh(); const operation = controller.togglePanel();
    await controller.togglePanel(); await controller.refresh();
    expect(api.sidePanel.open).toHaveBeenCalledTimes(1); expect(api.runtime.getContexts).toHaveBeenCalledTimes(2);
    wait.resolve(); await operation;
    expect(controller.getSnapshot().panelPending).toBe(false);
  });
  it('suppresses duplicate Full Library activations while pending', async () => {
    const { controller, api } = setup(); const wait = deferred<void>();
    api.runtime.openOptionsPage.mockImplementation(() => wait.promise);
    const operation = controller.openLibrary(); await controller.openLibrary();
    expect(api.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    wait.resolve(); await operation;
  });
  it('ignores superseded queries', async () => {
    const { controller, api } = setup(); const wait = deferred<{ id: number }>();
    api.windows.getCurrent.mockImplementationOnce(() => wait.promise);
    const first = controller.refresh(); await controller.refresh();
    wait.resolve({ id: 8 }); await first;
    expect(controller.getSnapshot().panel?.windowId).toBe(7);
  });
  it('resolves a windowless SIDE_PANEL using a visible Chrome-scoped view', async () => {
    const { controller, api } = setup(true);
    api.runtime.getContexts.mockImplementation(async (filter) => filter.windowIds[0] === -1
      ? [{ contextType: 'SIDE_PANEL', windowId: -1, documentUrl: panelUrl }] : []);
    await controller.refresh();
    expect(controller.getSnapshot().panel).toEqual({ windowId: 7, open: true });
  });
  it('a windowless other-window context without this window view stays closed', async () => {
    const { controller, api } = setup();
    api.runtime.getContexts.mockResolvedValue([{ contextType: 'SIDE_PANEL', windowId: -1, documentUrl: panelUrl }]);
    await controller.refresh(); expect(controller.getSnapshot().panel?.open).toBe(false);
  });
  it('a hidden view is not an open panel', async () => {
    const { controller, api } = setup(true);
    api.extension.getViews.mockReturnValue([{ location: { href: panelUrl }, document: { visibilityState: 'hidden' } }]);
    await controller.refresh(); expect(controller.getSnapshot().panel?.open).toBe(false);
  });
  it('an ordinary tab at sidepanel.html cannot impersonate an open panel', async () => {
    const { controller, api } = setup(true);
    const view = { location: { href: panelUrl }, document: { visibilityState: 'visible' } };
    api.extension.getViews.mockReturnValue([view]);
    await controller.refresh(); expect(controller.getSnapshot().panel?.open).toBe(false);
  });
  it('dismisses on successful panel operation only', async () => {
    const { api } = setup(); const dismiss = vi.fn(); const controller = new LauncherController(api, dismiss);
    await controller.refresh(); api.sidePanel.open.mockRejectedValueOnce(new Error('raw failure'));
    await controller.togglePanel(); expect(dismiss).not.toHaveBeenCalled();
    await controller.togglePanel(); expect(dismiss).toHaveBeenCalledOnce();
  });
  it('ignores late completion after disposal and never performs disposed actions', async () => {
    const { controller, api } = setup(); const wait = deferred<{ id: number }>();
    const listener = vi.fn(); controller.subscribe(listener);
    api.windows.getCurrent.mockImplementationOnce(() => wait.promise);
    const query = controller.refresh(); controller.dispose(); listener.mockClear();
    wait.resolve({ id: 7 }); await query; await controller.togglePanel(); await controller.openLibrary();
    expect(listener).not.toHaveBeenCalled(); expect(api.sidePanel.open).not.toHaveBeenCalled(); expect(api.runtime.openOptionsPage).not.toHaveBeenCalled();
  });
});

describe('launcher presentation', () => {
  it.each([false, true])('renders exactly two native destinations for open=%s and approved images', async (open) => {
    const { controller } = setup(open); await controller.refresh();
    const html = renderToStaticMarkup(<Launcher controller={controller} />);
    expect(html.match(/<button /g)).toHaveLength(2);
    expect(html).toContain(`${open ? 'Close' : 'Open'} Side Panel`); expect(html).toContain('Open Full Library');
    expect(html).toContain('Your likes, within reach.'); expect(html).toContain('/brand/likedex-mark-vector.svg');
    expect(html).toContain('/launcher/likedex-open-side-panel.png'); expect(html).toContain('/launcher/likedex-open-full-library.png');
    expect(html).not.toMatch(/role="switch"|<input|<select|Sync|Settings|video-row|Video detail|Options UI/);
  });
  it('represents pending/unknown with disabled and busy semantics', () => {
    const { controller } = setup(); const html = renderToStaticMarkup(<Launcher controller={controller} />);
    expect(html).toContain('Checking Side Panel'); expect(html).toContain('disabled="" aria-busy="true"');
    expect(html).toContain('aria-label="Open Full Library"');
  });
  it('renders compact query errors without a false Open label or lost Full Library', async () => {
    const { controller, api } = setup(); api.runtime.getContexts.mockRejectedValue(new Error('raw sentinel'));
    await controller.refresh(); const html = renderToStaticMarkup(<Launcher controller={controller} />);
    expect(html).toContain('Side Panel unavailable'); expect(html).toContain('role="alert"'); expect(html).not.toContain('raw sentinel');
    expect(html).not.toContain('Open Side Panel'); expect(html).toContain('Open Full Library');
  });
  it('uses the canonical shared app brand without a constructed glyph/circle', () => {
    const html = renderToStaticMarkup(<BrandMark />);
    expect(html).toContain('/brand/likedex-mark-vector.svg'); expect(html).not.toContain('<svg');
  });
});
