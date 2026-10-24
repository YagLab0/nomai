// HTTP client for the nomai listings API (apps/api). The Agent only ever
// talks to listings through this boundary — mock data today, Supabase later —
// so tools stay identical when the data layer changes underneath.

const BASE = () =>
  (process.env.NOMAI_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");

// The Traveler's Supabase access token, sent as `Authorization: Bearer` on
// user-scoped routes (/credits/* — the API verifies it with the Auth server
// and the verified user id IS the traveler id). Nothing forwards that token
// to the Agent today: the eve channel authenticates the Agent's own caller
// (vercelOidc/localDev) and the web adapter never passes a session token, so
// until the real-auth ticket lands, NOMAI_TRAVELER_TOKEN is the dev escape
// hatch. Returns null when unset — the API answers 401 either way.
export const travelerAuthHeaders = (): Record<string, string> | null => {
  const token = process.env.NOMAI_TRAVELER_TOKEN;
  return token ? { authorization: `Bearer ${token}` } : null;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code?: string };

async function request<T>(
  path: string,
  init?: RequestInit,
  params?: Record<string, string | number | string[] | undefined>
): Promise<ApiResult<T>> {
  const url = new URL(`${BASE()}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) for (const v of value) url.searchParams.append(key, v);
    else url.searchParams.set(key, String(value));
  }

  try {
    const res = await fetch(url, init);
    const body = (await res.json().catch(() => null)) as
      | (T & { error?: string; code?: string })
      | null;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: body?.error ?? `HTTP ${res.status}`,
        code: body?.code,
      };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: `cannot reach nomai api at ${BASE()}: ${(err as Error).message}`,
    };
  }
}

export const apiGet = <T>(
  path: string,
  params?: Record<string, string | number | string[] | undefined>,
  headers?: Record<string, string>
) => request<T>(path, headers ? { headers } : undefined, params);

export const apiPost = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
