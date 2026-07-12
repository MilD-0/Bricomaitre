import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve(process.cwd(), "../ops/scripts/verify-storefront-meta.sh");

describe("ops/scripts/verify-storefront-meta.sh", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (!server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    server = null;
  });

  async function startServer(
    handler: http.RequestListener,
  ): Promise<{ baseUrl: string }> {
    server = http.createServer(handler);

    await new Promise<void>((resolve, reject) => {
      server?.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected an ephemeral TCP address");
    }

    return { baseUrl: `http://127.0.0.1:${address.port}` };
  }

  it("fails when META_TEST_EVENT_CODE is missing", async () => {
    await expect(execFileAsync(scriptPath, [], {
      cwd: path.resolve(process.cwd(), ".."),
      env: {
        ...process.env,
        STOREFRONT_META_VERIFY_BASE_URL: "http://127.0.0.1:9",
        META_DEPLOY_VERIFY_ENABLED: "1",
        META_TEST_EVENT_CODE: "",
      },
    })).rejects.toMatchObject({
      stderr: expect.stringContaining("META_TEST_EVENT_CODE is required"),
    });
  });

  it("loads Meta verification settings from the runtime env directory", async () => {
    const envDir = await fs.mkdtemp(path.join(os.tmpdir(), "bric-meta-env-"));

    try {
      await fs.writeFile(
        path.join(envDir, "storefront.env"),
        [
          "META_DEPLOY_VERIFY_ENABLED=1",
          "META_TEST_EVENT_CODE=TEST5350",
          "BRIC_STOREFRONT_APEX_DOMAIN=bricomaitre.com",
          "",
        ].join("\n"),
      );
      await fs.writeFile(
        path.join(envDir, "storefront-api.env"),
        [
          "STOREFRONT_API_DEPLOY_TOKEN=deploy-token",
          "",
        ].join("\n"),
      );

      const { baseUrl } = await startServer(async (request, response) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
          chunks.push(chunk as Buffer);
        }

        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        expect(request.url).toBe("/internal/meta/verify");
        expect(request.headers.authorization).toBe("Bearer deploy-token");
        expect(body.eventSourceUrl).toContain("bricomaitre.com");

        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          ok: true,
          eventsReceived: 1,
          fbtraceId: "trace-env",
        }));
      });

      const result = await execFileAsync(scriptPath, [], {
        cwd: path.resolve(process.cwd(), ".."),
        env: {
          ...process.env,
          BRIC_ENV_DIR: envDir,
          STOREFRONT_META_VERIFY_BASE_URL: baseUrl,
          META_DEPLOY_VERIFY_ENABLED: "",
          META_TEST_EVENT_CODE: "",
          STOREFRONT_API_DEPLOY_TOKEN: "",
          BRIC_STOREFRONT_APEX_DOMAIN: "",
        },
      });

      expect(result.stdout).toContain("Meta verification HTTP status: 200");
      expect(result.stdout).toContain("Meta verification fbtrace_id: trace-env");
    } finally {
      await fs.rm(envDir, { recursive: true, force: true });
    }
  });

  it("fails on non-2xx responses from the protected verifier", async () => {
    const { baseUrl } = await startServer((request, response) => {
      expect(request.url).toBe("/internal/meta/verify");
      expect(request.headers.authorization).toBe("Bearer deploy-token");
      expect(request.headers["x-real-ip"]).toBe("127.0.0.1");
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, error: "Meta unavailable" }));
    });

    await expect(execFileAsync(scriptPath, [], {
      cwd: path.resolve(process.cwd(), ".."),
      env: {
        ...process.env,
        STOREFRONT_META_VERIFY_BASE_URL: baseUrl,
        META_DEPLOY_VERIFY_ENABLED: "1",
        META_TEST_EVENT_CODE: "TEST5350",
        STOREFRONT_API_DEPLOY_TOKEN: "deploy-token",
        BRIC_STOREFRONT_APEX_DOMAIN: "bricomaitre.com",
      },
    })).rejects.toMatchObject({
      stderr: expect.stringContaining("Meta verification error body:"),
    });
  });

  it("fails when the Meta response does not show an accepted event", async () => {
    const { baseUrl } = await startServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(chunk as Buffer);
      }

      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      expect(request.url).toBe("/internal/meta/verify");
      expect(request.headers.authorization).toBe("Bearer deploy-token");
      expect(request.headers["x-real-ip"]).toBe("127.0.0.1");
      expect(body.eventSourceUrl).toContain("bricomaitre.com");

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        eventsReceived: 0,
        fbtraceId: "trace-none",
      }));
    });

    await expect(execFileAsync(scriptPath, [], {
      cwd: path.resolve(process.cwd(), ".."),
      env: {
        ...process.env,
        STOREFRONT_META_VERIFY_BASE_URL: baseUrl,
        META_DEPLOY_VERIFY_ENABLED: "1",
        META_TEST_EVENT_CODE: "TEST5350",
        STOREFRONT_API_DEPLOY_TOKEN: "deploy-token",
        BRIC_STOREFRONT_APEX_DOMAIN: "bricomaitre.com",
      },
    })).rejects.toMatchObject({
      stderr: expect.stringContaining("Meta verification response body:"),
    });
  });

  it("succeeds when the storefront route reports an accepted event", async () => {
    const { baseUrl } = await startServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(chunk as Buffer);
      }

      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      expect(request.url).toBe("/internal/meta/verify");
      expect(request.headers.authorization).toBe("Bearer deploy-token");
      expect(request.headers["x-real-ip"]).toBe("127.0.0.1");
      expect(body.eventId).toMatch(/^deploy-meta-/);
      expect(body.eventSourceUrl).toContain("meta_deploy_verification=1");

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        eventsReceived: 1,
        fbtraceId: "trace-ok",
      }));
    });

    const result = await execFileAsync(scriptPath, [], {
      cwd: path.resolve(process.cwd(), ".."),
      env: {
        ...process.env,
        STOREFRONT_META_VERIFY_BASE_URL: baseUrl,
        META_DEPLOY_VERIFY_ENABLED: "1",
        META_TEST_EVENT_CODE: "TEST5350",
        STOREFRONT_API_DEPLOY_TOKEN: "deploy-token",
        BRIC_STOREFRONT_APEX_DOMAIN: "bricomaitre.com",
      },
    });

    expect(result.stdout).toContain("Meta verification event id:");
    expect(result.stdout).toContain("Meta verification HTTP status: 200");
    expect(result.stdout).toContain("Meta verification fbtrace_id: trace-ok");
  });
});
