-- Facebook Lead Ads webhooks were verified with the company's WHATSAPP app
-- secret, so a company running Lead Ads without WhatsApp connected (and no
-- platform-wide META_APP_SECRET) silently dropped every lead. Each Facebook
-- integration can now carry the secret of the Meta app that delivers its
-- webhooks; verification falls back to the WhatsApp setting and then the
-- platform secret when it is not set.
ALTER TABLE "LeadIntegration" ADD COLUMN "appSecret" TEXT;
