-- AlterTable
ALTER TABLE "users" ADD COLUMN     "githubToken" TEXT;

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "githubOwner" TEXT NOT NULL,
    "githubRepo" TEXT NOT NULL,
    "githubBranch" TEXT NOT NULL DEFAULT 'main',
    "lastSyncedSha" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_files" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "originalContent" TEXT NOT NULL,
    "isModified" BOOLEAN NOT NULL DEFAULT false,
    "isBinary" BOOLEAN NOT NULL DEFAULT false,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "blobSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repo_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repositories_projectId_key" ON "repositories"("projectId");

-- CreateIndex
CREATE INDEX "repo_files_repositoryId_isModified_idx" ON "repo_files"("repositoryId", "isModified");

-- CreateIndex
CREATE UNIQUE INDEX "repo_files_repositoryId_path_key" ON "repo_files"("repositoryId", "path");

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_files" ADD CONSTRAINT "repo_files_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
