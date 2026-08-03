import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/server/morgoth-token";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyToBackend(`/api/proposals/${id}/approve`, "POST", body);
}
