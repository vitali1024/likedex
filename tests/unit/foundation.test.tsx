import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Foundation } from '@/src/Foundation';

describe('Phase 1 shell composition (AC-VERIFY-001 foundation)', () => {
  it.each(['Options', 'Side Panel'] as const)('renders the %s shell through the source alias', (surface) => {
    const html = renderToStaticMarkup(<Foundation surface={surface} />);
    expect(html).toContain('<h1>Likedex</h1>');
    expect(html).toContain(`<h2>${surface}</h2>`);
    expect(html).toContain('Product features are not available yet.');
  });
});
