const { getBookingToken } = require("../lib/bookingToken");

const CALENDAR_URL = "https://booking.guesty.com/api";

function normalizeCalendarEntry(entry) {
  let calendar =
    (entry &&
      (entry.calendar || entry.days || entry.calendarDays || entry.data)) ||
    [];

  if (!Array.isArray(calendar) && calendar && typeof calendar === "object") {
    calendar = Object.values(calendar);
  }

  if (!Array.isArray(calendar)) {
    return {
      days: [],
      totals: { nights: 0, subtotal: 0, currency: entry?.currency || "EUR" },
    };
  }

  const currency = entry?.currency || "EUR";
  const days = calendar.map((day) => {
    const price = Number(
      day.basePrice ??
        day.nightlyRate ??
        day.price ??
        (day.pricing && (day.pricing.price || day.pricing.nightlyRate)) ??
        0
    );
    return {
      date: day.date || day.day || day.calendarDate,
      price: Number.isFinite(price) ? price : 0,
      currency: day.currency || currency,
      available: day.available ?? day.isAvailable ?? true,
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
    const token = await getBookingToken();

    const qs = new URLSearchParams({
      from: startDate,
      to: endDate,
    });

    const res = await fetch(
      `${CALENDAR_URL}/listings/${listingId}/calendar?${qs.toString()}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
        },
      }
    );

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
    const { days, totals } = normalizeCalendarEntry(json);

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
