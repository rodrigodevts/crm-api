-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'AGENT');

-- CreateEnum
CREATE TYPE "DepartmentDistributionMode" AS ENUM ('MANUAL', 'RANDOM', 'BALANCED', 'SEQUENTIAL');

-- CreateEnum
CREATE TYPE "TagScope" AS ENUM ('CONTACT', 'TICKET', 'BOTH');

-- CreateEnum
CREATE TYPE "QuickReplyScope" AS ENUM ('COMPANY', 'PERSONAL');

-- CreateEnum
CREATE TYPE "LeadStatusFinalKind" AS ENUM ('WON', 'LOST');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'EMAIL', 'PHONE', 'URL');

-- CreateEnum
CREATE TYPE "CustomFieldEntity" AS ENUM ('CONTACT', 'TICKET', 'BOTH');

-- CreateEnum
CREATE TYPE "IntegrationOpenMode" AS ENUM ('NEW_TAB', 'IFRAME');

-- CreateEnum
CREATE TYPE "IntegrationVisibility" AS ENUM ('ALL_USERS', 'ADMINS_ONLY');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISABLED', 'PAUSED');

-- CreateEnum
CREATE TYPE "TemplateHeaderType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "ApiAuthType" AS ENUM ('NONE', 'BEARER_TOKEN', 'API_KEY_HEADER', 'BASIC_AUTH', 'CUSTOM_HEADERS');

-- CreateEnum
CREATE TYPE "WebhookAuthType" AS ENUM ('NONE', 'BEARER_TOKEN', 'HMAC_SHA256', 'BASIC_AUTH');

-- CreateEnum
CREATE TYPE "WebhookEvent" AS ENUM ('CONTACT_CREATED', 'CONTACT_UPDATED', 'TICKET_CREATED', 'TICKET_ASSIGNED', 'TICKET_UPDATED', 'TICKET_TRANSFERRED', 'TICKET_CLOSED', 'TICKET_ARCHIVED', 'MESSAGE_CREATED', 'MESSAGE_STATUS_CHANGED', 'CHANNEL_STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'RETRYING', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultWorkingHours" JSONB,
    "outOfHoursMessage" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "hideOtherUsersTickets" BOOLEAN NOT NULL DEFAULT true,
    "agentSeeOtherUsersTicketsOnSameChannel" BOOLEAN NOT NULL DEFAULT false,
    "agentSeeTicketsWithOtherDefaultAgents" BOOLEAN NOT NULL DEFAULT true,
    "hidePhoneFromAgents" BOOLEAN NOT NULL DEFAULT false,
    "ignoreGroupMessages" BOOLEAN NOT NULL DEFAULT false,
    "showAssignedGroups" BOOLEAN NOT NULL DEFAULT false,
    "forceWalletRouting" BOOLEAN NOT NULL DEFAULT false,
    "agentCanDeleteContacts" BOOLEAN NOT NULL DEFAULT false,
    "agentCanChangeDefaultAgent" BOOLEAN NOT NULL DEFAULT false,
    "agentCanEditTags" BOOLEAN NOT NULL DEFAULT false,
    "agentCanToggleSignature" BOOLEAN NOT NULL DEFAULT false,
    "hideBotTicketsFromAgents" BOOLEAN NOT NULL DEFAULT true,
    "defaultBotChatFlowId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "absenceMessage" TEXT,
    "absenceActive" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "greetingMessage" TEXT,
    "outOfHoursMessage" TEXT,
    "workingHours" JSONB,
    "slaResponseMinutes" INTEGER,
    "slaResolutionMinutes" INTEGER,
    "distributionMode" "DepartmentDistributionMode" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDepartment" (
    "userId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,

    CONSTRAINT "UserDepartment_pkey" PRIMARY KEY ("userId","departmentId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "scope" "TagScope" NOT NULL DEFAULT 'BOTH',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickReply" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "shortcut" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaMimeType" TEXT,
    "scope" "QuickReplyScope" NOT NULL,
    "ownerUserId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloseReason" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "triggersCsat" BOOLEAN NOT NULL DEFAULT false,
    "asksDealValue" BOOLEAN NOT NULL DEFAULT false,
    "funnelId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CloseReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloseReasonDepartment" (
    "closeReasonId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,

    CONSTRAINT "CloseReasonDepartment_pkey" PRIMARY KEY ("closeReasonId","departmentId")
);

-- CreateTable
CREATE TABLE "SalesFunnel" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesFunnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStatus" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "funnelId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "finalKind" "LeadStatusFinalKind",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "appliesTo" "CustomFieldEntity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessHoliday" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "appliesToAll" BOOLEAN NOT NULL DEFAULT true,
    "departmentIds" UUID[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationLink" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "iconUrl" TEXT,
    "openMode" "IntegrationOpenMode" NOT NULL DEFAULT 'NEW_TAB',
    "visibleTo" "IntegrationVisibility" NOT NULL DEFAULT 'ALL_USERS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "channelConnectionId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "status" "TemplateStatus" NOT NULL,
    "language" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "headerType" "TemplateHeaderType",
    "headerText" TEXT,
    "footerText" TEXT,
    "buttons" JSONB,
    "variables" INTEGER NOT NULL DEFAULT 0,
    "rejectionReason" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotCredential" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "authType" "ApiAuthType" NOT NULL,
    "config" BYTEA NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "channelConnectionId" UUID,
    "secret" TEXT NOT NULL,
    "authType" "WebhookAuthType" NOT NULL DEFAULT 'NONE',
    "authConfig" BYTEA,
    "events" "WebhookEvent"[],
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "retryBackoffSec" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "event" "WebhookEvent" NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "WebhookDeliveryStatus" NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatFlow" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChatFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "leadStatusId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactTag" (
    "contactId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("contactId","tagId")
);

-- CreateTable
CREATE TABLE "TicketTag" (
    "ticketId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "TicketTag_pkey" PRIMARY KEY ("ticketId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_planId_idx" ON "Company"("planId");

-- CreateIndex
CREATE INDEX "Company_active_idx" ON "Company"("active");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySettings_companyId_key" ON "CompanySettings"("companyId");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "User_companyId_role_idx" ON "User"("companyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_email_key" ON "User"("companyId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_companyId_idx" ON "RefreshToken"("companyId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_name_key" ON "Department"("companyId", "name");

-- CreateIndex
CREATE INDEX "UserDepartment_departmentId_idx" ON "UserDepartment"("departmentId");

-- CreateIndex
CREATE INDEX "Tag_companyId_scope_idx" ON "Tag"("companyId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_companyId_name_key" ON "Tag"("companyId", "name");

-- CreateIndex
CREATE INDEX "QuickReply_companyId_scope_idx" ON "QuickReply"("companyId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "QuickReply_companyId_scope_ownerUserId_shortcut_key" ON "QuickReply"("companyId", "scope", "ownerUserId", "shortcut");

-- CreateIndex
CREATE INDEX "CloseReason_companyId_idx" ON "CloseReason"("companyId");

-- CreateIndex
CREATE INDEX "CloseReason_companyId_funnelId_idx" ON "CloseReason"("companyId", "funnelId");

-- CreateIndex
CREATE UNIQUE INDEX "CloseReason_companyId_name_key" ON "CloseReason"("companyId", "name");

-- CreateIndex
CREATE INDEX "CloseReasonDepartment_departmentId_idx" ON "CloseReasonDepartment"("departmentId");

-- CreateIndex
CREATE INDEX "SalesFunnel_companyId_idx" ON "SalesFunnel"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesFunnel_companyId_name_key" ON "SalesFunnel"("companyId", "name");

-- CreateIndex
CREATE INDEX "LeadStatus_companyId_funnelId_idx" ON "LeadStatus"("companyId", "funnelId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadStatus_companyId_funnelId_name_key" ON "LeadStatus"("companyId", "funnelId", "name");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_companyId_appliesTo_idx" ON "CustomFieldDefinition"("companyId", "appliesTo");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_companyId_key_key" ON "CustomFieldDefinition"("companyId", "key");

-- CreateIndex
CREATE INDEX "BusinessHoliday_companyId_date_idx" ON "BusinessHoliday"("companyId", "date");

-- CreateIndex
CREATE INDEX "IntegrationLink_companyId_idx" ON "IntegrationLink"("companyId");

-- CreateIndex
CREATE INDEX "MessageTemplate_companyId_status_idx" ON "MessageTemplate"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_channelConnectionId_externalId_key" ON "MessageTemplate"("channelConnectionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_channelConnectionId_name_language_key" ON "MessageTemplate"("channelConnectionId", "name", "language");

-- CreateIndex
CREATE INDEX "BotCredential_companyId_idx" ON "BotCredential"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BotCredential_companyId_name_key" ON "BotCredential"("companyId", "name");

-- CreateIndex
CREATE INDEX "WebhookSubscription_companyId_idx" ON "WebhookSubscription"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookSubscription_companyId_name_key" ON "WebhookSubscription"("companyId", "name");

-- CreateIndex
CREATE INDEX "WebhookDelivery_companyId_idx" ON "WebhookDelivery"("companyId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_subscriptionId_status_idx" ON "WebhookDelivery"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_nextRetryAt_status_idx" ON "WebhookDelivery"("nextRetryAt", "status");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_resource_resourceId_idx" ON "AuditLog"("companyId", "resource", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_action_idx" ON "AuditLog"("companyId", "action");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ChannelConnection_companyId_idx" ON "ChannelConnection"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_companyId_name_key" ON "ChannelConnection"("companyId", "name");

-- CreateIndex
CREATE INDEX "ChatFlow_companyId_idx" ON "ChatFlow"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatFlow_companyId_name_key" ON "ChatFlow"("companyId", "name");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "Contact_companyId_leadStatusId_idx" ON "Contact"("companyId", "leadStatusId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_companyId_phoneNumber_key" ON "Contact"("companyId", "phoneNumber");

-- CreateIndex
CREATE INDEX "Ticket_companyId_idx" ON "Ticket"("companyId");

-- CreateIndex
CREATE INDEX "ContactTag_tagId_idx" ON "ContactTag"("tagId");

-- CreateIndex
CREATE INDEX "TicketTag_tagId_idx" ON "TicketTag"("tagId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_defaultBotChatFlowId_fkey" FOREIGN KEY ("defaultBotChatFlowId") REFERENCES "ChatFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepartment" ADD CONSTRAINT "UserDepartment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepartment" ADD CONSTRAINT "UserDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseReason" ADD CONSTRAINT "CloseReason_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseReason" ADD CONSTRAINT "CloseReason_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "SalesFunnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseReasonDepartment" ADD CONSTRAINT "CloseReasonDepartment_closeReasonId_fkey" FOREIGN KEY ("closeReasonId") REFERENCES "CloseReason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseReasonDepartment" ADD CONSTRAINT "CloseReasonDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFunnel" ADD CONSTRAINT "SalesFunnel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatus" ADD CONSTRAINT "LeadStatus_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatus" ADD CONSTRAINT "LeadStatus_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "SalesFunnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessHoliday" ADD CONSTRAINT "BusinessHoliday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationLink" ADD CONSTRAINT "IntegrationLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotCredential" ADD CONSTRAINT "BotCredential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatFlow" ADD CONSTRAINT "ChatFlow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_leadStatusId_fkey" FOREIGN KEY ("leadStatusId") REFERENCES "LeadStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
