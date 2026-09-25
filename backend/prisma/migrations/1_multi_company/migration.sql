-- Multi-company: every existing row belongs to the one company that existed
-- before this migration. New rows always name their company explicitly (the
-- Prisma client extension in prismaClient.js), so the backfill default is
-- dropped again at the end.

-- DropIndex
DROP INDEX "Project_projectName_key";

-- DropIndex
DROP INDEX "Project_projectCode_key";

-- DropIndex
DROP INDEX "Project_slug_key";

-- DropIndex
DROP INDEX "User_employeeId_key";

-- DropIndex
DROP INDEX "Department_name_key";

-- DropIndex
DROP INDEX "UserGroup_groupName_key";

-- DropIndex
DROP INDEX "EmailTemplate_templateKey_key";

-- DropIndex
DROP INDEX "RRQType_typeName_key";

-- DropIndex
DROP INDEX "Designation_name_key";

-- DropIndex
DROP INDEX "Branch_name_key";

-- DropIndex
DROP INDEX "Location_name_key";

-- AlterTable
ALTER TABLE "ChannelPartner" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ChannelPartnerLog" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Leads" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "GlobalUserSetting" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "LeadLog" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "MailSetting" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "OpenReason" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "CallStatus" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "LeadStatus" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "LeadType" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Note" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "LineItem" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Competitor" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Risk" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "StageHistory" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "OpportunityLog" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "PrimarySource" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ProjectBuilding" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ProjectUnit" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ProjectStatus" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ProjectType" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "RegistrationSetting" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "RRQ" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "SecondarySource" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "SecuritySetting" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "SessionSetting" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "TertiarySource" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Department" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "UserAuditLog" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "UserStatusHistory" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "UserGroup" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "UserGroupMembers" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "SystemLog" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "EmailTemplate" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "RRQType" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ChatRoom" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ChatRoomMember" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ChatRoomMessage" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "LeadAssignment" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "LeadAssignmentSetting" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "SiteVisit" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "SiteVisitNotification" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Designation" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "Location" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "UserPermission" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ReminderSetting" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- AlterTable
ALTER TABLE "ReminderLog" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'CMP-DEFAULT';

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "plan" TEXT,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Company_publicKey_key" ON "Company"("publicKey");

-- CreateIndex
CREATE INDEX "ChannelPartner_companyId_idx" ON "ChannelPartner"("companyId");

-- CreateIndex
CREATE INDEX "ChannelPartnerLog_companyId_idx" ON "ChannelPartnerLog"("companyId");

-- CreateIndex
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");

-- CreateIndex
CREATE INDEX "Leads_companyId_idx" ON "Leads"("companyId");

-- CreateIndex
CREATE INDEX "GlobalUserSetting_companyId_idx" ON "GlobalUserSetting"("companyId");

-- CreateIndex
CREATE INDEX "Lead_companyId_idx" ON "Lead"("companyId");

-- CreateIndex
CREATE INDEX "LeadLog_companyId_idx" ON "LeadLog"("companyId");

-- CreateIndex
CREATE INDEX "MailSetting_companyId_idx" ON "MailSetting"("companyId");

-- CreateIndex
CREATE INDEX "OpenReason_companyId_idx" ON "OpenReason"("companyId");

-- CreateIndex
CREATE INDEX "CallStatus_companyId_idx" ON "CallStatus"("companyId");

-- CreateIndex
CREATE INDEX "LeadStatus_companyId_idx" ON "LeadStatus"("companyId");

-- CreateIndex
CREATE INDEX "LeadType_companyId_idx" ON "LeadType"("companyId");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_idx" ON "Opportunity"("companyId");

-- CreateIndex
CREATE INDEX "Activity_companyId_idx" ON "Activity"("companyId");

-- CreateIndex
CREATE INDEX "Task_companyId_idx" ON "Task"("companyId");

-- CreateIndex
CREATE INDEX "Note_companyId_idx" ON "Note"("companyId");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "Document_companyId_idx" ON "Document"("companyId");

-- CreateIndex
CREATE INDEX "LineItem_companyId_idx" ON "LineItem"("companyId");

-- CreateIndex
CREATE INDEX "Competitor_companyId_idx" ON "Competitor"("companyId");

-- CreateIndex
CREATE INDEX "Risk_companyId_idx" ON "Risk"("companyId");

-- CreateIndex
CREATE INDEX "StageHistory_companyId_idx" ON "StageHistory"("companyId");

-- CreateIndex
CREATE INDEX "OpportunityLog_companyId_idx" ON "OpportunityLog"("companyId");

-- CreateIndex
CREATE INDEX "PrimarySource_companyId_idx" ON "PrimarySource"("companyId");

-- CreateIndex
CREATE INDEX "Project_companyId_idx" ON "Project"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_projectName_key" ON "Project"("companyId", "projectName");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_projectCode_key" ON "Project"("companyId", "projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_slug_key" ON "Project"("companyId", "slug");

-- CreateIndex
CREATE INDEX "ProjectBuilding_companyId_idx" ON "ProjectBuilding"("companyId");

-- CreateIndex
CREATE INDEX "ProjectUnit_companyId_idx" ON "ProjectUnit"("companyId");

-- CreateIndex
CREATE INDEX "ProjectStatus_companyId_idx" ON "ProjectStatus"("companyId");

-- CreateIndex
CREATE INDEX "ProjectType_companyId_idx" ON "ProjectType"("companyId");

-- CreateIndex
CREATE INDEX "RegistrationSetting_companyId_idx" ON "RegistrationSetting"("companyId");

-- CreateIndex
CREATE INDEX "RRQ_companyId_idx" ON "RRQ"("companyId");

-- CreateIndex
CREATE INDEX "SecondarySource_companyId_idx" ON "SecondarySource"("companyId");

-- CreateIndex
CREATE INDEX "SecuritySetting_companyId_idx" ON "SecuritySetting"("companyId");

-- CreateIndex
CREATE INDEX "Session_companyId_idx" ON "Session"("companyId");

-- CreateIndex
CREATE INDEX "SessionSetting_companyId_idx" ON "SessionSetting"("companyId");

-- CreateIndex
CREATE INDEX "TertiarySource_companyId_idx" ON "TertiarySource"("companyId");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_employeeId_key" ON "User"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_name_key" ON "Department"("companyId", "name");

-- CreateIndex
CREATE INDEX "UserAuditLog_companyId_idx" ON "UserAuditLog"("companyId");

-- CreateIndex
CREATE INDEX "UserStatusHistory_companyId_idx" ON "UserStatusHistory"("companyId");

-- CreateIndex
CREATE INDEX "UserPreference_companyId_idx" ON "UserPreference"("companyId");

-- CreateIndex
CREATE INDEX "UserGroup_companyId_idx" ON "UserGroup"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroup_companyId_groupName_key" ON "UserGroup"("companyId", "groupName");

-- CreateIndex
CREATE INDEX "UserGroupMembers_companyId_idx" ON "UserGroupMembers"("companyId");

-- CreateIndex
CREATE INDEX "SystemLog_companyId_idx" ON "SystemLog"("companyId");

-- CreateIndex
CREATE INDEX "EmailTemplate_companyId_idx" ON "EmailTemplate"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_companyId_templateKey_key" ON "EmailTemplate"("companyId", "templateKey");

-- CreateIndex
CREATE INDEX "RRQType_companyId_idx" ON "RRQType"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RRQType_companyId_typeName_key" ON "RRQType"("companyId", "typeName");

-- CreateIndex
CREATE INDEX "PushSubscription_companyId_idx" ON "PushSubscription"("companyId");

-- CreateIndex
CREATE INDEX "ChatRoom_companyId_idx" ON "ChatRoom"("companyId");

-- CreateIndex
CREATE INDEX "ChatRoomMember_companyId_idx" ON "ChatRoomMember"("companyId");

-- CreateIndex
CREATE INDEX "ChatRoomMessage_companyId_idx" ON "ChatRoomMessage"("companyId");

-- CreateIndex
CREATE INDEX "ChatConversation_companyId_idx" ON "ChatConversation"("companyId");

-- CreateIndex
CREATE INDEX "ChatMessage_companyId_idx" ON "ChatMessage"("companyId");

-- CreateIndex
CREATE INDEX "Notification_companyId_idx" ON "Notification"("companyId");

-- CreateIndex
CREATE INDEX "LeadAssignment_companyId_idx" ON "LeadAssignment"("companyId");

-- CreateIndex
CREATE INDEX "LeadAssignmentSetting_companyId_idx" ON "LeadAssignmentSetting"("companyId");

-- CreateIndex
CREATE INDEX "SiteVisit_companyId_idx" ON "SiteVisit"("companyId");

-- CreateIndex
CREATE INDEX "SiteVisitNotification_companyId_idx" ON "SiteVisitNotification"("companyId");

-- CreateIndex
CREATE INDEX "Designation_companyId_idx" ON "Designation"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Designation_companyId_name_key" ON "Designation"("companyId", "name");

-- CreateIndex
CREATE INDEX "Branch_companyId_idx" ON "Branch"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_companyId_name_key" ON "Branch"("companyId", "name");

-- CreateIndex
CREATE INDEX "Location_companyId_idx" ON "Location"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_companyId_name_key" ON "Location"("companyId", "name");

-- CreateIndex
CREATE INDEX "UserPermission_companyId_idx" ON "UserPermission"("companyId");

-- CreateIndex
CREATE INDEX "ReminderSetting_companyId_idx" ON "ReminderSetting"("companyId");

-- CreateIndex
CREATE INDEX "ReminderLog_companyId_idx" ON "ReminderLog"("companyId");


-- The company every pre-existing row now belongs to.
INSERT INTO "Company" ("id", "name", "slug", "status", "publicKey", "updatedAt")
VALUES ('CMP-DEFAULT', 'Default Company', 'default', 'Active', md5(random()::text || clock_timestamp()::text), CURRENT_TIMESTAMP);

-- Backfill done; from here on the application must supply companyId.
ALTER TABLE "ChannelPartner" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ChannelPartnerLog" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Customer" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Leads" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "GlobalUserSetting" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "LeadLog" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "MailSetting" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "OpenReason" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "CallStatus" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "LeadStatus" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "LeadType" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Opportunity" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Activity" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Note" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Contact" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Document" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "LineItem" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Competitor" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Risk" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "StageHistory" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "OpportunityLog" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "PrimarySource" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ProjectBuilding" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ProjectUnit" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ProjectStatus" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ProjectType" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "RegistrationSetting" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "RRQ" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "SecondarySource" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "SecuritySetting" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Session" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "SessionSetting" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "TertiarySource" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Department" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "UserAuditLog" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "UserStatusHistory" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "UserPreference" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "UserGroup" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "UserGroupMembers" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "SystemLog" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "EmailTemplate" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "RRQType" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "PushSubscription" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ChatRoom" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ChatRoomMember" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ChatRoomMessage" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ChatConversation" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ChatMessage" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Notification" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "LeadAssignment" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "LeadAssignmentSetting" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "SiteVisit" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "SiteVisitNotification" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Designation" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Branch" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Location" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "UserPermission" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ReminderSetting" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "ReminderLog" ALTER COLUMN "companyId" DROP DEFAULT;
