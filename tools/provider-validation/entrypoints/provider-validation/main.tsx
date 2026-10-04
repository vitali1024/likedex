import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { z } from 'zod';
import { eventSchema, VALIDATION_PORT, type ValidationResult, type ValidationSummary } from '../../contracts';
import '../../../../src/options/options.css';

z.config({ jitless: true });
function ObservationPage() {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState('');
  const port = useRef<ReturnType<typeof browser.runtime.connect> | null>(null);
  const evidenceDeadline = useRef(0);
  useEffect(() => {
    if (!summary) return;
    const expire = () => {
      if (Date.now() < evidenceDeadline.current) return;
      port.current?.disconnect(); setSummary(null); setResult(null);
      setError('The temporary evidence view expired. Run a new explicit observation if needed.');
    };
    const timer = setTimeout(expire, Math.max(0, evidenceDeadline.current - Date.now()));
    window.addEventListener('focus', expire);
    document.addEventListener('visibilitychange', expire);
    return () => { clearTimeout(timer); window.removeEventListener('focus', expire); document.removeEventListener('visibilitychange', expire); };
  }, [summary]);
  useEffect(() => () => port.current?.disconnect(), []);
  const begin = () => {
    if (port.current) return;
    setRunning(true); setSummary(null); setResult(null); setError('');
    let receivedResult = false;
    const connection = browser.runtime.connect({ name: VALIDATION_PORT });
    port.current = connection;
    connection.onMessage.addListener((message: unknown) => {
      const parsed = eventSchema.safeParse(message);
      if (!parsed.success) { setError('Invalid validation response. No success established.'); connection.disconnect(); return; }
      evidenceDeadline.current = Date.now() + 600_000;
      if (parsed.data.event === 'progress') setSummary(parsed.data.summary);
      else { receivedResult = true; setResult(parsed.data.result); setSummary(parsed.data.result.summary); }
    });
    connection.onDisconnect.addListener(() => {
      // Consume Chrome's lastError without displaying its raw contents.
      void browser.runtime.lastError;
      if (!receivedResult) setError('Observation interrupted or refused. No trusted success established. Return to Options, Connect, and retry explicitly.');
      port.current = null; setRunning(false);
    });
    connection.postMessage({ operation: 'OBSERVE_PROVIDER' });
  };
  return <main className="options-app"><h1>DEVELOPMENT / RELEASE VALIDATION ONLY</h1>
    <p>This observes real YouTube bootstrap, membership pagination and metadata through the existing provider. It does not create a mirror, save a sync attempt, reconcile or prune. Production Sync remains closed.</p>
    <p><a href="options.html">Return to Options</a> and explicitly Connect before observing. Close other Likedex pages during observation. Keep this page open; closing it cancels the run. Worker interruption is failure, not success.</p>
    <p>Only aggregate evidence is shown, temporarily for ten minutes after the last update. No identifiers, titles, response bodies, tokens or page tokens are exported. Counts describe API-visible membership, not a guarantee of uncapped lifetime completeness.</p>
    <button disabled={running} onClick={begin}>Observe provider without syncing</button>
    {running && <button onClick={() => port.current?.disconnect()}>Cancel observation</button>}
    <p role="status">{running ? 'Observing; no trusted completion yet…' : result?.status === 'success'
      ? 'Observation succeeded with genuine trusted provider completion. Human review/approval is still pending; Sync remains closed.'
      : result?.status === 'failed' ? `Observation failed: ${result.error.category} / ${result.error.messageKey}. No success established.` : 'Ready for explicit observation.'}</p>
    {error && <p role="alert">{error}</p>}
    {summary && <><h2>Sanitized evidence</h2><p>Counts are unique memberships except rawMemberships, duplicateVideoItems and page counts. hydrated means lookup returned an entry; withoutRichMetadata means title, channel name or duration is missing. Unknown or unavailable metadata still counts as membership. For duplicates, hydration counts describe the last observation per video.</p>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result ?? { status: 'in-progress', summary }, null, 2)}</pre></>}
    <p>Record only this sanitized result plus build identity, time and naturally unobserved coverage. A trusted API-visible terminal chain does not by itself rule out a provider cap.</p>
  </main>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing observation mount.');
createRoot(root).render(<ObservationPage />);

