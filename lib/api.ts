import type {
  ContributorCredentials,
  ProductStats,
  SubmitRequestV2,
  SubmitResponse,
} from "./types";

const API_BASE = "https://chook-check-api.nevenit.workers.dev";

async function readApiError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => ({}));
  const message =
    (payload as { message?: string }).message ??
    `API error: ${response.status}`;
  return new Error(message);
}

export async function registerContributor(): Promise<ContributorCredentials> {
  const response = await fetch(`${API_BASE}/api/v2/contributors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw await readApiError(response);
  return response.json();
}

export async function submitObservations(
  body: SubmitRequestV2,
  submitToken: string,
): Promise<SubmitResponse> {
  const response = await fetch(`${API_BASE}/api/v2/observations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${submitToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readApiError(response);
  return response.json();
}

export async function downloadCommunitySnapshot(
  etag?: string,
): Promise<
  | { notModified: true; etag: string | null; products: [] }
  | { notModified: false; etag: string | null; products: ProductStats[] }
> {
  const response = await fetch(`${API_BASE}/api/v2/snapshots/products`, {
    method: "GET",
    headers: etag ? { "If-None-Match": etag } : undefined,
  });
  const responseEtag = response.headers.get("ETag");
  if (response.status === 304) {
    return {
      notModified: true,
      etag: responseEtag ?? etag ?? null,
      products: [],
    };
  }
  if (!response.ok) throw await readApiError(response);
  const payload = (await response.json()) as { products: ProductStats[] };
  return {
    notModified: false,
    etag: responseEtag,
    products: payload.products,
  };
}

export async function deleteContributorData(
  deletionToken: string,
): Promise<{ deleted: number }> {
  const response = await fetch(`${API_BASE}/api/v2/contributor`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${deletionToken}` },
  });
  if (!response.ok) throw await readApiError(response);
  return response.json();
}
