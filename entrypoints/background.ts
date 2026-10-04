import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('Likedex could not configure toolbar Side Panel behavior.', error);
  });
});
