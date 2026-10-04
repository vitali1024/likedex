import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { OptionsApp } from '../../../../src/options/OptionsApp';
import { RuntimeClient } from '../../../../src/runtime/client';
import { responseSchema } from '../../../../src/runtime/contracts';
import type { AuthenticationDiagnostic } from '../../../../src/auth/errors';
import '../../../../src/options/options.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing Options mount.');
function ValidationOptions() {
  const [diagnostic, setDiagnostic] = useState<AuthenticationDiagnostic | null>(null);
  useEffect(() => {
    if (!diagnostic) return;
    const deadline = Date.now() + 600_000;
    const expire = () => { if (Date.now() >= deadline) setDiagnostic(null); };
    const timer = setTimeout(expire, 600_000);
    window.addEventListener('focus', expire);
    document.addEventListener('visibilitychange', expire);
    return () => { clearTimeout(timer); window.removeEventListener('focus', expire); document.removeEventListener('visibilitychange', expire); };
  }, [diagnostic]);
  const client = useMemo(() => new RuntimeClient({
    send: async (request) => {
      if (request.operation === 'AUTH_CONNECT') setDiagnostic(null);
      try {
        const raw: unknown = await browser.runtime.sendMessage(request);
        if (request.operation === 'AUTH_CONNECT') {
          const parsed = responseSchema.safeParse(raw);
          if (parsed.success && parsed.data.requestId === request.requestId && parsed.data.operation === request.operation) {
            if (!parsed.data.ok) setDiagnostic(parsed.data.error.diagnostic ?? { phase: 'runtime', endpoint: null,
              httpStatus: null, errorCode: 'unexpected', retryOccurred: false });
          } else setDiagnostic({ phase: 'runtime', endpoint: null, httpStatus: null, errorCode: 'unexpected', retryOccurred: false });
        }
        return raw;
      } catch {
        if (request.operation === 'AUTH_CONNECT') setDiagnostic({ phase: 'runtime', endpoint: null,
          httpStatus: null, errorCode: 'unexpected', retryOccurred: false });
        throw new Error('Validation runtime transport failed.');
      }
    },
    subscribe: (listener) => {
      browser.runtime.onMessage.addListener(listener);
      return () => browser.runtime.onMessage.removeListener(listener);
    },
  }), []);
  return <><aside className="notice"><strong>DEVELOPMENT / RELEASE VALIDATION ONLY</strong>
  <p>After explicit Connect below, <a href="provider-validation.html">open non-destructive provider observation</a>. Sync remains blocked. Do not submit this build to the Store.</p></aside>
    {diagnostic && <section aria-label="Sanitized Connect diagnostic"><p>Copy only this safe failure diagnostic; it expires after ten minutes. No credentials or provider data are included.</p>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(diagnostic, null, 2)}</pre></section>}
    <OptionsApp client={client} /></>;
}
createRoot(root).render(<ValidationOptions />);

