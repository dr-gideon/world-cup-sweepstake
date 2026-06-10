const BASE_URL = "https://api.football-data.org/v4";

export async function fetchFootballDataMatches({ apiKey, competition = "WC", season = "2026", dateFrom = "", dateTo = "" }) {
  if (!apiKey) throw Object.assign(new Error("FOOTBALL_DATA_API_KEY is not configured."), { status: 400 });
  const params = new URLSearchParams();
  if (season) params.set("season", season);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const url = `${BASE_URL}/competitions/${encodeURIComponent(competition)}/matches?${params.toString()}`;
  const response = await fetch(url, { headers: { "X-Auth-Token": apiKey, Accept: "application/json" } });
  const throttling = readThrottleHeaders(response.headers);
  const bodyText = await response.text();
  let payload = {};
  try { payload = bodyText ? JSON.parse(bodyText) : {}; } catch { payload = { message: bodyText.slice(0, 500) }; }
  if (!response.ok) {
    const error = new Error(payload.message || `Football-Data request failed: ${response.status}`);
    error.status = response.status;
    error.throttling = throttling;
    throw error;
  }
  return { payload, throttling };
}

function readThrottleHeaders(headers) {
  const requestsAvailable = numberOrNull(headers.get("x-requestsavailable"));
  const resetSeconds = numberOrNull(headers.get("x-requestcounter-reset"));
  return {
    apiVersion: headers.get("x-api-version") || "",
    authenticatedClient: headers.get("x-authenticated-client") || "",
    requestsAvailable,
    resetSeconds,
    low: requestsAvailable !== null && requestsAvailable <= 2
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
