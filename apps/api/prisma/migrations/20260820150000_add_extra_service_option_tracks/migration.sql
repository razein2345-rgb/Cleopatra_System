-- Owner ("عايز الخدمات الإضافية دي على حسب القسم... انا اللي احدد ده من
-- الإعدادات") — an admin-managed list of which production tracks each
-- extra-service option applies to. Purely additive: a new array column,
-- defaulting to an empty array (every existing row gets "[]", meaning "no
-- restriction — every track", byte-identical to today's actual behavior).

-- AlterTable
ALTER TABLE "ExtraServiceOption" ADD COLUMN "applicableTracks" "ProductionTrack"[] NOT NULL DEFAULT ARRAY[]::"ProductionTrack"[];
