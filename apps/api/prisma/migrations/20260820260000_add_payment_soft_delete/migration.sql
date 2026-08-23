-- Owner (2026-08-20, "تعديل/حذف مقيد بصلاحية خاصة") — payments were
-- purely additive until now; edit/delete both need a soft-delete trail.
ALTER TABLE "Payment" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedBy" UUID;
