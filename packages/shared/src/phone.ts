/**
 * A comparison key for a phone number typed by hand: "010 1234 5678", "+20 101 234 5678",
 * "0020-101-2345678" and "٠١٠١٢٣٤٥٦٧٨" are the same person and must produce the same key.
 *
 * Steps: Arabic-Indic / Persian digits -> ASCII, keep digits only, drop an Egypt country
 * prefix (00 20 / 20 when the number is long enough to have one), drop the national leading
 * zero. Returns null when what is left is too short (< 7 digits) to identify anyone - such a
 * value is never treated as a duplicate of another.
 *
 * Used for duplicate detection only; the phone is always stored exactly as typed.
 */
export function normalizePhoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');

  if (digits.startsWith('0020')) digits = digits.slice(4);
  else if (digits.startsWith('20') && digits.length >= 12) digits = digits.slice(2);

  digits = digits.replace(/^0+/, '');
  return digits.length >= 7 ? digits : null;
}
