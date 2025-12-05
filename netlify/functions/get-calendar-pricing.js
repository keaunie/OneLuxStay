const { getGuestyToken } = require("../lib/guestyToken");

const CALENDAR_URL =
  "https://api.guesty.com/api/v3/calendar/availability-pricing";

function normalizeCalendarEntry(entry) {
  if (!entry || !Array.isArray(entry.days)) {
    return {
      days: [],
      totals: { nights: 0, subtotal: 0, currency: entry?.currency || "EUR" },
    };
  }

  const currency = entry.currency || "EUR";
  const days = entry.days.map((day) => {
    const pricing = day.pricing || {};
    const price =
      Number(pricing.nightlyRate ?? pricing.basePrice ?? day.price ?? 0) || 0;
    return {
      date: day.date || day.day || day.calendarDate,
      price,
      currency: pricing.currency || currency,
      available: day.isAvailable ?? day.available ?? true,
    };
  });

  const subtotal = days.reduce((acc, d) => acc + (Number(d.price) || 0), 0);

  return {
    days,
    totals: {
      nights: days.length,
      subtotal,
      currency,
    },
  };
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
  const guests = params.guests || "1";

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
    const token = await getGuestyToken();

    const qs = new URLSearchParams({
      listingIds: listingId,
      startDate,
      endDate,
      includeAvailability: "true",
      includePricing: "true",
      includeReservations: "false",
      guestsCount: guests,
    });

    const res = await fetch(`${CALENDAR_URL}?${qs.toString()}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Guesty calendar pricing error:", res.status, text);
      return {
        statusCode: res.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Guesty calendar pricing request failed",
          status: res.status,
          details: text,
        }),
      };
    }

    const json = await res.json();
    const entry =
      (Array.isArray(json?.data) && json.data[0]) ||
      (Array.isArray(json?.results) && json.results[0]) ||
      json;
    const { days, totals } = normalizeCalendarEntry(entry);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId,
        startDate,
        endDate,
        days,
        totals,
      }),
    };
  } catch (err) {
    console.error("Guesty calendar function error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to fetch pricing from Guesty calendar",
        details: String(err.message || err),
      }),
    };
  }
};
