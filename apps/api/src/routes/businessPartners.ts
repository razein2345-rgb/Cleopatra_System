import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createBusinessPartner,
  deleteBusinessPartner,
  getBusinessPartner,
  listBusinessPartners,
  updateBusinessPartner,
} from '../controllers/businessPartners.js';
import {
  createContactPerson,
  deleteContactPerson,
  listContactPersons,
  setPrimaryContactPerson,
  updateContactPerson,
} from '../controllers/contactPersons.js';
import {
  createPartnerAddress,
  deletePartnerAddress,
  listPartnerAddresses,
  setDefaultPartnerAddress,
  updatePartnerAddress,
} from '../controllers/partnerAddresses.js';
import { setPartnerCategory, setPartnerTags } from '../controllers/partnerCategoryTags.js';
import {
  createPartnerNote,
  deletePartnerNote,
  listPartnerNotes,
  setPartnerNotePinned,
  updatePartnerNote,
} from '../controllers/partnerNotes.js';
import {
  getPartnerCommercialProfile,
  upsertPartnerCommercialProfile,
} from '../controllers/partnerCommercialProfile.js';

export const businessPartnersRouter = Router();

businessPartnersRouter.use(requireAuth);

businessPartnersRouter.get('/', requirePermission('partners.view'), listBusinessPartners);
businessPartnersRouter.get('/:id', requirePermission('partners.view'), getBusinessPartner);
businessPartnersRouter.post('/', requirePermission('partners.create'), createBusinessPartner);
businessPartnersRouter.put('/:id', requirePermission('partners.edit'), updateBusinessPartner);
businessPartnersRouter.delete(
  '/:id',
  requirePermission('partners.delete'),
  deleteBusinessPartner,
);

// Contact Persons (FEATURE-002 M2) — nested under their owning partner,
// same pattern as /api/users/:id/roles.
businessPartnersRouter.get(
  '/:partnerId/contacts',
  requirePermission('partners.view'),
  listContactPersons,
);
businessPartnersRouter.post(
  '/:partnerId/contacts',
  requirePermission('partners.contacts.manage'),
  createContactPerson,
);
businessPartnersRouter.put(
  '/:partnerId/contacts/:contactId',
  requirePermission('partners.contacts.manage'),
  updateContactPerson,
);
businessPartnersRouter.put(
  '/:partnerId/contacts/:contactId/primary',
  requirePermission('partners.contacts.manage'),
  setPrimaryContactPerson,
);
businessPartnersRouter.delete(
  '/:partnerId/contacts/:contactId',
  requirePermission('partners.contacts.manage'),
  deleteContactPerson,
);

// Addresses (FEATURE-002 M3) — nested under their owning partner, same
// pattern as Contact Persons above.
businessPartnersRouter.get(
  '/:partnerId/addresses',
  requirePermission('partners.view'),
  listPartnerAddresses,
);
businessPartnersRouter.post(
  '/:partnerId/addresses',
  requirePermission('partners.addresses.manage'),
  createPartnerAddress,
);
businessPartnersRouter.put(
  '/:partnerId/addresses/:addressId',
  requirePermission('partners.addresses.manage'),
  updatePartnerAddress,
);
businessPartnersRouter.put(
  '/:partnerId/addresses/:addressId/default',
  requirePermission('partners.addresses.manage'),
  setDefaultPartnerAddress,
);
businessPartnersRouter.delete(
  '/:partnerId/addresses/:addressId',
  requirePermission('partners.addresses.manage'),
  deletePartnerAddress,
);

// Category & Tags (FEATURE-002 M4) — assignment only; the Category/Tag
// catalogs themselves are managed at /api/partner-categories and
// /api/partner-tags (settings.edit). Assignment to a partner uses
// `partners.edit`, per the explicit M4 requirement — no new permission.
businessPartnersRouter.put(
  '/:partnerId/category',
  requirePermission('partners.edit'),
  setPartnerCategory,
);
businessPartnersRouter.put(
  '/:partnerId/tags',
  requirePermission('partners.edit'),
  setPartnerTags,
);

// Notes (FEATURE-002 M5) — nested under their owning partner, same
// pattern as Contact Persons/Addresses. Unlike those, every notes
// endpoint (including list) requires `partners.edit`, not the broader
// `partners.view` — per the explicit M5 requirement ("Use: partners.edit.
// No new permission is required") and because note content is described
// as sensitive internal commentary (e.g. "Has outstanding issue"), not
// something every viewer should see.
businessPartnersRouter.get(
  '/:partnerId/notes',
  requirePermission('partners.edit'),
  listPartnerNotes,
);
businessPartnersRouter.post(
  '/:partnerId/notes',
  requirePermission('partners.edit'),
  createPartnerNote,
);
businessPartnersRouter.put(
  '/:partnerId/notes/:noteId',
  requirePermission('partners.edit'),
  updatePartnerNote,
);
businessPartnersRouter.put(
  '/:partnerId/notes/:noteId/pin',
  requirePermission('partners.edit'),
  setPartnerNotePinned,
);
businessPartnersRouter.delete(
  '/:partnerId/notes/:noteId',
  requirePermission('partners.edit'),
  deletePartnerNote,
);

// Commercial & Credit Profile (FEATURE-002 M6) — nested under the owning
// partner. Gated on `partners.credit.manage` for both read and write (no
// separate view-only permission exists, per 02_PLAN.md §5's note) — a
// deliberately different permission than every other partner sub-resource
// above, per the service-boundary decision in 02_PLAN.md §3: credit
// decisions follow a different approval authority than identity, contacts,
// addresses, categories/tags, or notes.
businessPartnersRouter.get(
  '/:partnerId/commercial-profile',
  requirePermission('partners.credit.manage'),
  getPartnerCommercialProfile,
);
businessPartnersRouter.put(
  '/:partnerId/commercial-profile',
  requirePermission('partners.credit.manage'),
  upsertPartnerCommercialProfile,
);
