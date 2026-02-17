// IMPORTANT:
// Environment variables must be loaded here (process entrypoint).
// Tooling (drizzle-kit) loads dotenv separately.
// Do NOT move dotenv loading into db.ts or services.
import dotenv from "dotenv";
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initRunner } from "../runner/init";
import type { RunnerTelemetrySink, TelemetryEventData } from "../runner/telemetry";
import { storage } from "./storage";
import type { InsertExecutionTelemetryEvent } from "@shared/schema";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

const storageTelemetrySink: RunnerTelemetrySink = {
  async emit(event: TelemetryEventData): Promise<void> {
    const data: InsertExecutionTelemetryEvent = {
      eventType: event.eventType,
      tenantId: event.tenantId,
      moduleId: event.moduleId,
      executionType: event.executionType,
      workflowId: event.workflowId,
      workflowStepId: event.workflowStepId,
      executionId: event.executionId,
      actorType: event.actorType,
      actorId: event.actorId,
      status: event.status,
      errorCode: event.errorCode ?? null,
      errorMessage: event.errorMessage ?? null,
      affectedRecordIds: event.affectedRecordIds ?? null,
    };
    await storage.createExecutionTelemetryEvent(data);
  },
};

initRunner({ telemetrySink: storageTelemetrySink });

(async () => {
  const { seedDatabase } = await import("./seed");
  await registerRoutes(httpServer, app);

  try {
    await seedDatabase();
  } catch (e) {
    console.error("Seed error:", e);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
