// netlify/functions/get-pricing.js
// Uses Guesty Booking Engine "reservation quote" endpoint
// and returns { listingId, startDate, endDate, days[] } to the front-end.

const TOKEN_URL = "https://booking.guesty.com/oauth2/token";
const BE_BASE_URL = "https://booking.guesty.com/api";

// Optional in-memory token cache so we don’t ask for a token on every call
let cachedToken = null;
let cachedTokenExpiry = 0; // epoch ms

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry - 60_000) {
    return cachedToken;
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guesty token error ${res.status}: ${text}`);
  }

  const json = await res.json();
  const accessToken = json.access_token;
  const expiresIn = Number(json.expires_in || 86400); // seconds

  cachedToken = accessToken;
  cachedTokenExpiry = Date.now() + expiresIn * 1000;

  return accessToken;
}

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

    // 1) Create a reservation quote – this is what the Guesty booking widget uses
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
