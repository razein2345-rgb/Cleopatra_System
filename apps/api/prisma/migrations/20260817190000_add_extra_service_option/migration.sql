-- Owner (2026-08-17, "عايز في الإعدادات أقدر أضيف على الخدمات الإضافية
-- خدمة") — makes the order composer's "الخدمات الإضافية" checklist an
-- admin-managed catalog instead of hardcoded options.

CREATE TABLE "ExtraServiceOption" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtraServiceOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtraServiceOption_label_key" ON "ExtraServiceOption"("label");
CREATE INDEX "ExtraServiceOption_isDeleted_idx" ON "ExtraServiceOption"("isDeleted");
CREATE INDEX "ExtraServiceOption_isActive_idx" ON "ExtraServiceOption"("isActive");

-- Seed the 4 options the order composer already hardcoded, in their
-- existing display order, so the checklist doesn't go blank on cutover.
INSERT INTO "ExtraServiceOption" ("label", "sortOrder", "updatedAt") VALUES
  ('تغليف / تكييس', 0, CURRENT_TIMESTAMP),
  ('لصق بنطة واحدة', 1, CURRENT_TIMESTAMP),
  ('لصق بنطتين', 2, CURRENT_TIMESTAMP),
  ('عينة / نموذج', 3, CURRENT_TIMESTAMP);
