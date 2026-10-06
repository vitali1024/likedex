import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { startBackgroundRuntime } from '../src/runtime/background';

export default defineBackground(() => {
  startBackgroundRuntime();
  // Explicit false also clears the previous direct-action setting on update.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {
    console.error('Likedex could not configure toolbar launcher behavior.');
  });
});
