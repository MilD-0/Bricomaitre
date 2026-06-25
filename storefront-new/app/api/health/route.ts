import { NextResponse } from "next/server";

import { buildHealthPayload } from "../../../lib/health";

export async function GET() {
  return NextResponse.json(buildHealthPayload());
}
