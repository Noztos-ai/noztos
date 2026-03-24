-- CreateTable
CREATE TABLE "build_sessions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "buildWith" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "build_sessions_projectId_active_idx" ON "build_sessions"("projectId", "active");

-- AddForeignKey
ALTER TABLE "build_sessions" ADD CONSTRAINT "build_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
