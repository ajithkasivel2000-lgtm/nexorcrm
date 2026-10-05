ALTER TABLE "Company"
  ADD COLUMN "enrollmentPaymentLinkId" TEXT,
  ADD COLUMN "enrollmentPaymentLinkUrl" TEXT,
  ADD COLUMN "enrollmentPaymentLinkExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Company_enrollmentPaymentLinkId_key"
  ON "Company"("enrollmentPaymentLinkId");
