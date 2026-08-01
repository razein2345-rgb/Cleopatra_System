# ADR 0014: Attachments schema reserved ahead of implementation

**Status:** Accepted

## Context

Legacy has no file-attachment concept beyond a single base64-encoded logo image stored inline in settings (LEGACY_ANALYSIS.md §4). Explicit requirement: Customers, Quotations, Orders/Invoices, and Work Orders should support future attachment of files (PDFs, AI/PSD/CDR design files, images, customer-supplied artwork) — schema and relationships only, no upload implementation yet.

## Decision

A single `Attachment` table, not four separate per-entity attachment tables: `fileName`, `fileType`, `storagePath` (nullable, reserved for a future Supabase Storage key), `sizeBytes` (nullable), `uploadedById`, and **nullable** foreign keys to `Customer`, `Quotation`, `Order`, and `WorkOrder`. "Invoices" and "Orders" are the same table in this system (`Order` doubles as invoice, per the legacy behavior it's ported from), so four nullable relations cover exactly the five document types the requirement named.

No upload endpoint, no storage bucket wiring, and no file-type validation exist yet.

## Consequences

- One shared table, rather than `CustomerAttachment`/`OrderAttachment`/etc., keeps attachment-listing/management logic in one place if a future "all attachments" admin view is ever needed, at the cost of every row having three unused nullable FK columns — an acceptable trade-off at this scale.
- Nothing enforces "exactly one of the four FKs is set" at the database level (Prisma doesn't support arbitrary multi-column CHECK constraints in `schema.prisma`); whichever phase implements uploads must enforce that invariant at the application layer.
- Choosing Supabase Storage (vs. S3, a local filesystem, etc.) as the eventual storage backend is implied by `storagePath`'s naming but not yet committed to — that's a decision for the phase that actually implements uploads to make explicitly, potentially with its own ADR if a different backend is chosen instead.
