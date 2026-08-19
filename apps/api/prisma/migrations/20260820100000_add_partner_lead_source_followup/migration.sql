-- PRODUCT_ROADMAP.md §2 "المرحلة الأولى" — CRM Phase 1's cheapest first
-- step: simple fields on BusinessPartner (Lead Source, Last Contacted,
-- Next Follow-up), zero new modules. Purely additive: a new enum plus
-- three nullable columns, nothing existing is touched.

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('REFERRAL', 'SOCIAL_MEDIA', 'WALK_IN', 'PHONE_INQUIRY', 'WEBSITE', 'REPEAT_CUSTOMER', 'OTHER');

-- AlterTable
ALTER TABLE "BusinessPartner" ADD COLUMN "leadSource" "LeadSource",
ADD COLUMN "lastContactedAt" TIMESTAMP(3),
ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);
