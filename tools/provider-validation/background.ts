import { browser } from 'wxt/browser';
import { ChromeIdentityAdapter } from '../../src/auth/chrome-identity';
import { GoogleAuthorizationRequests } from '../../src/auth/google-requests';
import { LibraryRepository } from '../../src/storage/repository';
import { LikedexDatabase } from '../../src/storage/database';
import { startSchema, VALIDATION_PORT } from './contracts';
import { observeProvider } from './service';

export function validationSenderAllowed(sender: { id?: string; url?: string; tab?: unknown } | undefined, extensionId: string): boolean {
  // Chrome supplies tab for extension pages opened in a tab, too. Its trusted
  // sender URL plus extension ID distinguish this exact page from content scripts.
  return sender?.id === extensionId && sender.url === `chrome-extension://${extensionId}/provider-validation.html`;
}

export function registerProviderObservation(): void {
  const repository = new LibraryRepository(new LikedexDatabase());
  const requests = new GoogleAuthorizationRequests(new ChromeIdentityAdapter());
  let active = false;
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== VALIDATION_PORT || !validationSenderAllowed(port.sender, browser.runtime.id)) {
      port.disconnect(); return;
    }
    const abort = new AbortController();
    let started = false;
    const post = (value: unknown) => {
      if (!abort.signal.aborted) {
        try { port.postMessage(value); } catch { abort.abort(); }
      }
    };
    port.onDisconnect.addListener(() => abort.abort());
    port.onMessage.addListener((message: unknown) => {
      if (started || active || !startSchema.safeParse(message).success) { port.disconnect(); return; }
      started = true; active = true;
      void observeProvider(requests, () => repository.readObservationSnapshot(new Date().toISOString()), abort.signal,
        (summary) => post({ event: 'progress', summary })).then((result) => post({ event: 'result', result }))
        .finally(() => { active = false; port.disconnect(); });
    });
  });
}
