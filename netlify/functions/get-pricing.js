// netlify/functions/get-pricing.js
// Uses Guesty Booking Engine "reservation quote" endpoint
// and returns { listingId, startDate, endDate, days[] } to the front-end.

const TOKEN_URL = "https://booking.guesty.com/oauth2/token";
const BE_BASE_URL = "https://booking.guesty.com/api";

// =============================
// Token management (Booking Engine API)
// =============================

// shared across invocations in the SAME warm Lambda
let tokenCache = {
  accessToken: null,
  // timestamp in ms when token expires (we set it a bit early)
  expiresAt: 0,
};

// simple backoff if Guesty sends 429s for token requests
let tokenBackoffUntil = 0;

async function getAccessToken() {
  const now = Date.now();

  // 1) If we already have a token and it's not close to expiry, reuse it
  if (tokenCache.accessToken && now < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  // 2) If we previously got a 429, respect backoff
  if (now < tokenBackoffUntil) {
    throw new Error(
      `Guesty token rate-limited, backing off until ${new Date(
        tokenBackoffUntil
      ).toISOString()}`
    );
  }

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

  // 3) Handle rate limiting explicitly
  if (res.status === 429) {
    const text = await res.text().catch(() => "");
    console.error("Guesty token 429 Too Many Requests:", text);

    // back off for 60 seconds (tune if needed)
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
  const expiresIn = Number(json.expires_in || 86400); // seconds

  // refresh 5 minutes BEFORE actual expiry (but at least 60s)
  const effectiveTtlSeconds = Math.max(expiresIn - 300, 60);

  tokenCache = {
    accessToken,
    expiresAt: Date.now() + effectiveTtlSeconds * 1000,
  };
  tokenBackoffUntil = 0; // reset backoff on success

  return accessToken;
}

// =============================
// Main Netlify function handler
// =============================

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "text/plain" },
      body: "Method not allowed",
    };
  }

  const params = event.queryStringParameters || {};
  const listingId = params.listingId;
  const startDate = params.startDate;
  const endDate = params.endDate;
  const guests = Number(params.guests || 1) || 1;

  if (!listingId || !startDate || !endDate) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Missing required query params",
        details: { listingId, startDate, endDate },
      }),
    };
  }

  try {
    const token = await getAccessToken();

    // 1) Create a reservation quote – same flow Guesty booking widget uses
    const quoteRes = await fetch(`${BE_BASE_URL}/reservations/quotes`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        listingId,
        guestsCount: guests,
        checkInDateLocalized: startDate,
        checkOutDateLocalized: endDate,
      }),
    });

    if (!quoteRes.ok) {
      const text = await quoteRes.text();
      console.error("Guesty quote error:", quoteRes.status, text);
      return {
        statusCode: quoteRes.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Guesty pricing request failed",
          status: quoteRes.status,
          details: text,
        }),
      };
    }

    const quote = await quoteRes.json();

    // 2) Normalize into the simple shape your front-end expects:
    //    { days: [{ date, price, currency }, ...] }
    let days = [];

    // Case A: quote already has a top-level "days" array
    if (Array.isArray(quote.days)) {
      days = quote.days.map((d) => ({
        date: d.date,
        price: Number(d.price) || 0,
        currency: d.currency || quote.currency || "EUR",
      }));
    }
    // Case B: some accounts nest it under priceBreakdown.days
    else if (quote.priceBreakdown && Array.isArray(quote.priceBreakdown.days)) {
      days = quote.priceBreakdown.days.map((d) => ({
        date: d.date,
        price: Number(d.price) || 0,
        currency: d.currency || quote.currency || "EUR",
      }));
    }

    // Final response back to your browser
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId,
        startDate,
        endDate,
        days,
      }),
    };
  } catch (err) {
    console.error("Guesty get-pricing handler error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to fetch pricing from Guesty",
        details: String(err.message || err),
      }),
    };
  }
};
