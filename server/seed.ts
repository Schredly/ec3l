import { db } from "./db";
import { projects, changeRecords, workspaces, agentRuns } from "@shared/schema";
import { log } from "./index";

export async function seedDatabase() {
  const existingProjects = await db.select().from(projects);
  if (existingProjects.length > 0) {
    log("Database already seeded, skipping");
    return;
  }

  log("Seeding database...");

  const [project1] = await db.insert(projects).values({
    name: "frontend-app",
    githubRepo: "ec3l/frontend-app",
    defaultBranch: "main",
    description: "Core frontend application built with React and TypeScript. Contains the main user interface and client-side logic.",
  }).returning();

  const [project2] = await db.insert(projects).values({
    name: "api-gateway",
    githubRepo: "ec3l/api-gateway",
    defaultBranch: "main",
    description: "Central API gateway service handling request routing, authentication, and rate limiting across microservices.",
  }).returning();

  const [project3] = await db.insert(projects).values({
    name: "auth-service",
    githubRepo: "ec3l/auth-service",
    defaultBranch: "develop",
    description: "Authentication and authorization microservice with OAuth2 and JWT support.",
  }).returning();

  const [change1] = await db.insert(changeRecords).values({
    projectId: project1.id,
    title: "Fix responsive layout on dashboard",
    description: "The dashboard grid breaks on tablet viewports. Need to adjust the breakpoints and column layout.",
    baseSha: "a1b2c3d",
    modulePath: "src/pages/dashboard",
    status: "WorkspaceRunning",
    branchName: "change/fix-dash",
  }).returning();

  const [change2] = await db.insert(changeRecords).values({
    projectId: project2.id,
    title: "Add rate limiting middleware",
    description: "Implement a token-bucket rate limiter to protect API endpoints from abuse.",
    baseSha: "e4f5g6h",
    modulePath: "src/middleware",
    status: "Ready",
    branchName: "change/rate-limit",
  }).returning();

  const [change3] = await db.insert(changeRecords).values({
    projectId: project3.id,
    title: "Upgrade JWT verification",
    description: "Migrate from HS256 to RS256 for improved token security.",
    baseSha: "i7j8k9l",
    modulePath: "src/auth",
    status: "Merged",
    branchName: "change/jwt-rs256",
  }).returning();

  await db.insert(changeRecords).values({
    projectId: project1.id,
    title: "Add dark mode toggle",
    description: "Implement theme switching with system preference detection and localStorage persistence.",
    modulePath: "src/components/theme",
    status: "Draft",
  });

  await db.insert(changeRecords).values({
    projectId: project2.id,
    title: "Implement WebSocket support",
    description: "Add WebSocket upgrade handling for real-time notification streaming.",
    baseSha: "m0n1o2p",
    modulePath: "src/ws",
    status: "Validating",
    branchName: "change/ws-support",
  });

  await db.insert(workspaces).values({
    changeId: change1.id,
    containerId: "ws-a1b2c3d4e5f6",
    previewUrl: "https://preview-ws-a1b2c3d4e5f6.ec3l.dev",
    status: "Running",
  });

  await db.insert(workspaces).values({
    changeId: change2.id,
    containerId: "ws-f6e5d4c3b2a1",
    previewUrl: "https://preview-ws-f6e5d4c3b2a1.ec3l.dev",
    status: "Stopped",
  });

  await db.insert(agentRuns).values({
    changeId: change2.id,
    intent: "Add rate limiting logic and run linter",
    skillsUsed: JSON.stringify(["editFile", "runCommand", "runLint"]),
    logs: JSON.stringify([
      '[agent] Received intent: "Add rate limiting logic and run linter"',
      "[agent] Selecting skills: editFile, runCommand, runLint",
      "[skill:editFile] Creating src/middleware/rateLimiter.ts",
      "[skill:runCommand] Running: npm run build",
      "[skill:runLint] Running linter...",
      "[skill:runLint] All checks passed",
      "[agent] Validation passed - marking change as Ready",
    ]),
    status: "Passed",
  });

  await db.insert(agentRuns).values({
    changeId: change3.id,
    intent: "Migrate JWT signing to RS256",
    skillsUsed: JSON.stringify(["editFile", "runLint"]),
    logs: JSON.stringify([
      '[agent] Received intent: "Migrate JWT signing to RS256"',
      "[agent] Selecting skills: editFile, runLint",
      "[skill:editFile] Modifying src/auth/jwt.ts",
      "[skill:editFile] Modifying src/auth/config.ts",
      "[skill:runLint] Running linter...",
      "[skill:runLint] All checks passed",
      "[agent] Validation passed",
    ]),
    status: "Passed",
  });

  log("Database seeded successfully");
}
