-- Remove legacy Razorpay identifiers without deleting accounting records.
-- Razorpay payment IDs use the pay_ prefix and payment-link IDs use plink_.
-- Cashfree payment IDs are stored separately in the same generic columns.
UPDATE "Invoice"
SET "gatewayPaymentId" = NULL
WHERE LEFT("gatewayPaymentId", 4) = 'pay_';

UPDATE "Payment"
SET "gatewayPaymentId" = NULL,
    "reference" = CASE
      WHEN LEFT("reference", 4) = 'pay_' THEN NULL
      ELSE "reference"
    END
WHERE LEFT("gatewayPaymentId", 4) = 'pay_'
   OR LEFT("reference", 4) = 'pay_';

UPDATE "PaymentLink"
SET "gatewayLinkId" = CASE
      WHEN LEFT("gatewayLinkId", 6) = 'plink_' THEN NULL
      ELSE "gatewayLinkId"
    END,
    "shortUrl" = CASE
      WHEN LEFT("gatewayLinkId", 6) = 'plink_' THEN NULL
      ELSE "shortUrl"
    END,
    "paymentId" = CASE
      WHEN LEFT("paymentId", 4) = 'pay_' THEN NULL
      ELSE "paymentId"
    END
WHERE LEFT("gatewayLinkId", 6) = 'plink_'
   OR LEFT("paymentId", 4) = 'pay_';
