import http from "node:http";
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

  it("fails on non-2xx responses from /api/capi", async () => {
    const { baseUrl } = await startServer((request, response) => {
      expect(request.url).toBe("/api/capi");
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
      expect(body.test_event_code).toBe("TEST5350");

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        success: true,
        data: {
          events_received: 0,
          fbtrace_id: "trace-none",
        },
      }));
    });

    await expect(execFileAsync(scriptPath, [], {
      cwd: path.resolve(process.cwd(), ".."),
      env: {
        ...process.env,
        STOREFRONT_META_VERIFY_BASE_URL: baseUrl,
        META_DEPLOY_VERIFY_ENABLED: "1",
        META_TEST_EVENT_CODE: "TEST5350",
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
      expect(body.event_name).toBe("PageView");
      expect(body.test_event_code).toBe("TEST5350");
      expect(body.custom_data).toEqual({ source: "deploy_verification" });

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        success: true,
        data: {
          events_received: 1,
          fbtrace_id: "trace-ok",
        },
      }));
    });

    const result = await execFileAsync(scriptPath, [], {
      cwd: path.resolve(process.cwd(), ".."),
      env: {
        ...process.env,
        STOREFRONT_META_VERIFY_BASE_URL: baseUrl,
        META_DEPLOY_VERIFY_ENABLED: "1",
        META_TEST_EVENT_CODE: "TEST5350",
        BRIC_STOREFRONT_APEX_DOMAIN: "bricomaitre.com",
      },
    });

    expect(result.stdout).toContain("Meta verification event id:");
    expect(result.stdout).toContain("Meta verification HTTP status: 200");
    expect(result.stdout).toContain("Meta verification fbtrace_id: trace-ok");
  });
});
