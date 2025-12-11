const TOKEN_URL = "https://open-api.guesty.com/oauth2/token";

let tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

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
    scope: "open_api",
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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Guesty Open API token error ${res.status}: ${text || res.statusText}`
    );
  }

  const json = await res.json();
  const accessToken = json.access_token;
  const expiresIn = Number(json.expires_in || 3600);
  tokenCache = {
    accessToken,
    expiresAt: Date.now() + Math.max(expiresIn - 300, 60) * 1000,
  };
  return accessToken;
}

async function getOpenApiToken() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  if (!tokenPromise) {
    tokenPromise = fetchToken().finally(() => {
      tokenPromise = null;
    });
  }
  return tokenPromise;
}

module.exports = { getOpenApiToken };
