import { NextRequest } from "next/server";

import { proxyToBackend } from "@/lib/server/morgoth-token";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(`/api/proposals/${id}/apply`, "POST");
}
