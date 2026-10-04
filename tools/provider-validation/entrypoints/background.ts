import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { startBackgroundRuntime } from '../../../src/runtime/background';
import { registerProviderObservation } from '../background';

export default defineBackground(() => {
  startBackgroundRuntime(); // Unchanged production composition; gate still false.
  registerProviderObservation();
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

