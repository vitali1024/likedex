import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsApp } from '@/src/options/OptionsApp';
import { RuntimeClient } from '@/src/runtime/client';
import '@/src/options/options.css';

const root = document.getElementById('root');
if (!root) throw new Error('Likedex Options mount element is missing.');

const client = new RuntimeClient();
createRoot(root).render(<StrictMode><OptionsApp client={client} /></StrictMode>);
