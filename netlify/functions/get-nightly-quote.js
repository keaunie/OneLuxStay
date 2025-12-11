const { getOpenApiToken } = require("../lib/openApiToken");

const OPEN_API_BASE = "https://open-api.guesty.com/v1";

function normalizeGuests(payload = {}) {
  const adults = Number(payload.numberOfAdults ?? payload.adults ?? 1);
  const children = Number(payload.numberOfChildren ?? payload.children ?? 0);
  const infants = Number(payload.numberOfInfants ?? payload.infants ?? 0);
  return {
    numberOfAdults: adults,
    numberOfChildren: children,
    numberOfInfants: infants,
    guestsCount:
      Number(payload.guestsCount) || adults + children + (infants ? 1 : 0) || 1,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "text/plain" },
      body: "Method not allowed",
    };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON payload", details: err.message }),
    };
  }

  const listingId = body.listingId || body.unitTypeId || body.unitId;
  const checkIn = body.checkInDateLocalized || body.checkIn;
  const checkOut = body.checkOutDateLocalized || body.checkOut;
  if (!listingId || !checkIn || !checkOut) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Missing required fields",
        details: { listingId, checkIn, checkOut },
      }),
    };
  }

  const guestCounts = normalizeGuests(body.numberOfGuests || body);

  const payload = {
    listingId,
    checkInDateLocalized: checkIn,
    checkOutDateLocalized: checkOut,
    source: body.source || "OAPI",
    ignoreTerms: Boolean(body.ignoreTerms),
    ignoreCalendar: Boolean(body.ignoreCalendar),
    ignoreBlocks: Boolean(body.ignoreBlocks),
    numberOfGuests: {
      numberOfAdults: guestCounts.numberOfAdults,
      numberOfChildren: guestCounts.numberOfChildren,
      numberOfInfants: guestCounts.numberOfInfants,
    },
    guestsCount: guestCounts.guestsCount,
  };

  try {
    const token = await getOpenApiToken();
    const res = await fetch(`${OPEN_API_BASE}/quotes`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        statusCode: res.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Guesty quote request failed",
          status: res.status,
          details: text,
        }),
      };
    }

    const json = await res.json();
    const ratePlans = json?.rates?.ratePlans || [];
    const firstPlan = ratePlans[0] || {};
    const nightly = Array.isArray(firstPlan.days)
      ? firstPlan.days.map((day) => ({
          date: day.date,
          basePrice: Number(day.basePrice) || 0,
          price: Number(day.price) || Number(day.basePrice) || 0,
          currency: day.currency || json?.currency || "USD",
        }))
      : [];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId,
        checkInDateLocalized: checkIn,
        checkOutDateLocalized: checkOut,
        guestsCount: guestCounts.guestsCount,
        nightly,
        raw: json,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to fetch Guesty nightly quote",
        details: err.message || String(err),
      }),
    };
  }
};
