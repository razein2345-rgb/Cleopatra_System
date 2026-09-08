import { ExternalLink, Mail, MessageCircle, Phone } from 'lucide-react';
import { whatsappLink } from '@/lib/whatsapp';

/** `facebookUrl` (or any external link) is stored however typed (with or without a scheme) — normalized here so a bare "facebook.com/..." still opens correctly. */
function normalizeExternalUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * Owner (2026-09-08, "زرار اتصال بالعميل دايركت... وكذلك عند العملا إمكانية
 * الاتصال والوصول للوتساب وكل وسائل التواصل بتاعتهم") — one row of
 * one-click contact icons (WhatsApp / call / email / external link),
 * reused as-is everywhere a Lead or a customer (BusinessPartner) is listed
 * or opened, instead of re-implementing the same icon row per screen
 * (rule 5). Each icon only renders when that contact method is actually on
 * file.
 */
export function ContactLinks({
  phone,
  email,
  facebookUrl,
  className = '',
}: {
  phone?: string | null;
  email?: string | null;
  facebookUrl?: string | null;
  className?: string;
}) {
  const wa = phone ? whatsappLink(phone) : null;

  if (!phone && !email && !facebookUrl) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" title="واتساب" className="text-success hover:opacity-70">
          <MessageCircle className="size-4" />
        </a>
      )}
      {phone && (
        <a href={`tel:${phone}`} title="اتصال" className="text-primary hover:opacity-70">
          <Phone className="size-4" />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} title="إيميل" className="text-muted-foreground hover:opacity-70">
          <Mail className="size-4" />
        </a>
      )}
      {facebookUrl && (
        <a
          href={normalizeExternalUrl(facebookUrl)}
          target="_blank"
          rel="noopener noreferrer"
          title="فيسبوك"
          className="text-muted-foreground hover:opacity-70"
        >
          <ExternalLink className="size-4" />
        </a>
      )}
    </div>
  );
}
