-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "gatewayPaymentId" TEXT;

-- CreateTable
CREATE TABLE "PaymentGatewaySetting" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "keyId" TEXT NOT NULL DEFAULT '',
    "keySecret" TEXT NOT NULL DEFAULT '',
    "webhookSecret" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentGatewaySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLink" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "razorpayLinkId" TEXT,
    "shortUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "paymentId" TEXT,
    "createdBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerLoginToken" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerLoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerSession" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiry" TIMESTAMP(3) NOT NULL,
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionReminderSetting" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "daysBefore" INTEGER[] DEFAULT ARRAY[7, 1]::INTEGER[],
    "overdueEveryDays" INTEGER NOT NULL DEFAULT 7,
    "maxOverdue" INTEGER NOT NULL DEFAULT 4,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "whatsappTemplate" TEXT NOT NULL DEFAULT '',
    "whatsappLanguage" TEXT NOT NULL DEFAULT 'en',
    "includePayLink" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionReminderSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionReminderLog" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGatewaySetting_companyId_key" ON "PaymentGatewaySetting"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_razorpayLinkId_key" ON "PaymentLink"("razorpayLinkId");

-- CreateIndex
CREATE INDEX "PaymentLink_companyId_idx" ON "PaymentLink"("companyId");

-- CreateIndex
CREATE INDEX "PaymentLink_bookingId_status_idx" ON "PaymentLink"("bookingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerLoginToken_tokenHash_key" ON "BuyerLoginToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BuyerLoginToken_companyId_idx" ON "BuyerLoginToken"("companyId");

-- CreateIndex
CREATE INDEX "BuyerSession_companyId_idx" ON "BuyerSession"("companyId");

-- CreateIndex
CREATE INDEX "BuyerSession_email_idx" ON "BuyerSession"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionReminderSetting_companyId_key" ON "CollectionReminderSetting"("companyId");

-- CreateIndex
CREATE INDEX "CollectionReminderLog_companyId_idx" ON "CollectionReminderLog"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionReminderLog_bookingId_milestoneId_slot_channel_key" ON "CollectionReminderLog"("bookingId", "milestoneId", "slot", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayPaymentId_key" ON "Payment"("gatewayPaymentId");

