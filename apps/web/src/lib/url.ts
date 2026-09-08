/** A raw admin/user-typed URL (with or without a scheme) — normalized so a bare "facebook.com/..." still opens correctly. Shared by ContactLinks and CommunicationHubPage, both of which store links exactly this way. */
export function normalizeExternalUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
