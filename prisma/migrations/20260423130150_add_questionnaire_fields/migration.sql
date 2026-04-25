-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "aiPurposes" TEXT[],
ADD COLUMN     "applicableFrameworks" "FrameworkType"[],
ADD COLUMN     "documentChecklist" JSONB,
ADD COLUMN     "hasPrivacyPolicy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "productDescription" TEXT,
ADD COLUMN     "questionnaireAnswers" JSONB,
ADD COLUMN     "questionnaireCompletedAt" TIMESTAMP(3),
ADD COLUMN     "riskTier" TEXT,
ADD COLUMN     "thirdPartyProviders" TEXT[],
ADD COLUMN     "trainsOwnModels" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "userTypes" TEXT[],
ADD COLUMN     "usesThirdPartyAI" BOOLEAN NOT NULL DEFAULT false;
