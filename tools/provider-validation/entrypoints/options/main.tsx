import { createRoot } from 'react-dom/client';
import { OptionsApp } from '../../../../src/options/OptionsApp';
import { RuntimeClient } from '../../../../src/runtime/client';
import '../../../../src/options/options.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing Options mount.');
createRoot(root).render(<><aside className="notice"><strong>DEVELOPMENT / RELEASE VALIDATION ONLY</strong>
  <p>After explicit Connect below, <a href="provider-validation.html">open non-destructive provider observation</a>. Sync remains blocked. Do not submit this build to the Store.</p></aside>
  <OptionsApp client={new RuntimeClient()} /></>);

