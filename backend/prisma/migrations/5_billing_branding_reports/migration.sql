-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "planKey" TEXT,
ADD COLUMN     "razorpayCustomerId" TEXT,
ADD COLUMN     "razorpaySubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'trialing',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "maxUsers" INTEGER NOT NULL,
    "description" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "razorpayPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "planKey" TEXT,
    "description" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "gstPercent" DECIMAL(65,30) NOT NULL DEFAULT 18,
    "totalPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'paid',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "razorpayPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReport" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdBy" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_key_key" ON "Plan"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_razorpayPlanId_key" ON "Plan"("razorpayPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_razorpayPaymentId_key" ON "Invoice"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_idx" ON "Invoice"("companyId");

-- CreateIndex
CREATE INDEX "SavedReport_companyId_idx" ON "SavedReport"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_razorpaySubscriptionId_key" ON "Company"("razorpaySubscriptionId");


-- The platform owner's own company is not a customer: it never expires.
UPDATE "Company" SET "subscriptionStatus" = 'internal' WHERE "id" = 'CMP-DEFAULT';

-- Starting plans (prices in paise, before GST). Edit them under Platform → Plans.
INSERT INTO "Plan" ("id", "key", "name", "pricePaise", "maxUsers", "description", "features", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid()::text, 'starter', 'Starter', 99900, 5, 'For small teams getting started', ARRAY['Leads & opportunities','Website & campaign leads','Email notifications'], 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'growth', 'Growth', 299900, 20, 'For growing sales teams', ARRAY['Everything in Starter','WhatsApp & click-to-call','Facebook & Google leads','Bookings & payments','Scheduled reports'], 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'enterprise', 'Enterprise', 799900, 0, 'Unlimited users and priority support', ARRAY['Everything in Growth','Unlimited users','Channel partner portal','Priority support'], 3, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
