CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

ALTER TABLE "BusinessPartner" ADD COLUMN "gender" "Gender";
