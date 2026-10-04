import { browser } from 'wxt/browser';
import { failure, requestSchema, responseSchema, resultSchemas, revisionSchema,
  type ClientResult, type RevisionEvent, type RuntimeOperation, type RuntimeRequest, type RuntimeResult } from './contracts';

export interface RuntimeTransport {
  send(request: RuntimeRequest): Promise<unknown>;
  subscribe?(listener: (event: unknown) => void): () => void;
}
export class RuntimeClient {
  constructor(private readonly transport: RuntimeTransport = {
    send: (request) => browser.runtime.sendMessage(request),
    subscribe: (listener) => {
      const receive = (message: unknown) => { listener(message); };
      browser.runtime.onMessage.addListener(receive);
      return () => browser.runtime.onMessage.removeListener(receive);
    },
  }, private readonly nextId: () => string = () => crypto.randomUUID()) {}

  async request<K extends RuntimeOperation>(operation: K): Promise<ClientResult<K>> {
    const request = requestSchema.safeParse({ protocolVersion: 1, requestId: this.nextId(), operation, payload: {} });
    if (!request.success) return { ok: false, error: failure('protocol-error') };
    let raw: unknown;
    try { raw = await this.transport.send(request.data); }
    catch { return { ok: false, error: failure('transport-error') }; }
    const response = responseSchema.safeParse(raw);
    if (!response.success || response.data.requestId !== request.data.requestId || response.data.operation !== operation) {
      return { ok: false, error: failure('protocol-error') };
    }
    if (!response.data.ok) return { ok: false, error: response.data.error };
    const result = resultSchemas[operation].safeParse(response.data.result);
    if (!result.success) return { ok: false, error: failure('protocol-error') };
    return { ok: true, result: result.data as RuntimeResult<K> };
  }

  // Hints carry no Authorized Data. Consumers refetch and reject old snapshots.
  subscribe(listener: (event: RevisionEvent) => void): () => void {
    let lastRevision = -1;
    return this.transport.subscribe?.((raw) => {
      const event = revisionSchema.safeParse(raw);
      if (event.success && event.data.revision > lastRevision) {
        lastRevision = event.data.revision; listener(event.data);
      }
    }) ?? (() => {});
  }
}
