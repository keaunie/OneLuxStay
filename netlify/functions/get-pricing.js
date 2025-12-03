// netlify/functions/get-pricing.js

const axios = require("axios");

// Adjust these if Guesty gave you different URLs:
const GUESTY_AUTH_URL = "https://api.guesty.com/oauth2/token"; // example
const GUESTY_API_BASE = "https://api.guesty.com/api/v2";

async function getGuestyAccessToken() {
  const clientId = process.env.GUESTY_CLIENT_ID;
  const clientSecret = process.env.GUESTY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET env vars."
    );
  }

  // Most client-credentials flows look like this:
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await axios.post(GUESTY_AUTH_URL, body.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  // Expect something like: { access_token: "...", token_type: "Bearer", expires_in: 3600 }
  return response.data.access_token;
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

    // 1) Get access token using client_id + client_secret
    const accessToken = await getGuestyAccessToken();

    // 2) Call Guesty pricing/availability endpoint
    // NOTE: You may need to tweak the path to the exact one Guesty gives you.
    const url = `${GUESTY_API_BASE}/listings/${listingId}/availability/prices`;

    const response = await axios.get(url, {
      params: {
        from: startDate,
        to: endDate,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = response.data;

    // 3) Simplify the data for your frontend
    const simplified = (data?.days || data || []).map((day) => ({
      date: day.date,
      price: day.price?.amount ?? day.price ?? null,
      currency: day.price?.currency || "USD",
      available: day.available ?? true,
      minStay: day.minNights ?? day.minStay ?? null,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        listingId,
        startDate,
        endDate,
        nights: simplified.length,
        days: simplified,
      }),
    };
  } catch (err) {
    console.error(
      "Error in get-pricing function:",
      err.response?.data || err.message
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to fetch pricing from Guesty",
        details: err.response?.data || err.message,
      }),
    };
  }
};
