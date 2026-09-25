import { describe, expect, it } from 'vitest';
import { normalizeExternalUrl } from './url';

/**
 * The communication hub stores whatever URL an admin typed and opens it for every employee, so
 * this normalizer is the last line of defence: anything that is not already http(s) is prefixed
 * with "https://", which also turns a "javascript:" / "data:" payload into an inert host name
 * instead of a script that would run in the app's session.
 */
describe('normalizeExternalUrl', () => {
  it('leaves http and https URLs untouched (any case)', () => {
    expect(normalizeExternalUrl('https://facebook.com/page')).toBe('https://facebook.com/page');
    expect(normalizeExternalUrl('http://example.test')).toBe('http://example.test');
    expect(normalizeExternalUrl('HTTPS://Example.test')).toBe('HTTPS://Example.test');
  });

  it('adds https:// to a bare host or path (wa.me/..., facebook.com/...)', () => {
    expect(normalizeExternalUrl('wa.me/201000000000')).toBe('https://wa.me/201000000000');
    expect(normalizeExternalUrl('facebook.com/page')).toBe('https://facebook.com/page');
  });

  it('never lets a script or data scheme through as a scheme', () => {
    for (const evil of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)']) {
      const normalized = normalizeExternalUrl(evil);
      expect(normalized.startsWith('https://')).toBe(true);
      expect(/^(javascript|data|vbscript):/i.test(normalized)).toBe(false);
    }
  });
});
