-- A company can run the CRM on its own domain (crm.roofonwalls.com).
ALTER TABLE "Company" ADD COLUMN "customDomain" TEXT;
CREATE UNIQUE INDEX "Company_customDomain_key" ON "Company"("customDomain");
