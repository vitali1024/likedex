import type { CSSProperties } from 'react';

const paths = {
  play: 'm9 5 11 7-11 7Z',
  search: 'm21 21-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  close: 'm6 6 12 12M6 18 18 6',
  sync: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 1l1 5M4 12l1 5a8 8 0 0 0 13 1',
  link: 'M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7',
  unplug: 'm19 5 3-3M2 22l3-3M6.3 20.3a1 1 0 0 0 1.4 0l3.5-3.5a4 4 0 0 0 0-5.6l-.4-.4a4 4 0 0 0-5.6 0l-3.5 3.5a1 1 0 0 0 0 1.4ZM7.5 13.5l3 3M16 8l-2 2M14 6l-2 2M12 2l10 10',
  loader: 'M12 2a10 10 0 1 1-10 10',
  warning: 'M12 9v4m0 4v.01M10.3 3.9 1.8 18.6A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.4L13.7 3.9a2 2 0 0 0-3.4 0',
  check: 'm5 12 4 4L19 6',
  copy: 'M9 9h12v12H9ZM15 5V3H3v12h2',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  chevron: 'm9 5 7 7-7 7',
  down: 'm6 9 6 6 6-6',
  filter: 'M4 7h16M7 12h10M10 17h4',
  shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7ZM8 12l3 3 5-5',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  calendar: 'M3 5h18v16H3ZM7 3v4m10-4v4M3 11h18',
  info: 'M12 11v6m0-10v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
} as const;

export function Icon({ name, className = '', style }: { name: keyof typeof paths; className?: string; style?: CSSProperties }) {
  return <svg className={`icon ${className}`} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
