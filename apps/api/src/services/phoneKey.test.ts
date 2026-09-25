import { describe, expect, it } from 'vitest';
import { normalizePhoneKey } from '@cleopatra/shared';

/**
 * The comparison key behind duplicate-phone detection (CRM review, 2026-09-25). Two spellings of
 * the same number must give the same key; anything too short to identify someone gives null so
 * it is never reported as a duplicate.
 */
describe('normalizePhoneKey', () => {
  it('every common way of writing the same Egyptian mobile gives one key', () => {
    const spellings = [
      '01012345678',
      '010 1234 5678',
      '010-1234-5678',
      '+20 101 234 5678',
      '+201012345678',
      '00201012345678',
      '201012345678',
      '1012345678',
      '(010) 12345678',
    ];
    const keys = new Set(spellings.map((s) => normalizePhoneKey(s)));
    expect([...keys]).toEqual(['1012345678']);
  });

  it('Arabic-Indic and Persian digits are read as ordinary digits', () => {
    expect(normalizePhoneKey('٠١٠١٢٣٤٥٦٧٨')).toBe('1012345678');
    expect(normalizePhoneKey('۰۱۰۱۲۳۴۵۶۷۸')).toBe('1012345678');
  });

  it('different numbers give different keys', () => {
    expect(normalizePhoneKey('01012345678')).not.toBe(normalizePhoneKey('01112345678'));
    expect(normalizePhoneKey('01012345678')).not.toBe(normalizePhoneKey('01012345679'));
  });

  it('a landline keeps its area code and is not confused with a mobile', () => {
    expect(normalizePhoneKey('02 2345 6789')).toBe('223456789');
    expect(normalizePhoneKey('02 2345 6789')).not.toBe(normalizePhoneKey('01012345678'));
  });

  it('empty, missing or too-short values are null (never a duplicate of anything)', () => {
    expect(normalizePhoneKey(null)).toBeNull();
    expect(normalizePhoneKey(undefined)).toBeNull();
    expect(normalizePhoneKey('')).toBeNull();
    expect(normalizePhoneKey('123')).toBeNull();
    expect(normalizePhoneKey('ext. 5')).toBeNull();
  });
});
