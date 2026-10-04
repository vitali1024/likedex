import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Foundation } from '@/src/Foundation';
import '@/src/foundation.css';

const root = document.getElementById('root');
if (!root) throw new Error('Likedex Options mount element is missing.');

createRoot(root).render(<StrictMode><Foundation surface="Options" /></StrictMode>);
