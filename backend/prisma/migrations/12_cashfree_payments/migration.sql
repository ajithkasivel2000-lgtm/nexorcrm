-- Replace provider-specific fields while clearing saved payment credentials
-- and live provider references. Historical invoice payment references remain.
ALTER TABLE "Company" RENAME COLUMN "razorpaySubscriptionId" TO "subscriptionGatewayId";
ALTER TABLE "Company" DROP COLUMN "razorpayCustomerId";
UPDATE "Company" SET "subscriptionGatewayId" = NULL;
ALTER INDEX "Company_razorpaySubscriptionId_key" RENAME TO "Company_subscriptionGatewayId_key";

ALTER TABLE "Plan" RENAME COLUMN "razorpayPlanId" TO "gatewayPlanId";
UPDATE "Plan" SET "gatewayPlanId" = NULL;
ALTER INDEX "Plan_razorpayPlanId_key" RENAME TO "Plan_gatewayPlanId_key";

ALTER TABLE "Invoice" RENAME COLUMN "razorpayPaymentId" TO "gatewayPaymentId";
ALTER INDEX "Invoice_razorpayPaymentId_key" RENAME TO "Invoice_gatewayPaymentId_key";

ALTER TABLE "PaymentGatewaySetting" RENAME COLUMN "keyId" TO "appId";
ALTER TABLE "PaymentGatewaySetting" RENAME COLUMN "keySecret" TO "secretKey";
ALTER TABLE "PaymentGatewaySetting" DROP COLUMN "webhookSecret";
UPDATE "PaymentGatewaySetting" SET "appId" = '', "secretKey" = '';

ALTER TABLE "PaymentLink" RENAME COLUMN "razorpayLinkId" TO "gatewayLinkId";
UPDATE "PaymentLink" SET "gatewayLinkId" = NULL, "status" = 'cancelled' WHERE "gatewayLinkId" IS NOT NULL AND "status" = 'created';
ALTER INDEX "PaymentLink_razorpayLinkId_key" RENAME TO "PaymentLink_gatewayLinkId_key";
