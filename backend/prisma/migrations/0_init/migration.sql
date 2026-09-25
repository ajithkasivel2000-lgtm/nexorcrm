-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "ChannelPartner" (
    "id" TEXT NOT NULL,
    "cpId" TEXT NOT NULL,
    "typeOfChannelPartner" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "aadhaarNumber" TEXT,
    "mobileNumber" TEXT NOT NULL,
    "officeLandline" TEXT,
    "panOfCompany" TEXT,
    "emailAddress" TEXT NOT NULL,
    "companyRegistrationNumber" TEXT,
    "gstRegistrationNumber" TEXT,
    "registeredAddress" TEXT,
    "reraRegistrationNumber" TEXT NOT NULL,
    "communicationAddress" TEXT,
    "uploadAadhaarCopy" TEXT,
    "uploadPanCopy" TEXT,
    "uploadGstCopy" TEXT,
    "uploadReraCopy" TEXT,
    "beneficiaryBankName" TEXT,
    "beneficiaryName" TEXT,
    "bankAccountNumber" TEXT,
    "ifscCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Registered',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leadOwner" TEXT NOT NULL DEFAULT 'admin',
    "mobileCountryCode" TEXT NOT NULL DEFAULT '+91',

    CONSTRAINT "ChannelPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelPartnerLog" (
    "id" TEXT NOT NULL,
    "channelPartnerId" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelPartnerLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerMobile" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'Customer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerMobileCountryCode" TEXT NOT NULL DEFAULT '+91',

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "mobileCountryCode" TEXT NOT NULL DEFAULT '+91',
    "source" TEXT NOT NULL,
    "project" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalUserSetting" (
    "id" TEXT NOT NULL,
    "allowMultipleLogins" BOOLEAN NOT NULL DEFAULT true,
    "individualUserHomepages" BOOLEAN NOT NULL DEFAULT false,
    "howAreTheySet" TEXT NOT NULL DEFAULT 'By Admin (Set below..)',
    "pathSetByAdmin" TEXT NOT NULL DEFAULT '/',
    "excludeAdmins" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalUserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT NOT NULL,
    "primarySource" TEXT,
    "secondarySource" TEXT,
    "tertiarySource" TEXT,
    "project" TEXT,
    "status" TEXT NOT NULL DEFAULT 'New Lead',
    "owner" TEXT NOT NULL DEFAULT 'admin',
    "openReason" TEXT,
    "callStatus" TEXT,
    "callRemarks" TEXT,
    "followUpDate" TIMESTAMP(3),
    "rejectionType" TEXT,
    "reasonDetails" TEXT,
    "budgetLimit" TEXT,
    "competitorName" TEXT,
    "competitorOffer" TEXT,
    "invalidReason" TEXT,
    "otherNotes" TEXT,
    "additionalRemarks" TEXT,
    "siteVisitDate" TIMESTAMP(3),
    "siteVisitNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "channelPartnerName" TEXT,
    "siteVisitStatus" TEXT,
    "bookingStatus" TEXT,
    "siteVisitConfirmedDate" TIMESTAMP(3),
    "siteVisitConfirmedNote" TEXT,
    "siteVisitDoneDate" TIMESTAMP(3),
    "siteVisitDoneNote" TEXT,
    "ownerId" TEXT,
    "mobileCountryCode" TEXT NOT NULL DEFAULT '+91',
    "allocatedDate" TIMESTAMP(3),
    "allocator" TEXT,
    "alternateEmail" TEXT,
    "alternateNo" TEXT,
    "channelPartnerId" TEXT,
    "companyName" TEXT,
    "euid" TEXT,
    "occupation" TEXT,
    "rating" TEXT DEFAULT 'warm',
    "referrerDetails" TEXT,
    "sourceUrl" TEXT,
    "virtualVisit" TEXT,
    "virtualVisitDate" TIMESTAMP(3),
    "alternateNoCountryCode" TEXT DEFAULT '+91',
    "assignedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT,
    "field" TEXT,
    "newValue" TEXT,
    "oldValue" TEXT,

    CONSTRAINT "LeadLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailSetting" (
    "id" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUsername" TEXT NOT NULL DEFAULT '',
    "smtpPassword" TEXT NOT NULL DEFAULT '',
    "fromEmail" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "defaultBCC" TEXT NOT NULL DEFAULT '',
    "defaultCC" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "smtpAuth" TEXT NOT NULL DEFAULT 'True',
    "starttls" TEXT NOT NULL DEFAULT 'True',

    CONSTRAINT "MailSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenReason" (
    "id" TEXT NOT NULL,
    "reasonName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallStatus" (
    "id" TEXT NOT NULL,
    "statusName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStatus" (
    "id" TEXT NOT NULL,
    "statusName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadType" (
    "id" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "oppId" TEXT NOT NULL,
    "leadId" TEXT,
    "bvd" TEXT,
    "opportunityName" TEXT,
    "mobileNumber" TEXT,
    "emailAddress" TEXT,
    "alternateMobile" TEXT,
    "alternateEmail" TEXT,
    "occupation" TEXT,
    "companyName" TEXT,
    "allocator" TEXT,
    "opportunityOwner" TEXT NOT NULL DEFAULT 'admin',
    "stage" TEXT NOT NULL DEFAULT 'Site Visit Converted',
    "selectedUnit" TEXT,
    "unitType" TEXT,
    "bookingDate" TIMESTAMP(3),
    "bookingDetails" TEXT,
    "bookingAmountStatus" TEXT,
    "bookingDoneDate" TIMESTAMP(3),
    "comments" TEXT,
    "reportingManager" TEXT,
    "cpCommissionPercent" TEXT,
    "approvalStage" TEXT,
    "preferredLocality" TEXT,
    "channelPartnerName" TEXT,
    "channelPartnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "alternateMobileCountryCode" TEXT NOT NULL DEFAULT '+91',
    "mobileCountryCode" TEXT NOT NULL DEFAULT '+91',
    "LeadsProject" TEXT,
    "agreementDate" TIMESTAMP(3),
    "agreementNotes" TEXT,
    "agreementNumber" TEXT,
    "agreementStatus" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceNumber" TEXT,
    "nextDueDate" TIMESTAMP(3),
    "paymentMode" TEXT,
    "registrationDate" TIMESTAMP(3),
    "closeReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT,
    "expectedCloseDate" TIMESTAMP(3),
    "expectedValue" DECIMAL(65,30),
    "industry" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "nextAction" TEXT,
    "nextFollowUpDate" TIMESTAMP(3),
    "opportunityType" TEXT,
    "pipeline" TEXT DEFAULT 'Sales',
    "priority" TEXT DEFAULT 'Medium',
    "probability" INTEGER,
    "source" TEXT,
    "stageEnteredAt" TIMESTAMP(3),
    "status" TEXT DEFAULT 'Open',
    "tags" TEXT[],
    "team" TEXT,
    "bookingAmount" DECIMAL(65,30),
    "preferredBudget" DECIMAL(65,30),
    "locationCommission" DECIMAL(65,30),
    "locationCommissionInr" DECIMAL(65,30),
    "agreementValue" DECIMAL(65,30),
    "amountPaid" DECIMAL(65,30),
    "invoiceAmount" DECIMAL(65,30),

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "assignedTo" TEXT,
    "status" TEXT DEFAULT 'Completed',
    "outcome" TEXT,
    "nextAction" TEXT,
    "nextActionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" TEXT DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "assignedTo" TEXT,
    "createdBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "department" TEXT,
    "phone" TEXT,
    "countryCode" TEXT DEFAULT '+91',
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "isInfluencer" BOOLEAN NOT NULL DEFAULT false,
    "isTechnical" BOOLEAN NOT NULL DEFAULT false,
    "isFinance" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "category" TEXT DEFAULT 'Other',
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30),
    "discount" DECIMAL(65,30),
    "tax" DECIMAL(65,30),
    "interestLevel" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product" TEXT,
    "price" DECIMAL(65,30),
    "strength" TEXT,
    "weakness" TEXT,
    "ourAdvantage" TEXT,
    "customerPreference" TEXT,
    "status" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "severity" TEXT DEFAULT 'Medium',
    "probability" TEXT,
    "impact" TEXT,
    "mitigation" TEXT,
    "owner" TEXT,
    "status" TEXT DEFAULT 'Open',
    "resolution" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageHistory" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "probability" INTEGER,
    "changedBy" TEXT,
    "note" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityLog" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT,
    "field" TEXT,
    "newValue" TEXT,
    "oldValue" TEXT,

    CONSTRAINT "OpportunityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrimarySource" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrimarySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectType" TEXT,
    "propertyType" TEXT,
    "developers" TEXT,
    "developerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "projectEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "features" TEXT,
    "mapLink" TEXT,
    "projectAmenities" TEXT,
    "projectContact" TEXT,
    "projectLocation" TEXT,
    "projectStatus" TEXT DEFAULT 'Pre Launch',
    "actualCompletion" TIMESTAMP(3),
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "archivedAt" TIMESTAMP(3),
    "area" TEXT,
    "bookingAmount" DECIMAL(65,30),
    "builder" TEXT,
    "builtUpArea" DECIMAL(65,30),
    "campaignName" TEXT,
    "category" TEXT,
    "city" TEXT,
    "clubHouseCharges" DECIMAL(65,30),
    "commonArea" DECIMAL(65,30),
    "constructionProgress" INTEGER,
    "constructionStart" TIMESTAMP(3),
    "corpusFund" DECIMAL(65,30),
    "country" TEXT DEFAULT 'India',
    "coveredParking" INTEGER,
    "createdBy" TEXT,
    "currentPhase" TEXT,
    "defaultLeadOwner" TEXT,
    "defaultOpportunityOwner" TEXT,
    "description" TEXT,
    "district" TEXT,
    "expectedCompletion" TIMESTAMP(3),
    "expectedRevenue" DECIMAL(65,30),
    "facing" TEXT,
    "floorRiseCharges" DECIMAL(65,30),
    "gstPercent" DECIMAL(65,30),
    "keyHighlights" TEXT,
    "keywords" TEXT,
    "landArea" DECIMAL(65,30),
    "landAreaUnit" TEXT DEFAULT 'acre',
    "landingPageUrl" TEXT,
    "landmark" TEXT,
    "latitude" DOUBLE PRECISION,
    "launchDate" TIMESTAMP(3),
    "locality" TEXT,
    "locationNote" TEXT,
    "longitude" DOUBLE PRECISION,
    "maintenanceCharges" DECIMAL(65,30),
    "mapEmbedUrl" TEXT,
    "marketingBudget" DECIMAL(65,30),
    "marketingNote" TEXT,
    "maxArea" DECIMAL(65,30),
    "maxPrice" DECIMAL(65,30),
    "metaDescription" TEXT,
    "metaTitle" TEXT,
    "minArea" DECIMAL(65,30),
    "minPrice" DECIMAL(65,30),
    "monthlyTarget" DECIMAL(65,30),
    "openParking" INTEGER,
    "otherCharges" DECIMAL(65,30),
    "parkingCapacity" INTEGER,
    "parkingCharges" DECIMAL(65,30),
    "pincode" TEXT,
    "pricePerSqft" DECIMAL(65,30),
    "projectCode" TEXT,
    "projectManager" TEXT,
    "promoter" TEXT,
    "registrationPercent" DECIMAL(65,30),
    "reraDate" TIMESTAMP(3),
    "reraNumber" TEXT,
    "saleableArea" DECIMAL(65,30),
    "salesManager" TEXT,
    "salesOwner" TEXT,
    "salesStartDate" TIMESTAMP(3),
    "salesStatus" TEXT,
    "salesTarget" DECIMAL(65,30),
    "salesTeam" TEXT,
    "shortDescription" TEXT,
    "slug" TEXT,
    "socialLinks" TEXT,
    "stampDutyPercent" DECIMAL(65,30),
    "startingPrice" DECIMAL(65,30),
    "state" TEXT,
    "tagline" TEXT,
    "targetAudience" TEXT,
    "totalBuildings" INTEGER,
    "totalFloors" INTEGER,
    "totalUnitsPlanned" INTEGER,
    "usp" TEXT,
    "visitorParking" INTEGER,
    "website" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBuilding" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "towerNumber" TEXT,
    "floors" INTEGER,
    "status" TEXT DEFAULT 'Planned',
    "constructionProgress" INTEGER,
    "expectedCompletion" TIMESTAMP(3),
    "description" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectUnit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildingId" TEXT,
    "unitNumber" TEXT NOT NULL,
    "floor" INTEGER,
    "unitType" TEXT,
    "bhk" TEXT,
    "facing" TEXT,
    "carpetArea" DECIMAL(65,30),
    "builtUpArea" DECIMAL(65,30),
    "saleableArea" DECIMAL(65,30),
    "balconyArea" DECIMAL(65,30),
    "price" DECIMAL(65,30),
    "pricePerSqft" DECIMAL(65,30),
    "parking" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Available',
    "opportunityId" TEXT,
    "reservedFor" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStatus" (
    "id" TEXT NOT NULL,
    "statusName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectType" (
    "id" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationSetting" (
    "id" TEXT NOT NULL,
    "accountActivation" TEXT NOT NULL DEFAULT 'Admin Activation',
    "limitUsernameCharacters" TEXT NOT NULL DEFAULT 'Letter Num and Spaces',
    "usernameLengthMin" INTEGER NOT NULL DEFAULT 5,
    "usernameLengthMax" INTEGER NOT NULL DEFAULT 36,
    "passwordLengthMin" INTEGER NOT NULL DEFAULT 8,
    "passwordLengthMax" INTEGER NOT NULL DEFAULT 120,
    "sendWelcomeEmail" BOOLEAN NOT NULL DEFAULT true,
    "enableCaptcha" BOOLEAN NOT NULL DEFAULT false,
    "usernameLowercase" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RRQ" (
    "id" TEXT NOT NULL,
    "rrqId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "rrqName" TEXT NOT NULL,
    "rrqType" TEXT NOT NULL,
    "assignedUsers" TEXT[] DEFAULT ARRAY['admin']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RRQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecondarySource" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecondarySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecuritySetting" (
    "id" TEXT NOT NULL,
    "disallowedUsernames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bannedIPs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecuritySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiry" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "persistent" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSetting" (
    "id" TEXT NOT NULL,
    "userInactivityTimeout" INTEGER NOT NULL DEFAULT 20,
    "guestTimeout" INTEGER NOT NULL DEFAULT 5,
    "resetExpiryAtLogon" TEXT NOT NULL DEFAULT 'Yes',
    "cookieExpiry" INTEGER NOT NULL DEFAULT 14,
    "cookiePath" TEXT NOT NULL DEFAULT '/',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TertiarySource" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TertiarySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "password" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Manager',
    "registeredIp" TEXT NOT NULL DEFAULT '127.0.0.1',
    "lastActiveIp" TEXT NOT NULL DEFAULT '127.0.0.1',
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Manager',
    "homePagePath" TEXT,
    "dept_id" TEXT,
    "ip" TEXT NOT NULL DEFAULT '127.0.0.1',
    "lastip" TEXT,
    "phone" TEXT,
    "previous_visit" INTEGER NOT NULL DEFAULT 0,
    "profile_image" TEXT,
    "regdate" INTEGER NOT NULL DEFAULT 0,
    "reporting_to" TEXT,
    "timestamp" INTEGER NOT NULL DEFAULT 0,
    "user_home_path" TEXT,
    "user_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "userlevel" INTEGER NOT NULL DEFAULT 1,
    "phoneCountryCode" TEXT NOT NULL DEFAULT '+91',
    "addressLine" TEXT,
    "alternateEmail" TEXT,
    "alternatePhone" TEXT,
    "alternatePhoneCountryCode" TEXT DEFAULT '+91',
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "branch" TEXT,
    "city" TEXT,
    "country" TEXT,
    "designation" TEXT,
    "dob" TIMESTAMP(3),
    "employeeId" TEXT,
    "employmentType" TEXT,
    "enforceSessions" BOOLEAN NOT NULL DEFAULT false,
    "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false,
    "gender" TEXT,
    "joiningDate" TIMESTAMP(3),
    "lastFailedLoginAt" TIMESTAMP(3),
    "lastFailedLoginIp" TEXT,
    "location" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "pincode" TEXT,
    "preferredName" TEXT,
    "state" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "statusChangedBy" TEXT,
    "statusReason" TEXT,
    "team" TEXT,
    "authProvider" TEXT DEFAULT 'password',
    "googleEmail" TEXT,
    "googleId" TEXT,
    "lastGoogleLoginAt" TIMESTAMP(3),
    "lastMicrosoftLoginAt" TIMESTAMP(3),
    "microsoftEmail" TEXT,
    "microsoftId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "head" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actor" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "ipAddress" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStatusHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'English',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD MMM YYYY',
    "timeFormat" TEXT NOT NULL DEFAULT '12h',
    "pageSize" INTEGER NOT NULL DEFAULT 25,
    "inAppNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "categoryPrefs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroup" (
    "id" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "groupLevel" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,

    CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroupMembers" (
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "UserGroupMembers_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Custom',
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bodyContent" TEXT,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RRQType" (
    "id" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RRQType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoomMember" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoomMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoomMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "url" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'lead',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAssignment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerName" TEXT,
    "fromUserId" TEXT,
    "fromName" TEXT,
    "cycle" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'round-robin',
    "reason" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'waiting',
    "settledAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "notifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "pushResult" TEXT,
    "emailResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAssignmentSetting" (
    "id" TEXT NOT NULL,
    "timeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxCycles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAssignmentSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteVisit" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "projectId" TEXT,
    "projectName" TEXT,
    "projectAddress" TEXT,
    "projectMapLink" TEXT,
    "projectContact" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "assignedToId" TEXT,
    "assignedToName" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT DEFAULT 'Asia/Kolkata',
    "status" TEXT NOT NULL DEFAULT 'Scheduled',
    "note" TEXT,
    "customerNote" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkInBy" TEXT,
    "checkOutAt" TIMESTAMP(3),
    "checkOutBy" TEXT,
    "outcome" TEXT,
    "outcomeNote" TEXT,
    "cancelReason" TEXT,
    "previousAt" TIMESTAMP(3),
    "remindersOff" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteVisitNotification" (
    "id" TEXT NOT NULL,
    "siteVisitId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientEmail" TEXT,
    "recipientName" TEXT,
    "recipientKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteVisitNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Designation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Designation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "view" BOOLEAN NOT NULL DEFAULT false,
    "create" BOOLEAN NOT NULL DEFAULT false,
    "edit" BOOLEAN NOT NULL DEFAULT false,
    "delete" BOOLEAN NOT NULL DEFAULT false,
    "export" BOOLEAN NOT NULL DEFAULT false,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderSetting" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "leadMinutes" INTEGER NOT NULL DEFAULT 180,
    "repeatMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxReminders" INTEGER NOT NULL DEFAULT 0,
    "overdueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "overdueRepeatMinutes" INTEGER NOT NULL DEFAULT 60,
    "escalateAfterMinutes" INTEGER NOT NULL DEFAULT 120,
    "channelInApp" BOOLEAN NOT NULL DEFAULT true,
    "channelPush" BOOLEAN NOT NULL DEFAULT true,
    "channelEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "dueAtKey" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPartner_cpId_key" ON "ChannelPartner"("cpId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerId_key" ON "Customer"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_oppId_key" ON "Opportunity"("oppId");

-- CreateIndex
CREATE INDEX "Activity_entityType_entityId_occurredAt_idx" ON "Activity"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_assignedTo_idx" ON "Activity"("assignedTo");

-- CreateIndex
CREATE INDEX "Task_entityType_entityId_dueDate_idx" ON "Task"("entityType", "entityId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_assignedTo_status_dueDate_idx" ON "Task"("assignedTo", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Note_entityType_entityId_createdAt_idx" ON "Note"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_entityType_entityId_idx" ON "Contact"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Document_entityType_entityId_createdAt_idx" ON "Document"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "LineItem_entityType_entityId_idx" ON "LineItem"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Competitor_entityType_entityId_idx" ON "Competitor"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Risk_entityType_entityId_status_idx" ON "Risk"("entityType", "entityId", "status");

-- CreateIndex
CREATE INDEX "StageHistory_entityType_entityId_enteredAt_idx" ON "StageHistory"("entityType", "entityId", "enteredAt");

-- CreateIndex
CREATE INDEX "OpportunityLog_opportunityId_date_idx" ON "OpportunityLog"("opportunityId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectName_key" ON "Project"("projectName");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_city_idx" ON "Project"("city");

-- CreateIndex
CREATE INDEX "Project_projectStatus_idx" ON "Project"("projectStatus");

-- CreateIndex
CREATE INDEX "ProjectBuilding_projectId_idx" ON "ProjectBuilding"("projectId");

-- CreateIndex
CREATE INDEX "ProjectUnit_projectId_status_idx" ON "ProjectUnit"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectUnit_buildingId_idx" ON "ProjectUnit"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectUnit_buildingId_unitNumber_key" ON "ProjectUnit"("buildingId", "unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RRQ_rrqId_key" ON "RRQ"("rrqId");

-- CreateIndex
CREATE INDEX "Session_username_lastActive_idx" ON "Session"("username", "lastActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_microsoftId_key" ON "User"("microsoftId");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_dept_id_idx" ON "User"("dept_id");

-- CreateIndex
CREATE INDEX "User_reporting_to_idx" ON "User"("reporting_to");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE INDEX "UserAuditLog_userId_createdAt_idx" ON "UserAuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserAuditLog_userId_action_idx" ON "UserAuditLog"("userId", "action");

-- CreateIndex
CREATE INDEX "UserStatusHistory_userId_changedAt_idx" ON "UserStatusHistory"("userId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroup_groupName_key" ON "UserGroup"("groupName");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_templateKey_key" ON "EmailTemplate"("templateKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_templateId_key" ON "EmailTemplate"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "RRQType_typeName_key" ON "RRQType"("typeName");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "ChatRoom_updatedAt_idx" ON "ChatRoom"("updatedAt");

-- CreateIndex
CREATE INDEX "ChatRoomMember_username_idx" ON "ChatRoomMember"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoomMember_roomId_username_key" ON "ChatRoomMember"("roomId", "username");

-- CreateIndex
CREATE INDEX "ChatRoomMessage_roomId_createdAt_idx" ON "ChatRoomMessage"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatConversation_username_updatedAt_idx" ON "ChatConversation"("username", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadAssignment_state_dueAt_idx" ON "LeadAssignment"("state", "dueAt");

-- CreateIndex
CREATE INDEX "LeadAssignment_leadId_assignedAt_idx" ON "LeadAssignment"("leadId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAssignment_leadId_cycle_key" ON "LeadAssignment"("leadId", "cycle");

-- CreateIndex
CREATE INDEX "SiteVisit_leadId_scheduledAt_idx" ON "SiteVisit"("leadId", "scheduledAt");

-- CreateIndex
CREATE INDEX "SiteVisit_status_scheduledAt_idx" ON "SiteVisit"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "SiteVisit_remindersOff_scheduledAt_idx" ON "SiteVisit"("remindersOff", "scheduledAt");

-- CreateIndex
CREATE INDEX "SiteVisitNotification_status_attempts_idx" ON "SiteVisitNotification"("status", "attempts");

-- CreateIndex
CREATE UNIQUE INDEX "SiteVisitNotification_siteVisitId_event_audience_channel_re_key" ON "SiteVisitNotification"("siteVisitId", "event", "audience", "channel", "recipientKey");

-- CreateIndex
CREATE UNIQUE INDEX "Designation_name_key" ON "Designation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE INDEX "UserPermission_userId_idx" ON "UserPermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_page_key" ON "UserPermission"("userId", "page");

-- CreateIndex
CREATE INDEX "ReminderLog_activityType_activityId_idx" ON "ReminderLog"("activityType", "activityId");

-- CreateIndex
CREATE INDEX "ReminderLog_sentAt_idx" ON "ReminderLog"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_activityType_activityId_dueAtKey_slot_recipient_key" ON "ReminderLog"("activityType", "activityId", "dueAtKey", "slot", "recipientId", "channel");

-- AddForeignKey
ALTER TABLE "ChannelPartnerLog" ADD CONSTRAINT "ChannelPartnerLog_channelPartnerId_fkey" FOREIGN KEY ("channelPartnerId") REFERENCES "ChannelPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadLog" ADD CONSTRAINT "LeadLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityLog" ADD CONSTRAINT "OpportunityLog_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBuilding" ADD CONSTRAINT "ProjectBuilding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUnit" ADD CONSTRAINT "ProjectUnit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "ProjectBuilding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUnit" ADD CONSTRAINT "ProjectUnit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMembers" ADD CONSTRAINT "UserGroupMembers_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupMembers" ADD CONSTRAINT "UserGroupMembers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomMessage" ADD CONSTRAINT "ChatRoomMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAssignment" ADD CONSTRAINT "LeadAssignment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisitNotification" ADD CONSTRAINT "SiteVisitNotification_siteVisitId_fkey" FOREIGN KEY ("siteVisitId") REFERENCES "SiteVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

