/**
 * Owner (2026-08-26, "لما احط رقم العميل يتحول للينك وتساب فا اول ما ادوس
 * عليه يدخلني على وتسابه من السيستم") — a plain `https://wa.me/` deep
 * link, no WhatsApp Business API/account involved: it just opens
 * WhatsApp (web or the installed app) with that contact's chat already
 * loaded, ready for the staff member to type and send themselves — same
 * as manually searching the number, just one click instead.
 *
 * Egyptian mobile numbers are the overwhelming common case here (local
 * "01XXXXXXXXX" format) — normalized to international (country code 20,
 * no leading zero) since that's what wa.me requires. A number already
 * typed with a country code (leading "00"/"20"/"+20") is left as-is past
 * stripping formatting characters.
 */
export function whatsappLink(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return null;
  let intl = digits;
  if (digits.startsWith('00')) intl = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) intl = `20${digits.slice(1)}`;
  return `https://wa.me/${intl}`;
}
