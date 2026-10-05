ALTER TABLE "Company"
  ADD COLUMN "trialStartedAt" TIMESTAMP(3),
  ADD COLUMN "nextBillingAt" TIMESTAMP(3),
  ADD COLUMN "subscriptionAmountPaise" INTEGER,
  ADD COLUMN "billingCycle" TEXT,
  ADD COLUMN "subscriptionSessionId" TEXT,
  ADD COLUMN "subscriptionRequestKey" TEXT,
  ADD COLUMN "authorizationStatus" TEXT,
  ADD COLUMN "subscriptionActivatedAt" TIMESTAMP(3),
  ADD COLUMN "signupRequestKey" TEXT;

CREATE UNIQUE INDEX "Company_subscriptionRequestKey_key"
  ON "Company"("subscriptionRequestKey");

CREATE UNIQUE INDEX "Company_signupRequestKey_key"
  ON "Company"("signupRequestKey");
