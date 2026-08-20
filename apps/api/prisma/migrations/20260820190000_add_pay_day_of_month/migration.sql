-- Owner (2026-08-20, "عندي موظف بيبدأ قبض من يوم 9 في الشهر مش من يوم 1")
-- Per-employee configurable pay-cycle start day for MONTHLY payFrequency.
-- Null = unchanged behavior (cycle starts on the 1st).
ALTER TABLE "StaffProfile" ADD COLUMN "payDayOfMonth" INTEGER;
