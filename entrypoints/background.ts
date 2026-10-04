import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { startBackgroundRuntime } from '../src/runtime/background';

export default defineBackground(() => {
  startBackgroundRuntime();
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('Likedex could not configure toolbar Side Panel behavior.', error);
  });
});
