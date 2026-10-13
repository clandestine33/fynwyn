/*
  Warnings:

  - You are about to drop the column `sheetSyncedAt` on the `Customer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "sheetSyncedAt";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PackageBenefit" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "RewardEntitlement" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "SheetRow" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hash" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SheetRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetCounter" (
    "prefix" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SheetCounter_pkey" PRIMARY KEY ("prefix")
);

-- CreateIndex
CREATE UNIQUE INDEX "SheetRow_entityType_entityId_key" ON "SheetRow"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SheetRow_entityType_code_key" ON "SheetRow"("entityType", "code");
