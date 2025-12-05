// netlify/functions/get-pricing.js
// Uses Guesty Booking Engine "reservation quote" endpoint
// and returns { listingId, startDate, endDate, days[] } to the front-end.

const BE_BASE_URL = "https://booking.guesty.com/api";
const { getBookingToken } = require("../lib/bookingToken");

// =============================
// Token management (Booking Engine API)
// =============================

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
    const token = await getBookingToken();

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
      moneyUrl.searchParams.set("checkIn", startDate);
      moneyUrl.searchParams.set("checkOut", endDate);

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
