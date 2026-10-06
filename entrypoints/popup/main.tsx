import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { Launcher } from '@/src/launcher/Launcher';
import { LauncherController } from '@/src/launcher/controller';
import '@/src/launcher/launcher.css';

const root = document.getElementById('root');
if (!root) throw new Error('Likedex launcher mount element is missing.');
// No RuntimeClient, library observation, storage, auth or provider composition.
createRoot(root).render(<Launcher controller={new LauncherController(browser, () => { window.close(); })} />);
