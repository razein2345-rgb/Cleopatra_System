-- Owner (2026-08-20, "محتاج اشوف مين الموظف الأكتيف على السيستم") — a
-- "currently online" signal, distinct from lastLoginAt (sign-in moment only).
ALTER TABLE "StaffProfile" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
