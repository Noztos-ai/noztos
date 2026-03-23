-- CreateTable
CREATE TABLE "team_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamConfigJson" JSONB NOT NULL,
    "userMessage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "plan" JSONB NOT NULL DEFAULT '{}',
    "state" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_runs_projectId_status_idx" ON "team_runs"("projectId", "status");

-- AddForeignKey
ALTER TABLE "team_runs" ADD CONSTRAINT "team_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
