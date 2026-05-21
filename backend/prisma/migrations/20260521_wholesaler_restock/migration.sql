-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('CUSTOMER', 'RESTOCK');

-- AlterTable
ALTER TABLE "Store" ADD COLUMN "isWholesaler" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "orderType" "OrderType" NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN "buyerStoreId" TEXT;

-- CreateIndex
CREATE INDEX "Store_isWholesaler_idx" ON "Store"("isWholesaler");

-- CreateIndex
CREATE INDEX "Order_buyerStoreId_idx" ON "Order"("buyerStoreId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerStoreId_fkey" FOREIGN KEY ("buyerStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
