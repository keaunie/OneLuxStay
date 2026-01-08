const GOOGLE_PLACES_DETAILS_URL =
  "https://maps.googleapis.com/maps/api/place/details/json";

exports.handler = async (event) => {
  const baseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: {
        ...baseHeaders,
        "Content-Type": "text/plain",
      },
      body: "Method not allowed",
    };
  }

  const params = event.queryStringParameters || {};
  const placeId = params.placeId;
  const language = params.language || "en";

  if (!placeId) {
    return {
      statusCode: 400,
      headers: baseHeaders,
      body: JSON.stringify({ error: "Missing placeId query param" }),
    };
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ error: "Missing GOOGLE_PLACES_API_KEY" }),
    };
  }

  try {
    const url = new URL(GOOGLE_PLACES_DETAILS_URL);
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("fields", "rating,user_ratings_total,reviews");
    url.searchParams.set("language", language);
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      return {
        statusCode: 502,
        headers: baseHeaders,
        body: JSON.stringify({ error: "Google Places request failed" }),
      };
    }

    const payload = await res.json();
    if (payload.status !== "OK") {
      return {
        statusCode: 502,
        headers: baseHeaders,
        body: JSON.stringify({
          error: "Google Places response error",
          details: payload.status,
        }),
      };
    }

    const result = payload.result || {};
    const reviews = Array.isArray(result.reviews) ? result.reviews : [];

    return {
      statusCode: 200,
      headers: {
        ...baseHeaders,
        "Cache-Control": "public, max-age=600",
      },
      body: JSON.stringify({
        rating: result.rating || null,
        total: result.user_ratings_total || null,
        reviews: reviews.map((review) => ({
          author_name: review.author_name || "",
          author_url: review.author_url || "",
          profile_photo_url: review.profile_photo_url || "",
          rating: review.rating || null,
          text: review.text || "",
          time: review.time || null,
          relative_time_description: review.relative_time_description || "",
        })),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
};
