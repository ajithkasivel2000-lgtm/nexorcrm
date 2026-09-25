-- AlterTable
ALTER TABLE "User" ADD COLUMN     "calendarToken" TEXT,
ADD COLUMN     "channelPartnerId" TEXT,
ADD COLUMN     "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "bcc" TEXT,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "leadId" TEXT,
    "customerId" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerMobile" TEXT,
    "buyerEmail" TEXT,
    "bookingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agreementValue" DECIMAL(65,30) NOT NULL,
    "bookingAmount" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'Booked',
    "channelPartnerId" TEXT,
    "commissionPct" DECIMAL(65,30),
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMilestone" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DECIMAL(65,30),
    "amount" DECIMAL(65,30) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" TEXT,
    "reference" TEXT,
    "receiptNo" TEXT,
    "notes" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "channelPartnerId" TEXT NOT NULL,
    "percent" DECIMAL(65,30) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "paidOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppSetting" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "phoneNumberId" TEXT NOT NULL DEFAULT '',
    "businessId" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "appSecret" TEXT NOT NULL DEFAULT '',
    "verifyToken" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "direction" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "body" TEXT,
    "template" TEXT,
    "waMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "sentBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadIntegration" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pageId" TEXT,
    "pageAccessToken" TEXT,
    "webhookKey" TEXT,
    "project" TEXT,
    "primarySource" TEXT,
    "leadsReceived" INTEGER NOT NULL DEFAULT 0,
    "lastLeadAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExotelSetting" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "accountSid" TEXT NOT NULL DEFAULT '',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "apiToken" TEXT NOT NULL DEFAULT '',
    "subdomain" TEXT NOT NULL DEFAULT 'api.exotel.com',
    "callerId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExotelSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "userId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "fromNumber" TEXT,
    "toNumber" TEXT NOT NULL,
    "callSid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "durationSec" INTEGER,
    "recordingUrl" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledReport" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'pipeline',
    "frequency" TEXT NOT NULL DEFAULT 'weekly',
    "recipients" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailOutbox_companyId_idx" ON "EmailOutbox"("companyId");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Booking_companyId_idx" ON "Booking"("companyId");

-- CreateIndex
CREATE INDEX "Booking_unitId_idx" ON "Booking"("unitId");

-- CreateIndex
CREATE INDEX "Booking_opportunityId_idx" ON "Booking"("opportunityId");

-- CreateIndex
CREATE INDEX "PaymentMilestone_companyId_idx" ON "PaymentMilestone"("companyId");

-- CreateIndex
CREATE INDEX "PaymentMilestone_bookingId_idx" ON "PaymentMilestone"("bookingId");

-- CreateIndex
CREATE INDEX "PaymentMilestone_dueDate_idx" ON "PaymentMilestone"("dueDate");

-- CreateIndex
CREATE INDEX "Payment_companyId_idx" ON "Payment"("companyId");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_bookingId_key" ON "Commission"("bookingId");

-- CreateIndex
CREATE INDEX "Commission_companyId_idx" ON "Commission"("companyId");

-- CreateIndex
CREATE INDEX "Commission_channelPartnerId_idx" ON "Commission"("channelPartnerId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSetting_companyId_key" ON "WhatsAppSetting"("companyId");

-- CreateIndex
CREATE INDEX "WhatsAppSetting_phoneNumberId_idx" ON "WhatsAppSetting"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_waMessageId_key" ON "WhatsAppMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_companyId_idx" ON "WhatsAppMessage"("companyId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_leadId_createdAt_idx" ON "WhatsAppMessage"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_phone_idx" ON "WhatsAppMessage"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "LeadIntegration_pageId_key" ON "LeadIntegration"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadIntegration_webhookKey_key" ON "LeadIntegration"("webhookKey");

-- CreateIndex
CREATE INDEX "LeadIntegration_companyId_idx" ON "LeadIntegration"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ExotelSetting_companyId_key" ON "ExotelSetting"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_callSid_key" ON "CallLog"("callSid");

-- CreateIndex
CREATE INDEX "CallLog_companyId_idx" ON "CallLog"("companyId");

-- CreateIndex
CREATE INDEX "CallLog_leadId_startedAt_idx" ON "CallLog"("leadId", "startedAt");

-- CreateIndex
CREATE INDEX "ScheduledReport_companyId_idx" ON "ScheduledReport"("companyId");

-- CreateIndex
CREATE INDEX "ScheduledReport_enabled_nextRunAt_idx" ON "ScheduledReport"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");

-- AddForeignKey
ALTER TABLE "PaymentMilestone" ADD CONSTRAINT "PaymentMilestone_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

