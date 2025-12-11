const { getBookingToken } = require("../lib/bookingToken");

const BOOKINGS_BASE = "https://booking.guesty.com/api";

function normalizeNightlyBreakdown(money = {}) {
  const nightlyItem = (money.nightlyRateInvoiceItems || []).find(
    (item) =>
      item?.normalType === "AF" ||
      item?.type === "ACCOMMODATION_FARE" ||
      item?.title === "Accommodation fare"
  );

  if (!nightlyItem || !Array.isArray(nightlyItem.nightsBreakdown)) return [];

  return nightlyItem.nightsBreakdown.map((night) => ({
    date: night.date,
    basePrice: Number(night.basePrice) || 0,
  }));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "text/plain" },
      body: "Method not allowed",
    };
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Invalid JSON payload",
        details: err.message,
      }),
    };
  }

  const listingId = payload.listingId;
  const checkIn = payload.checkIn;
  const checkOut = payload.checkOut;
  const guestsCount = Number(payload.guestsCount || payload.guests || 1);

  if (!listingId || !checkIn || !checkOut) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Missing required fields",
        details: { listingId, checkIn, checkOut, guestsCount },
      }),
    };
  }

  try {
    const token = await getBookingToken();
    const res = await fetch(
      `${BOOKINGS_BASE}/reservations/pre-calculated-price`,
      {
        method: "POST",
        headers: {
          accept: "application/json; charset=utf-8",
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          listingId,
          checkIn,
          checkOut,
          guestsCount,
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("Guesty reservation pricing error:", res.status, text);
      return {
        statusCode: res.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Guesty reservation pricing request failed",
          status: res.status,
          details: text,
        }),
      };
    }

    const json = await res.json();
    const money = json?.money || json || {};
    const nightlyBreakdown = normalizeNightlyBreakdown(money);
    const diffMs = Date.parse(checkOut) - Date.parse(checkIn);
    const nights = Number.isFinite(diffMs) && diffMs > 0 ? diffMs / 86400000 : nightlyBreakdown.length;
    const subtotal =
      money.subTotalPrice ??
      money.fareAccommodationAdjusted ??
      nightlyBreakdown.reduce((acc, n) => acc + (n.basePrice || 0), 0);
    const taxes = money.totalTaxes ?? 0;
    const fees = money.totalFees ?? 0;
    const total =
      money.balanceDue ??
      money.totalPrice ??
      (subtotal != null ? subtotal + taxes : null);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId,
        checkIn,
        checkOut,
        guestsCount,
        nightlyBreakdown,
        invoiceItems: money.invoiceItems || [],
        totals: {
          nights: nights || nightlyBreakdown.length || null,
          subtotal: subtotal ?? null,
          taxes,
          fees,
          total,
          currency: money.currency || "EUR",
        },
      }),
    };
  } catch (err) {
    console.error("Guesty reservation pricing function error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to fetch reservation pricing from Guesty",
        details: err.message || String(err),
      }),
    };
  }
};
