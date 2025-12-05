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

function normalizeMoneyResponse(payload) {
  if (!payload) return null;
  const money = payload.money || payload;
  if (!money) return null;

  const currency = money.currency || "EUR";
  const nightsItems = Array.isArray(money.nightlyRateInvoiceItems)
    ? money.nightlyRateInvoiceItems
    : [];

  const accommodationItem = nightsItems.find((item) => {
    if (!item || !Array.isArray(item.nightsBreakdown)) return false;
    return (
      item.normalType === "AF" ||
      item.type === "ACCOMMODATION_FARE" ||
      item.title === "Accommodation fare"
    );
  });

  const days = accommodationItem
    ? accommodationItem.nightsBreakdown.map((night) => ({
        date: night.date,
        price: Number(night.basePrice) || 0,
        currency,
      }))
    : [];

  return {
    days,
    totals: {
      fareAccommodation: Number(money.fareAccommodation) || 0,
      cleaningFee: Number(money.fareCleaning) || 0,
      fees: Number(money.totalFees) || 0,
      taxes: Number(money.totalTaxes) || 0,
      subTotal: Number(money.subTotalPrice) || 0,
      currency,
    },
  };
}

function normalizeQuoteResponse(quote) {
  if (!quote) return [];
  const currency = quote.currency || "EUR";

  if (Array.isArray(quote.days)) {
    return quote.days.map((d) => ({
      date: d.date,
      price: Number(d.price) || 0,
      currency: d.currency || currency,
    }));
  }

  if (quote.priceBreakdown && Array.isArray(quote.priceBreakdown.days)) {
    return quote.priceBreakdown.days.map((d) => ({
      date: d.date,
      price: Number(d.price) || 0,
      currency: d.currency || currency,
    }));
  }

  return [];
}

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

    const payload = {
      listingId,
      guestsCount: guests,
      checkInDateLocalized: startDate,
      checkOutDateLocalized: endDate,
    };

    // 1) Try the more detailed reservations/money endpoint first so we can
    //    expose fareAccommodation + nightly breakdowns.
    let moneyData = null;
    try {
      const moneyUrl = new URL(`${BE_BASE_URL}/reservations/money`);
      moneyUrl.searchParams.set("listingId", listingId);
      moneyUrl.searchParams.set("guestsCount", String(guests));
      moneyUrl.searchParams.set("checkInDateLocalized", startDate);
      moneyUrl.searchParams.set("checkOutDateLocalized", endDate);

      const moneyRes = await fetch(moneyUrl.toString(), {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
        },
      });

      if (!moneyRes.ok) {
        const text = await moneyRes.text();
        throw new Error(
          `Guesty money endpoint error ${moneyRes.status}: ${text}`
        );
      }

      moneyData = await moneyRes.json();
    } catch (moneyErr) {
      console.error("Guesty reservations/money error:", moneyErr);
    }

    const normalizedMoney = normalizeMoneyResponse(moneyData);
    if (normalizedMoney) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          startDate,
          endDate,
          ...normalizedMoney,
        }),
      };
    }

    // 2) Fall back to the older reservations/quotes endpoint if needed.
    const quoteRes = await fetch(`${BE_BASE_URL}/reservations/quotes`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
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
    const quoteDays = normalizeQuoteResponse(quote);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId,
        startDate,
        endDate,
        days: quoteDays,
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
