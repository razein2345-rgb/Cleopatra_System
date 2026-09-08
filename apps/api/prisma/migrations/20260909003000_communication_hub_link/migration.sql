-- CreateTable
CREATE TABLE "CommunicationHubLink" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationHubLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationHubLink_isDeleted_idx" ON "CommunicationHubLink"("isDeleted");
