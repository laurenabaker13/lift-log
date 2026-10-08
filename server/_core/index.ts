import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerLocalAuthRoutes } from "./local-auth";
import { registerStorageProxy } from "./storageProxy";
import { registerPlanImportRoutes } from "./plan-import";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createCorsMiddleware } from "./cors";
import { clearLegacySessionCookie } from "./cookies";

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(createCorsMiddleware());
  app.use(clearLegacySessionCookie());

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerPlanImportRoutes(app);
  registerLocalAuthRoutes(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use("/api/trpc", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // The production container builds the Expo Web output into web-build. Keep
  // API routes above this handler so account data remains dynamic and private.
  const webBuildDirectory = resolve(process.cwd(), "web-build");
  if (existsSync(webBuildDirectory)) {
    app.use(express.static(webBuildDirectory, { index: false }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || extname(req.path)) {
        next();
        return;
      }
      res.sendFile(join(webBuildDirectory, "index.html"));
    });
  }

  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, () => {
    console.log("[api] server listening");
  });
}

startServer().catch(() => {
  console.error("[api] server failed to start");
});
