// netlify/functions/get-pricing.js
// Uses Guesty Booking Engine API (NOT open-api)

const GUESTY_AUTH_URL = "https://booking.guesty.com/oauth2/token"; // BEAPI auth
const GUESTY_API_BASE = "https://booking.guesty.com/api"; // BEAPI base (calendar, etc.)

// in-memory auth token cache (per warm lambda)
let tokenCache = {
  token: null,
  expiresAt: 0,
};

// in-memory price cache: key = listingId|startDate|endDate
let priceCache = new Map();
const PRICE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getGuestyAccessToken() {
  const now = Date.now();

  // reuse token if still valid (minus 1 minute buffer)
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
    scope: "booking_engine:api", // important: BEAPI scope
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(GUESTY_AUTH_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "cache-control": "no-cache,no-cache",
      "content-type": "application/x-www-form-urlencoded",
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

  const ttlMs = (data.expires_in || 86400) * 1000; // docs: usually 86400s
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ttlMs,
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

    const cacheKey = `${listingId}|${startDate}|${endDate}`;
    const now = Date.now();

    // ✅ Serve from cache if still fresh
    const cached = priceCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return {
        statusCode: 200,
        body: JSON.stringify(cached.payload),
      };
    }

    const accessToken = await getGuestyAccessToken();

    // Booking Engine "listing availability calendar" endpoint:
    // GET https://booking.guesty.com/api/listings/{listingId}/calendar
    const url = new URL(
      `${GUESTY_API_BASE}/listings/${encodeURIComponent(listingId)}/calendar`
    );
    // most BEAPI calendar examples take startDate / endDate (YYYY-MM-DD)
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Guesty pricing HTTP error:", res.status, text);

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

    // Shape varies slightly per account; common patterns:
    // { status: 200, data: { days: [...] } }  OR { days: [...] }
    const daysRaw =
      (data && data.data && Array.isArray(data.data.days) && data.data.days) ||
      (Array.isArray(data.days) && data.days) ||
      [];

    // Normalize to what the frontend expects
    const days = daysRaw.map((day) => ({
      date: day.date,
      price:
        day.price ??
        (day.money && (day.money.total || day.money.nightly)) ??
        null,
      currency: day.currency || "EUR",
      minNights: day.minNights ?? day.minimumNights ?? null,
      status: day.status || null,
    }));

    const payload = {
      listingId,
      startDate,
      endDate,
      days,
    };

    // cache for a few minutes
    priceCache.set(cacheKey, {
      payload,
      expiresAt: now + PRICE_TTL_MS,
    });

    return {
      statusCode: 200,
      body: JSON.stringify(payload),
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
