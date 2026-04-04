import { NextResponse } from "next/server";

import { getStorefrontEnvHealth } from "@/lib/env-health";
import { fetchStorefrontUpstream } from "@/lib/storefront-upstream";

async function getStorefrontApiHealth() {
  try {
    const response = await fetchStorefrontUpstream("/api/health", {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
      timeoutMs: 2_000,
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : "Unknown storefront-api error",
    };
  }
}

export async function GET() {
  const env = getStorefrontEnvHealth();
  const storefrontApi = await getStorefrontApiHealth();
  const ok = env.ok && storefrontApi.ok;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      service: "storefront",
      timestamp: new Date().toISOString(),
      checks: {
        env: env.checks,
        storefrontApi,
      },
      missingEnv: env.missing,
    },
    { status: ok ? 200 : 503 },
  );
}
