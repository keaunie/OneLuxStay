// netlify/functions/get-pricing.js
// Uses built-in fetch (no axios needed)

// ⚠️ Adjust these URLs if your Guesty docs say something different:
const GUESTY_AUTH_URL = "https://api.guesty.com/oauth2/token"; // example
const GUESTY_API_BASE = "https://api.guesty.com/api/v2";

// Get an access token from Guesty using client_id + client_secret
async function getGuestyAccessToken() {
  const clientId = process.env.GUESTY_CLIENT_ID;
  const clientSecret = process.env.GUESTY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET env vars."
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(GUESTY_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guesty auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Guesty auth response missing access_token");
  }

  return data.access_token;
}

exports.handler = async (event) => {
  try {
    // Only allow GET
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

    // 2) Call Guesty pricing/availability endpoint
    // ⚠️ Adjust path if your Guesty API docs use a different route:
    const url = new URL(
      `${GUESTY_API_BASE}/listings/${encodeURIComponent(
        listingId
      )}/availability/prices`
    );
    url.searchParams.set("from", startDate);
    url.searchParams.set("to", endDate);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Guesty pricing error:", res.status, text);
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: "Guesty pricing request failed",
          status: res.status,
          details: text,
        }),
      };
    }

    const data = await res.json();

    // Normalize output to: { days: [ { date, price, currency, available, minStay }, ... ] }
    // Adjust this mapping if Guesty returns a different shape.
    const daysRaw = Array.isArray(data.days)
      ? data.days
      : Array.isArray(data)
      ? data
      : [];
    const days = daysRaw.map((day) => ({
      date: day.date,
      price:
        (day.price && (day.price.amount ?? day.price.value)) ??
        day.price ??
        null,
      currency: (day.price && day.price.currency) || "EUR",
      available: typeof day.available === "boolean" ? day.available : true,
      minStay: day.minNights ?? day.minStay ?? null,
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
