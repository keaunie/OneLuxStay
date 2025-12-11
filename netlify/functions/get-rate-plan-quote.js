const { getOpenApiToken } = require("../lib/openApiToken");

const OPEN_API_BASE = "https://open-api.guesty.com/v1";

function normalizeGuestCounts(payload = {}) {
  const adults = Number(payload.numberOfAdults ?? payload.adults ?? payload.guestsCount ?? 1);
  const children = Number(payload.numberOfChildren ?? payload.children ?? 0);
  const infants = Number(payload.numberOfInfants ?? payload.infants ?? 0);
  const total =
    Number(payload.guestsCount) ||
    adults + children + Math.min(infants, 1); // infants not counted toward total occupancy usually
  return {
    numberOfAdults: adults,
    numberOfChildren: children,
    numberOfInfants: infants,
    guestsCount: total || 1,
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
      body: JSON.stringify({ error: "Invalid JSON", details: err.message }),
    };
  }

  const listingId = body.listingId || body.unitTypeId || body.unitId;
  const checkIn = body.checkInDateLocalized || body.checkIn || body.startDate;
  const checkOut = body.checkOutDateLocalized || body.checkOut || body.endDate;
  const source = body.source || "OAPI";
  const guestCounts = normalizeGuestCounts(body);

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

  const payload = {
    listingId,
    unitTypeId: listingId,
    unitId: body.unitId || listingId,
    checkInDateLocalized: checkIn,
    checkOutDateLocalized: checkOut,
    source,
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
      console.error("Guesty quotes error:", res.status, text);
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
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    };
  } catch (err) {
    console.error("Guesty quote function error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to fetch Guesty quote",
        details: err.message || String(err),
      }),
    };
  }
};
