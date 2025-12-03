// netlify/functions/get-pricing.js

const GUESTY_AUTH_URL = "https://open-api.guesty.com/oauth2/token";
const GUESTY_API_BASE = "https://open-api.guesty.com/v1";

// simple in-memory token cache (persists while the Lambda is warm)
let tokenCache = {
  token: null,
  expiresAt: 0,
};

async function getGuestyAccessToken() {
  const now = Date.now();

  // reuse token if not close to expiry
  if (tokenCache.token && now < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const clientId = process.env.GUESTY_CLIENT_ID;
  const clientSecret = process.env.GUESTY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET env vars."
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "open-api",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(GUESTY_AUTH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Guesty auth failed: ${res.status} ${text || res.statusText}`
    );
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Guesty auth response missing access_token");
  }

  const ttl = (data.expires_in || 3600) * 1000;
  tokenCache = {
    token: data.access_token,
    expiresAt: now + ttl,
  };

  return data.access_token;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const params = event.queryStringParameters || {};
    const listingId = params.listingId;
    const startDate = params.startDate;
    const endDate = params.endDate;

    if (!listingId || !startDate || !endDate) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required query params: listingId, startDate, endDate",
        }),
      };
    }

    const accessToken = await getGuestyAccessToken();

    const url = new URL(
      `${GUESTY_API_BASE}/availability-pricing/api/calendar/listings/${encodeURIComponent(
        listingId
      )}`
    );
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);
    url.searchParams.set("includeAllotment", "true");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Guesty pricing HTTP error:", res.status, text);
      // pass through 429 so you can see it in DevTools if it happens
      return {
        statusCode: res.status,
        body: JSON.stringify({
          error: "Guesty pricing request failed",
          status: res.status,
          details: text || res.statusText,
        }),
      };
    }

    const data = await res.json();
    const daysRaw =
      (data && data.data && Array.isArray(data.data.days) && data.data.days) ||
      (Array.isArray(data.days) && data.days) ||
      [];

    const days = daysRaw.map((day) => ({
      date: day.date,
      listingId: day.listingId,
      price: day.price ?? null,
      currency: day.currency || "EUR",
      minNights: day.minNights ?? null,
      status: day.status || null,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        listingId,
        startDate,
        endDate,
        days,
      }),
    };
  } catch (err) {
    console.error("Error in get-pricing function:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to fetch pricing from Guesty",
        details: err.message || String(err),
      }),
    };
  }
};
