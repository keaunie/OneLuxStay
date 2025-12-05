const TOKEN_URL = "https://booking.guesty.com/oauth2/token";

let tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

let tokenBackoffUntil = 0;
let tokenPromise = null;

async function fetchToken() {
  const clientId = process.env.GUESTY_CLIENT_ID;
  const clientSecret = process.env.GUESTY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET env vars"
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "booking_engine:api",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (res.status === 429) {
    const text = await res.text().catch(() => "");
    tokenBackoffUntil = Date.now() + 60_000;
    throw new Error(
      `Guesty token error 429 Too Many Requests (backing off 60s): ${text}`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Guesty token error ${res.status}: ${text || res.statusText}`
    );
  }

  const json = await res.json();
  const accessToken = json.access_token;
  const expiresIn = Number(json.expires_in || 86400);
  const effectiveTtlSeconds = Math.max(expiresIn - 300, 60);

  tokenCache = {
    accessToken,
    expiresAt: Date.now() + effectiveTtlSeconds * 1000,
  };
  tokenBackoffUntil = 0;
  return accessToken;
}

async function getBookingToken() {
  const now = Date.now();

  if (tokenCache.accessToken && now < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  if (now < tokenBackoffUntil) {
    throw new Error(
      `Guesty token rate-limited, backing off until ${new Date(
        tokenBackoffUntil
      ).toISOString()}`
    );
  }

  if (!tokenPromise) {
    tokenPromise = fetchToken().finally(() => {
      tokenPromise = null;
    });
  }

  return tokenPromise;
}

module.exports = { getBookingToken };
