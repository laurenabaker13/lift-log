import type { Express } from "express";
import * as db from "../db";
import { ENV } from "./env";
import { authenticateRequest } from "./local-auth";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // Trainer-plan uploads are private account records, not generic public assets.
    // Keep other platform assets compatible with the existing proxy behavior.
    if (key.startsWith("lift-log/plans/")) {
      try {
        const user = await authenticateRequest(req);
        const allowed = await db.canAccessPlanSource(user.id, key);
        if (!allowed) {
          res.status(404).send("File not found");
          return;
        }
      } catch {
        res.status(404).send("File not found");
        return;
      }
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        await forgeResp.body?.cancel().catch(() => undefined);
        console.error("[StorageProxy] forge request failed");
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch {
      console.error("[StorageProxy] failed");
      res.status(502).send("Storage proxy error");
    }
  });
}
