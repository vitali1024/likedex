import { browser } from 'wxt/browser';
import { z } from 'zod';
import { ChromeIdentityAdapter } from '../auth/chrome-identity';
import { GoogleAuthorizationRequests } from '../auth/google-requests';
import { AuthenticationService } from '../auth/service';
import { LikedexDatabase } from '../storage/database';
import { LibraryRepository } from '../storage/repository';
import { SynchronizationService } from '../sync/service';
import { RuntimeCoordinator } from './coordinator';
import { PRODUCTION_PROVIDER_VALIDATION_APPROVED } from './production-gate';

// Build composition only: the separate observation tool can close Sync,
// but cannot grant approval. Production entrypoints use the committed gate.
export function startBackgroundRuntime(diagnosticsEnabled = false, disableSync = false): RuntimeCoordinator {
  z.config({ jitless: true }); // MV3 CSP: use interpreted validation, no runtime code generation.
  const repository = new LibraryRepository(new LikedexDatabase(), (control) => {
    void browser.runtime.sendMessage({ protocolVersion: 1, event: 'STATE_REVISION', revision: control.revision,
      dataGeneration: control.dataGeneration, authEpoch: control.authEpoch }).catch(() => {});
  });
  const requests = new GoogleAuthorizationRequests(new ChromeIdentityAdapter());
  const auth = new AuthenticationService(repository, requests);
  const sync = new SynchronizationService(repository, requests, crypto.randomUUID(), undefined, undefined, (receipt) => {
    auth.acceptSyncAuthorization(receipt); coordinator.authorizationValidated(receipt.scope);
  });
  const coordinator = new RuntimeCoordinator(repository, auth, sync, browser.runtime.id,
    { providerValidationApproved: disableSync ? false : PRODUCTION_PROVIDER_VALIDATION_APPROVED, diagnosticsEnabled });
  // Register synchronously; Chrome can deliver messages before startup finishes.
  browser.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    void coordinator.handle(message, sender).then(respond);
    return true;
  });
  void coordinator.initialize().catch(() => {
    console.error('Likedex runtime initialization failed. State is unavailable.');
  });
  return coordinator;
}
