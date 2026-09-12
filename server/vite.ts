import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import type { VerifiedIdentity } from "./modules/auth/auth-service";

const viteLogger = createLogger();

export interface ViteOptions {
  mode: "development" | "test";
  /**
   * Browser half of the test identity seam: exposes the identity to the
   * client bundle so it can skip Clerk's sign-in UI. Only the composition
   * root may set this, and only under NODE_ENV=test.
   */
  browserTestIdentity?: VerifiedIdentity;
}

export async function setupVite(
  server: Server,
  app: Express,
  options: ViteOptions,
) {
  const testIdentity =
    options.mode === "test" && options.browserTestIdentity
      ? JSON.stringify(options.browserTestIdentity)
      : undefined;
  if (testIdentity) {
    app.get("/__vault-test-identity.js", (_req, res) => {
      res
        .type("application/javascript")
        .send(`window.__VAULT_TEST_IDENTITY__ = ${testIdentity};`);
    });
  }
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    mode: options.mode === "test" ? "test" : undefined,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      if (testIdentity)
        template = template.replace(
          "</head>",
          '<script src="/__vault-test-identity.js"></script></head>',
        );
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
