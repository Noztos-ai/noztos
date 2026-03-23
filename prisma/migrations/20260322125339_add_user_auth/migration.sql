-- CreateEnum
CREATE TYPE "Phase" AS ENUM ('planner', 'reviewer');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'queue', 'progress', 'completed', 'done');

-- CreateEnum
CREATE TYPE "ExecutorType" AS ENUM ('no_skill', 'skill', 'team');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "avatarUrl" TEXT,
    "anthropicToken" TEXT,
    "slackToken" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActive" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repositoryPath" TEXT,
    "slackChannel" TEXT,
    "slackWebhook" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaborators" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skillMd" TEXT NOT NULL DEFAULT '',
    "isPlatformDefault" BOOLEAN NOT NULL DEFAULT false,
    "phase" "Phase" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "collaboratorOrder" JSONB NOT NULL DEFAULT '[]',
    "hasBuilder" BOOLEAN NOT NULL DEFAULT false,
    "builderPosition" INTEGER,
    "rejectionRules" JSONB NOT NULL DEFAULT '{}',
    "restartFromCollaboratorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "activeSkillId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'no_skill',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instruction" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "accumulatedContext" JSONB NOT NULL DEFAULT '{}',
    "canModifyRepo" BOOLEAN NOT NULL DEFAULT false,
    "executorType" "ExecutorType" NOT NULL DEFAULT 'no_skill',
    "executorId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceConfig" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pausedAtIteration" INTEGER,
    "pausedAtEmployee" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_iterations" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "iterationNumber" INTEGER NOT NULL,
    "rejectionReason" TEXT,
    "rejectedByCollaboratorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_iterations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_skill_logs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "iterationId" TEXT,
    "collaboratorId" TEXT,
    "collaboratorName" TEXT NOT NULL,
    "inputReceived" TEXT,
    "thoughts" TEXT,
    "conclusion" TEXT,
    "passedForward" TEXT,
    "approved" BOOLEAN,
    "rejectionReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "task_skill_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_build_logs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "iterationId" TEXT,
    "filesTouched" JSONB NOT NULL DEFAULT '[]',
    "linesAdded" INTEGER NOT NULL DEFAULT 0,
    "linesRemoved" INTEGER NOT NULL DEFAULT 0,
    "technicalDecisions" TEXT,
    "rawLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_build_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_suggestions" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "suggestionText" TEXT NOT NULL,
    "reason" TEXT,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "generatedTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_logs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "messageSent" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "cpuSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gpuSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "projects_userId_idx" ON "projects"("userId");

-- CreateIndex
CREATE INDEX "collaborators_projectId_isActive_idx" ON "collaborators"("projectId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "collaborators_name_projectId_key" ON "collaborators"("name", "projectId");

-- CreateIndex
CREATE INDEX "teams_projectId_idx" ON "teams"("projectId");

-- CreateIndex
CREATE INDEX "chat_messages_projectId_createdAt_idx" ON "chat_messages"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "tasks_projectId_status_idx" ON "tasks"("projectId", "status");

-- CreateIndex
CREATE INDEX "task_iterations_taskId_idx" ON "task_iterations"("taskId");

-- CreateIndex
CREATE INDEX "task_skill_logs_taskId_idx" ON "task_skill_logs"("taskId");

-- CreateIndex
CREATE INDEX "task_build_logs_taskId_idx" ON "task_build_logs"("taskId");

-- CreateIndex
CREATE INDEX "task_suggestions_taskId_idx" ON "task_suggestions"("taskId");

-- CreateIndex
CREATE INDEX "slack_logs_projectId_delivered_idx" ON "slack_logs"("projectId", "delivered");

-- CreateIndex
CREATE INDEX "resource_usage_userId_projectId_idx" ON "resource_usage"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborators" ADD CONSTRAINT "collaborators_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_iterations" ADD CONSTRAINT "task_iterations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_skill_logs" ADD CONSTRAINT "task_skill_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_skill_logs" ADD CONSTRAINT "task_skill_logs_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "task_iterations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_skill_logs" ADD CONSTRAINT "task_skill_logs_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_build_logs" ADD CONSTRAINT "task_build_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_build_logs" ADD CONSTRAINT "task_build_logs_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "task_iterations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_logs" ADD CONSTRAINT "slack_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_logs" ADD CONSTRAINT "slack_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_usage" ADD CONSTRAINT "resource_usage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_usage" ADD CONSTRAINT "resource_usage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
