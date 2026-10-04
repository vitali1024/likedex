import { AuthenticationError, assertNotAborted } from '../../src/auth/errors';
import type { GoogleAuthorizationRequests } from '../../src/auth/google-requests';
import type { LibrarySnapshot } from '../../src/domain/contracts';
import { ProviderError } from '../../src/provider/errors';
import { isTrustedProviderCompletion, YouTubeLikedVideosProvider, type IngestionContext } from '../../src/provider/youtube-ingestion';
import { resultSchema, type ValidationResult, type ValidationSummary } from './contracts';

type Requests = Pick<GoogleAuthorizationRequests, 'bootstrapSilently' | 'createYouTubeReadSession'>;
type Preconditions = Pick<LibrarySnapshot, 'control' | 'owner' | 'sync'>;

// No repository, AuthenticationService, SynchronizationService, finalizer or
// mutation capability. Only the supplied read-only precondition operation.
export async function observeProvider(requests: Requests, read: () => Promise<Preconditions>, signal: AbortSignal,
  progress: (summary: ValidationSummary) => void = () => {}, now = () => new Date().toISOString(),
  nextId = () => crypto.randomUUID()): Promise<ValidationResult> {
  const summary: ValidationSummary = { mode: 'observation-only', productionSyncGate: 'closed',
    bootstrapValidated: false, trustedCompletion: false, pages: 0, rawMemberships: 0, uniqueMemberships: 0,
    duplicateVideoItems: 0, estimatedTotal: null, hydrationPages: 0, hydrated: 0, lookupOmitted: 0,
    withoutRichMetadata: 0, unavailable: 0, unknownAvailability: 0 };
  try {
    const initial = await read();
    const check = async () => {
      assertNotAborted(signal);
      const current = await read();
      if (current.control.connectionGate !== 'connected') throw new AuthenticationError('auth-required');
      if (current.control.pendingCleanupReason !== null || current.control.authorizationCheckDueAt === null
        || now() >= current.control.authorizationCheckDueAt
        || current.control.dataGeneration !== initial.control.dataGeneration
        || current.control.authEpoch !== initial.control.authEpoch
        || current.owner?.channelId !== initial.owner?.channelId
        || current.owner?.likesPlaylistId !== initial.owner?.likesPlaylistId) throw new AuthenticationError('cancelled');
      if (current.sync?.currentAttempt && ['preparing', 'scanning', 'applying', 'finalizing'].includes(current.sync.currentAttempt.state)) {
        throw new AuthenticationError('busy');
      }
      assertNotAborted(signal);
    };
    await check();
    const owner = await requests.bootstrapSilently(signal);
    await check();
    if (initial.owner && (initial.owner.channelId !== owner.channelId || initial.owner.likesPlaylistId !== owner.likesPlaylistId)) {
      throw new AuthenticationError('owner-mismatch');
    }
    summary.bootstrapValidated = true;
    // Ephemeral UUID for provider provenance only; never a durable sync attempt.
    const context: IngestionContext = { attemptId: nextId(), owner,
      dataGeneration: initial.control.dataGeneration, authEpoch: initial.control.authEpoch };
    const provider = new YouTubeLikedVideosProvider(requests);
    const metrics = new Map<string, { omitted: boolean; richMissing: boolean; state: string }>();
    let completed = false;
    for await (const event of provider.enumerateLikedVideos(context, signal)) {
      await check();
      if (event.kind === 'page') {
        if (completed) throw new ProviderError('pagination-integrity');
        summary.pages = event.progress.pagesAccepted; summary.rawMemberships = event.progress.rawItems;
        summary.uniqueMemberships = event.progress.uniqueMembership; summary.duplicateVideoItems = event.progress.duplicateVideoItems;
        summary.estimatedTotal = event.progress.estimatedTotal;
        if (event.records.length) summary.hydrationPages++;
        for (const record of event.records) metrics.set(record.videoId, {
          omitted: record.availability.evidence === 'lookup-omitted',
          richMissing: record.title === null || record.channelTitle === null || record.durationSeconds === null,
          state: record.availability.state,
        });
        const values = [...metrics.values()];
        summary.lookupOmitted = values.filter((item) => item.omitted).length;
        summary.hydrated = values.length - summary.lookupOmitted;
        summary.withoutRichMetadata = values.filter((item) => item.richMissing).length;
        summary.unavailable = values.filter((item) => item.state === 'unavailable').length;
        summary.unknownAvailability = values.filter((item) => item.state === 'unknown').length;
        progress({ ...summary });
      } else {
        if (completed || !isTrustedProviderCompletion(event) || event.scope.attemptId !== context.attemptId
          || event.scope.ownerChannelId !== owner.channelId || event.scope.likesPlaylistId !== owner.likesPlaylistId
          || event.scope.dataGeneration !== context.dataGeneration || event.scope.authEpoch !== context.authEpoch
          || event.progress.pagesAccepted !== summary.pages || event.progress.rawItems !== summary.rawMemberships
          || event.progress.uniqueMembership !== metrics.size) throw new ProviderError('pagination-integrity');
        completed = true;
        // Do not return, serialize, persist or hand the capability to a finalizer.
      }
    }
    await check();
    if (!completed) throw new ProviderError('pagination-integrity');
    summary.trustedCompletion = true;
    return resultSchema.parse({ status: 'success', summary });
  } catch (error) {
    summary.trustedCompletion = false;
    const detail = error instanceof AuthenticationError || error instanceof ProviderError
      ? error.detail : new AuthenticationError('unexpected').detail;
    return resultSchema.parse({ status: 'failed', summary, error: detail });
  }
}
