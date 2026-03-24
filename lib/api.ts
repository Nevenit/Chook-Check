import type { SubmitRequest, SubmitResponse, ProductStats } from "./types";

const API_BASE = "https://chook-check-api.nevenit.workers.dev";

export async function submitObservations(
  body: SubmitRequest,
): Promise<SubmitResponse> {
  const res = await fetch(`${API_BASE}/api/observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ?? `API error: ${res.status}`,
    );
  }

  return res.json();
}

export async function getProductStats(
  productId: string,
  days = 30,
  chain?: string,
): Promise<ProductStats | null> {
  const params = new URLSearchParams({ days: String(days) });
  if (chain) params.set("chain", chain);

  const res = await fetch(
    `${API_BASE}/api/products/${encodeURIComponent(productId)}/stats?${params}`,
    { method: "GET" },
  );

  if (res.status === 404) return null;

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ?? `API error: ${res.status}`,
    );
  }

  return res.json();
}

export async function deleteContributorData(
  contributorId: string,
): Promise<{ deleted: number }> {
  const res = await fetch(
    `${API_BASE}/api/contributor/${encodeURIComponent(contributorId)}`,
    { method: "DELETE" },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ?? `API error: ${res.status}`,
    );
  }

  return res.json();
}
