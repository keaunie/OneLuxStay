// netlify/functions/get-pricing.js

// ✅ Official Guesty Open API host
const GUESTY_AUTH_URL = "https://open-api.guesty.com/oauth2/token";
const GUESTY_API_BASE = "https://open-api.guesty.com/v1";

/**
 * Get an access token from Guesty using clientId + clientSecret
 * Docs: https://open-api-docs.guesty.com/docs/authentication
 */
async function getGuestyAccessToken() {
  const clientId = process.env.GUESTY_CLIENT_ID;
  const clientSecret = process.env.GUESTY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET env vars."
    );
  }

  // Using x-www-form-urlencoded style from the docs
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

    // 1) Get Guesty access token
    const accessToken = await getGuestyAccessToken();

    // 2) Call Guesty availability-pricing calendar endpoint
    // Docs example:
    // GET https://open-api.guesty.com/v1/availability-pricing/api/calendar/listings/{id}?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&includeAllotment=true
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
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: "Guesty pricing request failed",
          status: res.status,
          details: text || res.statusText,
        }),
      };
    }

    const data = await res.json();

    // Docs response shape:
    // { status: 200, data: { days: [ { date, currency, price, minNights, status, ... } ] }, message: "OK" }
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
      // You can add more fields if you need them later
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
