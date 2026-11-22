import { describe, expect, it } from 'vitest';
import { backLinkFrom } from './backLink';

describe('backLinkFrom', () => {
  it('reads the back URL and defaults the label', () => {
    expect(backLinkFrom('?back=https%3A%2F%2Fexample.com%2Flab')).toEqual({
      href: 'https://example.com/lab',
      label: 'Back',
    });
  });

  it('uses backLabel when one is given', () => {
    expect(backLinkFrom('?back=https://example.com/lab&backLabel=Robot%20Lab')).toEqual({
      href: 'https://example.com/lab',
      label: 'Robot Lab',
    });
  });

  it('resolves relative links against the current page', () => {
    expect(backLinkFrom('?back=..%2Findex.html', 'https://example.com/app/')).toEqual({
      href: 'https://example.com/index.html',
      label: 'Back',
    });
  });

  it('ignores a blank label', () => {
    expect(backLinkFrom('?back=https://example.com&backLabel=%20%20')?.label).toBe('Back');
  });

  it('returns nothing without a back parameter', () => {
    expect(backLinkFrom('')).toBeNull();
    expect(backLinkFrom('?back=')).toBeNull();
    expect(backLinkFrom('?backLabel=Lab')).toBeNull();
  });

  it('refuses anything that is not http(s)', () => {
    expect(backLinkFrom('?back=javascript:alert(1)')).toBeNull();
    expect(backLinkFrom('?back=data:text/html,hi')).toBeNull();
    expect(backLinkFrom('?back=mailto:team@example.com')).toBeNull();
  });

  it('caps a very long label', () => {
    const label = backLinkFrom(`?back=https://example.com&backLabel=${'x'.repeat(80)}`)?.label;
    expect(label).toHaveLength(40);
  });
});
