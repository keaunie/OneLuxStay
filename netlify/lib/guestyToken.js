let cachedToken = null;
let expiresAt = 0;
let pendingRequest = null;

async function requestGuestyToken() {
  const {
    GUESTY_CLIENT_ID,
    GUESTY_CLIENT_SECRET,
    GUESTY_TOKEN_URL = "https://api.guesty.com/oauth2/token",
  } = process.env;

  if (!GUESTY_CLIENT_ID || !GUESTY_CLIENT_SECRET) {
    throw new Error(
      "Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET environment variables."
    );
  }

  const body = new URLSearchParams({
    client_id: GUESTY_CLIENT_ID,
    client_secret: GUESTY_CLIENT_SECRET,
    grant_type: "client_credentials",
  });

  const res = await fetch(GUESTY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Guesty token request failed ${res.status}: ${text || res.statusText}`
    );
  }

  const data = await res.json();

  if (!data?.access_token) {
    throw new Error("Guesty token response is missing access_token.");
  }

  cachedToken = data.access_token;
  const ttlSeconds =
    typeof data.expires_in === "number" && data.expires_in > 0
      ? data.expires_in
      : 3600;
  expiresAt = Date.now() + (ttlSeconds - 60) * 1000; // refresh one minute early
  pendingRequest = null;
  return cachedToken;
}

async function getGuestyToken() {
  if (cachedToken && Date.now() < expiresAt) {
    return cachedToken;
  }

  if (!pendingRequest) {
    pendingRequest = requestGuestyToken();
  }

  return pendingRequest;
}

function clearGuestyToken() {
  cachedToken = null;
  expiresAt = 0;
  pendingRequest = null;
}

module.exports = {
  getGuestyToken,
  clearGuestyToken,
};
