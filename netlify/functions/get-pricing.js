// netlify/functions/get-pricing.js
// Uses Guesty Booking Engine API and normalizes to: { listingId, startDate, endDate, days: [ { date, price, currency, minNights, status }, ... ] }

const GUESTY_AUTH_URL = "https://booking.guesty.com/oauth2/token";
const GUESTY_API_BASE = "https://booking.guesty.com/api";

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
    scope: "booking_engine:api", // Booking Engine API scope
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

  const ttlMs = (data.expires_in || 86400) * 1000;
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ttlMs,
  };

  return data.access_token;
}

// helper: aggressively try to pull a numeric price from a "day" object
function extractPriceFromDay(day) {
  if (!day || typeof day !== "object") return null;

  const directCandidates = [
    day.price,
    day.dailyPrice,
    day.basePrice,
    day.nightlyPrice,
    day.rate,
  ];

  const nestedCandidates = [
    day.money && day.money.nightly,
    day.money && day.money.total,
    day.money && day.money.amount,
    day.money && day.money.price,
    day.rate && day.rate.nightly,
    day.rate && day.rate.total,
  ];

  const all = [...directCandidates, ...nestedCandidates];

  for (const v of all) {
    const n = Number(v);
    if (!Number.isNaN(n) && n > 0) return n;
  }

  return null;
}

function normalizeDays(raw) {
  if (!raw) return [];

  // Case 1: array already
  if (Array.isArray(raw)) return raw;

  // Case 2: object keyed by date: { "2025-12-04": { ... }, ... }
  if (typeof raw === "object") {
    return Object.entries(raw).map(([date, value]) => ({
      date,
      ...value,
    }));
  }

  return [];
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
    const startDate = params.startDate; // YYYY-MM-DD
    const endDate = params.endDate; // YYYY-MM-DD

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

    // serve from cache if still fresh
    const cached = priceCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return {
        statusCode: 200,
        body: JSON.stringify(cached.payload),
      };
    }

    const accessToken = await getGuestyAccessToken();

    // Booking Engine calendar expects ?from=YYYY-MM-DD&to=YYYY-MM-DD
    const url = new URL(
      `${GUESTY_API_BASE}/listings/${encodeURIComponent(listingId)}/calendar`
    );
    url.searchParams.set("from", startDate);
    url.searchParams.set("to", endDate);

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

    // shapes:
    // { days: [...] } OR { data: { days: [...] } } OR { days: { "2025-12-04": {...}, ... } }
    const rawDays = (data && data.data && data.data.days) || data.days || null;

    const daysNormalized = normalizeDays(rawDays);

    const days = daysNormalized.map((day) => {
      const price = extractPriceFromDay(day);

      const currency =
        day.currency ||
        (day.money && (day.money.currency || day.money.currencyCode)) ||
        "EUR";

      return {
        date: day.date,
        price,
        currency,
        minNights: day.minNights ?? day.minimumNights ?? null,
        status: day.status || null,
      };
    });

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
