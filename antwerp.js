/* ==========================================
   CONFIG: which JSON files to load
   ========================================== */
const DEFAULT_PROPS_URLS = [
  "/data/properties-antwerp.json",
  "/data/properties-dubai.json",
  "/data/properties-losangeles.json",
  "/data/properties-miami.json",
  "/data/properties-redondo.json",
];

/* Parse data-props="a.json,b.json" or data-props='["a.json","b.json"]' */
function parsePropsUrls(raw, fallbackUrls = DEFAULT_PROPS_URLS) {
  if (!raw || !raw.trim()) return fallbackUrls;

  const trimmed = raw.trim();

  // JSON array style: '["/a.json","/b.json"]'
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        const cleaned = arr.map((s) => String(s).trim()).filter(Boolean);
        return cleaned.length ? cleaned : fallbackUrls;
      }
    } catch (e) {
      console.warn("Failed to parse data-props JSON, falling back to CSV:", e);
    }
  }

  // CSV style: "/a.json,/b.json"
  const csv = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return csv.length ? csv : fallbackUrls;
}

/* ==========================================
   Guesty pricing helper (via Netlify function)
   ========================================== */
async function fetchGuestyPricing(guestyId, startDate, endDate) {
  if (!guestyId || !startDate || !endDate) return null;

  const qs = new URLSearchParams({
    listingId: guestyId,
    startDate,
    endDate,
  }).toString();

  try {
    const res = await fetch(`/.netlify/functions/get-calendar-pricing?${qs}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("Guesty pricing HTTP error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    if (!data) return null;

    const days = Array.isArray(data.days) ? data.days : [];
    const totals =
      data.totals && typeof data.totals === "object" ? data.totals : null;
    const currency =
      days[0]?.currency || totals?.currency || data.currency || "EUR";

    const nightsFromDays = days.length;
    const nightsFromRange = (() => {
      const ci = Date.parse(startDate);
      const co = Date.parse(endDate);
      if (Number.isNaN(ci) || Number.isNaN(co)) return 0;
      const diff = Math.round((co - ci) / 86400000);
      return diff > 0 ? diff : 0;
    })();
    const nights = nightsFromDays || nightsFromRange;

    const nightlySum = days.reduce((acc, d) => acc + (Number(d.price) || 0), 0);
    const totalFromTotals = totals
      ? (Number(totals.subTotal) || 0) + (Number(totals.taxes) || 0)
      : 0;
    const totalPrice =
      totalFromTotals > 0
        ? totalFromTotals
        : nightlySum > 0
        ? nightlySum
        : null;

    const avgPerNight =
      nights > 0 && totalPrice != null
        ? totalPrice / nights
        : nightsFromDays > 0
        ? nightlySum / nightsFromDays
        : null;

    if (!days.length && totalPrice == null) return null;

    return {
      nights: nights || null,
      avgPerNight,
      totalPrice,
      currency,
      days,
      totals,
    };
  } catch (err) {
    console.warn("Error calling Guesty pricing function:", err);
    return null;
  }
}

async function fetchGuestyNightlyQuote(listingId, checkIn, checkOut, guests) {
  if (!listingId || !checkIn || !checkOut) return null;
  try {
    const res = await fetch("/.netlify/functions/get-nightly-quote", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        listingId,
        checkInDateLocalized: checkIn,
        checkOutDateLocalized: checkOut,
        numberOfAdults: Number(guests) || 1,
        guestsCount: Number(guests) || 1,
      }),
    });
    if (!res.ok) {
      console.warn("Nightly quote HTTP error", res.status, await res.text());
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn("Failed to fetch nightly quote", err);
    return null;
  }
}

/* =========================
   LISTINGS PAGE (MULTI JSON)
   ========================= */
function initListingsPage() {
  const root = document.getElementById("listing-root-antwerp");
  if (!root) return;

  const els = {
    chips: document.getElementById("chips"),
    results: document.getElementById("results"),
    meta: document.getElementById("meta"),
    q: document.getElementById("q"),
    sort: document.getElementById("sort"),
    clear: document.getElementById("clear"),
  };

  // filters.cities for location chips
  const state = {
    all: [],
    filters: {
      areas: new Set(),
      cities: new Set(),
      q: "",
      sort: "top",
    },
  };

  function escapeHtml(str) {
    return String(str).replace(
      /[&<>"']/g,
      (s) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[s])
    );
  }
  function fmtScore(x) {
    return typeof x === "number" && x > 0 ? x.toFixed(1) : "-";
  }
  function fmtReviews(x) {
    return typeof x === "number" ? x.toLocaleString() : "0";
  }
  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // build location chips from state.all
  function buildCityChips() {
    if (!els.chips) return;

    const cities = Array.from(
      new Set(state.all.map((p) => (p.city || "").trim()).filter(Boolean))
    );

    if (!cities.length) return;

    els.chips.innerHTML = cities
      .map(
        (city) => `
      <button
        class="chip"
        type="button"
        data-city="${escapeHtml(city.toLowerCase())}"
        aria-pressed="false">
        ${escapeHtml(city)}
      </button>
    `
      )
      .join("");
  }

  function derive() {
    let items = [...state.all];

    // filter by city
    if (state.filters.cities.size) {
      items = items.filter((p) =>
        state.filters.cities.has((p.city || "").toLowerCase())
      );
    }

    // Existing area filter
    if (state.filters.areas.size) {
      items = items.filter((p) =>
        state.filters.areas.has((p.area || "").toLowerCase())
      );
    }

    if (state.filters.q) {
      const q = state.filters.q;
      items = items.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.amenities || []).join(" ").toLowerCase().includes(q) ||
          (p.district || "").toLowerCase().includes(q)
      );
    }
    switch (state.filters.sort) {
      case "rating":
        items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case "price":
        items.sort((a, b) => (a.price_from || 0) - (b.price_from || 0));
        break;
      case "distance":
        items.sort((a, b) => (a.distance_km || 99) - (b.distance_km || 99));
        break;
      default:
        items.sort(
          (a, b) =>
            (b.rating || 0) * (b.reviews || 1) -
            (a.rating || 0) * (a.reviews || 1)
        );
    }
    return items;
  }

  function update() {
    const items = derive();
    if (els.meta) {
      els.meta.textContent = `${items.length} ${
        items.length === 1 ? "property" : "properties"
      } found`;
    }
    if (!els.results) return;

    els.results.innerHTML = "";

    if (!items.length) {
      els.results.innerHTML = `<div class="empty">No results. Try clearing filters or searching another amenity.</div>`;
      return;
    }

    for (const p of items) {
      const basePrice =
        p.price_from ??
        p.__raw?.price?.from ??
        (typeof p.__raw?.price === "number" ? p.__raw.price : null);
      const displayCurrency = p.currency || p.__raw?.price?.currency || "EUR";
      const priceMarkup =
        basePrice != null
          ? `<div class="price">Starts at ${currencySymbol(
              displayCurrency
            )}${Number(basePrice).toLocaleString()} / night</div>`
          : `<div class="price ghost">Starts at -</div>`;
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="media">
          <img src="${
            (p.images && p.images[0]) ||
            "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?q=80&w=1200&auto=format&fit=crop"
          }"
               alt="${escapeHtml(p.name)} in ${escapeHtml(
        p.district || "Antwerp"
      )}" loading="lazy" />
        </div>
        <div class="body">
          <h3 class="title">${escapeHtml(p.name)}</h3>
          <div class="loc">${escapeHtml(p.district || "Antwerp")}${
        p.area ? ` - ${escapeHtml(cap(p.area || ""))}` : ""
      }${p.distance_km ? ` - ${p.distance_km} km from center` : ""}</div>

          <div class="badges">
            <span class="badge score" title="Guest score">${fmtScore(
              p.rating
            )}</span>
            <span class="badge" title="Reviews">${fmtReviews(
              p.reviews
            )} reviews</span>
            ${
              p.stars
                ? `<span class="badge" title="Star rating">${"*".repeat(
                    p.stars
                  )}${".".repeat(Math.max(0, 5 - p.stars))}</span>`
                : ""
            }
          </div>

          <p class="desc">${escapeHtml(
            p.description ||
              "A refined stay with privacy, comfort and thoughtful design."
          )}</p>

          <div class="amen">${(p.amenities || [])
            .slice(0, 6)
            .map((a) => `<span class="it">${escapeHtml(a)}</span>`)
            .join("")}</div>

          <div class="cta">
            ${priceMarkup}
            <a class="btn btn--gold btn--price" href="/antwerpProp?id=${encodeURIComponent(
              p.id
            )}" data-link>
              Show prices
            </a>
          </div>
        </div>
      `;
      els.results.appendChild(card);
    }
  }

  function wireControls() {
    els.q?.addEventListener("input", (e) => {
      state.filters.q = e.target.value.trim().toLowerCase();
      update();
    });
    els.sort?.addEventListener("change", (e) => {
      state.filters.sort = e.target.value;
      update();
    });

    // chips click handler (city + area)
    if (els.chips) {
      els.chips.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip) return;

        const citySlug = chip.dataset.city;
        const areaSlug = chip.dataset.area;

        if (citySlug) {
          const key = citySlug.toLowerCase();
          if (chip.classList.contains("active")) {
            chip.classList.remove("active");
            chip.setAttribute("aria-pressed", "false");
            // filters.cities for location chips
          } else {
            chip.classList.add("active");
            chip.setAttribute("aria-pressed", "true");
            // filters.cities for location chips
          }
        } else if (areaSlug) {
          const key = areaSlug.toLowerCase();
          if (chip.classList.contains("active")) {
            chip.classList.remove("active");
            chip.setAttribute("aria-pressed", "false");
            state.filters.areas.delete(key);
          } else {
            chip.classList.add("active");
            chip.setAttribute("aria-pressed", "true");
            state.filters.areas.add(key);
          }
        }

        update();
      });
    }

    els.clear?.addEventListener("click", () => {
      state.filters.q = "";
      state.filters.sort = "top";
      state.filters.areas.clear();
      // filters.cities for location chips
      if (els.q) els.q.value = "";
      if (els.sort) els.sort.value = "top";
      if (els.chips)
        [...els.chips.querySelectorAll(".chip")].forEach((c) => {
          c.classList.remove("active");
          c.setAttribute("aria-pressed", "false");
        });
      update();
    });
  }

  const rawProps = root.dataset.props || "";
  const propsUrls = parsePropsUrls(rawProps, DEFAULT_PROPS_URLS);

  Promise.all(
    propsUrls.map((u) =>
      fetch(u, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
          return r.json();
        })
        .then((json) => {
          const mapped = normalizeProperties(json);
          console.log(
            "[LISTINGS] Loaded",
            mapped.length,
            "properties from",
            u,
            "cities:",
            Array.from(new Set(mapped.map((p) => p.city))).join(", ")
          );
          return mapped;
        })
        .catch((err) => {
          console.warn("Failed to load properties from", u, err);
          return [];
        })
    )
  )
    .then((arrays) => {
      state.all = arrays.flat();
      buildCityChips();
      wireControls();
      update();
    })
    .catch((err) => {
      console.warn("Failed to load properties.json:", err);
      state.all = [];
      buildCityChips();
      wireControls();
      update();
    });
}

window.initListingsPage = initListingsPage;

/* =========================
   PROPERTY DETAIL PAGE (MULTI JSON)
   ========================= */
function initPropertyDetailPageAntwerp() {
  const container = document.getElementById("property-detail-antwerp");
  if (!container) return;

  const rawProps = container.dataset.props || "";
  const propsUrls = parsePropsUrls(rawProps, DEFAULT_PROPS_URLS);

  const params = new URLSearchParams(location.search);
  const propertyId = params.get("id");

  const fmtDate = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const fmtDisplayDate = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  };
  const parseInputDate = (value) => {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      const [m, d, y] = value.split("/").map(Number);
      return new Date(y, m - 1, d);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const toISODateString = (value) => {
    const date = parseInputDate(value);
    return date ? fmtDate(date) : "";
  };
  const fmtMoney = (amount, ccy = "EUR") =>
    `${currencySymbol(ccy)}${Number(amount || 0).toLocaleString()}`;

  function notFound(msg = "Property not found.") {
    container.innerHTML = `<p style="padding:16px">${msg} <a href="/properties-antwerp" data-link>Back to listings</a></p>`;
  }

  function render(property, all) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const images = property.images || [];
    const heroImage = images[0] || "";
    const sideImageA = images[1] || heroImage;
    const sideImageB = images[2] || heroImage;
    const amenities = Array.from(
      new Set([
        ...(property.amenities || []),
        ...(property.rooms || []).flatMap((room) => room.amenities || []),
      ])
    );
    const topAmenities = amenities.slice(0, 10);
    const popularAmenities = amenities.slice(0, 6);
    const essentialAmenities = amenities.slice(0, 6).join(", ");
    const extraAmenities = amenities.slice(6, 12).join(", ");

    document.title = `${property.title} - One Lux Stay`;

    const amenityIcon = (label) => {
      const name = String(label || "").toLowerCase();
      if (/(apartment|suite|residence|loft)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 7l6-5 6 5v7H9v-4H7v4H2z"/></svg>';
      }
      if (/(bath|shower)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 9h10v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9z"/><path d="M5 9V6a2 2 0 0 1 2-2h1"/></svg>';
      }
      if (/(balcony|terrace)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h10M4 6v6M8 6v6M12 6v6M3 12h10"/></svg>';
      }
      if (/(wifi|wi-fi)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7a6 6 0 0 1 10 0"/><path d="M5 9a4 4 0 0 1 6 0"/><path d="M7 11a2 2 0 0 1 2 0"/><circle cx="8" cy="13" r="1"/></svg>';
      }
      if (/(pet)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="6" r="1"/><circle cx="8" cy="5" r="1"/><circle cx="11" cy="6" r="1"/><path d="M6 10c1-1 3-1 4 0 1 1 1 3-2 3s-3-2-2-3z"/></svg>';
      }
      if (/(family|kids)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="6" r="2"/><circle cx="11" cy="6" r="2"/><path d="M2 14c0-2 2-4 4-4s4 2 4 4"/><path d="M8 14c0-2 2-4 4-4s4 2 4 4"/></svg>';
      }
      if (/(kitchen)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/><path d="M5 8V6h6v2"/><path d="M4 5h8"/></svg>';
      }
      if (/(non-smoking|smoke)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M4 4l8 8"/></svg>';
      }
      if (/(bed linens|linens)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="5" width="12" height="7" rx="2"/><path d="M4 6h4"/></svg>';
      }
      if (/(essentials|clothing storage|hangers)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4a2 2 0 1 1 4 0v1l3 2H3l3-2V4z"/><path d="M3 7h10l-1 6H4z"/></svg>';
      }
      if (/(hair dryer|hairdryer)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h6a3 3 0 1 0 0-6H6"/><path d="M8 8v4M6 12h4"/></svg>';
      }
      if (/(heating)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2v12M11 2v12"/><path d="M3 6h10M3 10h10"/></svg>';
      }
      if (/(internet|wireless internet|wifi|wi-fi)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7a6 6 0 0 1 10 0"/><path d="M5 9a4 4 0 0 1 6 0"/><path d="M7 11a2 2 0 0 1 2 0"/><circle cx="8" cy="13" r="1"/></svg>';
      }
      if (/(iron)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 10h10l-1-4H4z"/><path d="M5 6h4"/></svg>';
      }
      if (/(tv|television)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="4" width="12" height="7" rx="1"/><path d="M6 13h4"/></svg>';
      }
      if (/(washer|washing machine|laundry)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="4" width="10" height="10" rx="2"/><circle cx="8" cy="9" r="3"/><path d="M5 6h2"/></svg>';
      }
      if (/(body soap|shampoo|conditioner|shower gel|cleaning products)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="3" width="6" height="10" rx="2"/><path d="M6 3V2h4v1"/></svg>';
      }
      if (/(hot water)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3c0 2 2 2 2 4s-2 2-2 4"/><path d="M9 3c0 2 2 2 2 4s-2 2-2 4"/></svg>';
      }
      if (/(carbon monoxide detector|smoke detector)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="M8 3v2M8 11v2M3 8h2M11 8h2"/></svg>';
      }
      if (/(fire extinguisher)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="6" y="5" width="4" height="8" rx="1"/><path d="M6 4h4M8 2v2"/></svg>';
      }
      if (/(coffee|coffee maker|kettle)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 5h6v4a3 3 0 0 1-3 3H4z"/><path d="M10 6h2a1 1 0 0 1 0 2h-2"/></svg>';
      }
      if (/(cookware|dishes|silverware|dining table|oven|refrigerator|freezer)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="4" height="10"/><path d="M9 3h4v10H9z"/><path d="M9 6h4"/></svg>';
      }
      if (/(laptop-friendly workspace|workspace)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="4" width="10" height="6" rx="1"/><path d="M2 12h12"/></svg>';
      }
      if (/(parking|paid parking)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="10" height="12" rx="2"/><path d="M6 5h3a2 2 0 0 1 0 4H6z"/></svg>';
      }
      if (/(long-term stays allowed|luggage dropoff allowed)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="9" rx="1"/><path d="M6 4V3a2 2 0 0 1 4 0v1"/></svg>';
      }
      if (/(washing|laundry)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="4" width="10" height="10" rx="2"/><circle cx="8" cy="9" r="3"/><path d="M5 6h2"/></svg>';
      }
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/></svg>';
    };

    const isFashionDistrict =
      (property.id || "").includes("fashion") ||
      /fashion/i.test(property.title || "") ||
      /fashion/i.test(property.location?.neighborhood || "");
    const isCentralSignature = (property.id || "") === "antwerp-central-5";
    const isDiamondDistrict = (property.id || "") === "antwerp-diamond-30";
    const isCityCentre = (property.id || "") === "antwerp-centre-20";
    const googleReviewsPlaceId =
      (property.id || "") === "antwerp-central-5"
        ? "ChIJ-9DmtqL3w0cRSCwudECBvqI"
        : "";
    const localReviewsUrl =
      (property.id || "") === "antwerp-central-5"
        ? "/data/central-signature-reviews.json"
        : (property.id || "") === "antwerp-centre-20"
        ? "/data/central-signature-reviews.json"
        : (property.id || "") === "antwerp-fashion-12"
        ? "/data/fashion-district-reviews.json"
        : (property.id || "") === "antwerp-diamond-30"
        ? "/data/diamond-district-reviews.json"
        : "";
    let reviewsForModal = null;
    const mapTitle = isFashionDistrict
      ? "One Lux Stay Antwerp Fashion District map"
      : isCentralSignature
      ? "One Lux Stay Antwerp Central Signature Suites map"
      : isDiamondDistrict
      ? "One Lux Stay Antwerp Diamond District map"
      : isCityCentre
      ? "One Lux Stay Antwerp City Centre map"
      : "Lange Leemstraat 5, Antwerpen map";
    const mapSrc = isFashionDistrict
      ? "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d9995.936956171985!2d4.411811999999995!3d51.21936600000001!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c3f7c4e1dd0591%3A0x75085891d1b3c81f!2sOne%20Lux%20Stay%20Antwerp%20Fashion%20District!5e0!3m2!1sen!2sus!4v1767846435294!5m2!1sen!2sus"
      : isCentralSignature
      ? "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2499.4424782937153!2d4.406373412603858!3d51.210924032200126!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c3f7a2b6e6d0fb%3A0xa2be8140742e2c48!2sOne%20Lux%20Stay%20Antwerp%20Central%20Signature%20Suites!5e0!3m2!1sen!2sus!4v1767846775149!5m2!1sen!2sus"
      : isDiamondDistrict
      ? "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2499.5609147435594!2d4.408742258172995!3d51.20874195985823!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c3f7f18b4a4a51%3A0xa469078beac70fc6!2sOne%20Lux%20Stay%20Antwerp%20Diamond%20District!5e0!3m2!1sen!2sus!4v1767847026429!5m2!1sen!2sus"
      : isCityCentre
      ? "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d9995.93421243635!2d4.401490722569857!3d51.21937863595092!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c3f70494fe2e23%3A0x4734b835381669a9!2sOne%20Lux%20Stay%20Antwerp%20City%20Centre!5e0!3m2!1sen!2sus!4v1767847190626!5m2!1sen!2sus"
      : "https://www.google.com/maps?q=Lange+Leemstraat+5,+2018+Antwerpen,+Belgium&output=embed";

    container.innerHTML = `
      <div class="property-header">
        <div class="property-meta">
          <a class="btn btn-back" href="/antwerp" data-link>&larr; Back to listings</a>
          <h1 style="margin:12px 0 6px">${property.title}</h1>
          ${
            property.badge
              ? `<div class="badge" style="margin-bottom:8px">${property.badge}</div>`
              : ""
          }
          <div class="location">${property.location?.area || ""} - ${
      property.address || ""
    }</div>
          <div class="rating" style="margin:8px 0 14px">
            Rating: <span data-header-rating>${property.rating ?? ""}</span>
            <span data-header-count>${
              property.reviews
                ? `(${property.reviews.toLocaleString()} reviews)`
                : ""
            }</span>
          </div>
        </div>
        <div class="contact-card contact-card--top">
          <h3>For Reservation Contact</h3>
          <p class="contact-label">Antwerp reservations</p>
          <div class="contact-actions">
            <a class="contact-phone" href="tel:+32483338745">+32 483 338 745</a>
            <a class="contact-phone" href="tel:+32493813441">+32 493 813 441</a>
            <a class="contact-phone" href="https://wa.me/32493813441?text=Hello%2C%20I%20have%20questions%20about%20the%20unit%20on%20OneLuxStay%20Antwerp%20near%20Central" target="_blank" rel="noopener">
              <span aria-hidden="true">💬</span> WhatsApp
            </a>
          </div>
        </div>
      </div>

      <nav class="property-tabs" aria-label="Property sections">
        <a class="property-tab" href="#section-overview">Overview</a>
        <a class="property-tab" href="#section-facilities">Facilities</a>
        <a class="property-tab" href="#section-rooms">Rooms</a>
        <a class="property-tab" href="#section-reviews">Guest reviews</a>
        <a class="property-tab" href="#section-house-rules">House rules</a>
      </nav>

      <div class="carousel-container">
        <div class="gallery-layout">
          <div class="gallery-block">
            <div class="carousel-main gallery-grid">
              ${
                heroImage
                  ? `<img class="gallery-main" src="${heroImage}" alt="${property.title} image 1" data-index="0">`
                  : ""
              }
              <div class="gallery-side">
                ${
                  sideImageA
                    ? `<img class="gallery-side-img" src="${sideImageA}" alt="${property.title} image 2" data-index="1">`
                    : ""
                }
                ${
                  sideImageB
                    ? `<img class="gallery-side-img" src="${sideImageB}" alt="${property.title} image 3" data-index="2">`
                    : ""
                }
              </div>
            </div>
            <div class="carousel-thumbs">
              ${images
                .map(
                  (img, i) =>
                    `<img src="${img}" alt="Thumb ${
                      i + 1
                    }" data-index="${i}" class="${i === 0 ? "active" : ""}">`
                )
                .join("")}
            </div>
          </div>
          <aside class="gallery-sidebar">
            <div class="review-card" data-review-card>
              <div class="review-score">
                <span class="review-score-label" data-review-card-label>Good</span>
                <span class="review-score-value" data-review-card-rating>${
                  property.rating ?? "9.7"
                }</span>
              </div>
              <p class="review-count" data-review-card-count>${
                property.reviews
                  ? `${property.reviews.toLocaleString()} reviews`
                  : "125 reviews"
              }</p>
              <div class="review-snippet" data-review-card-snippet>
                <p class="review-title">Guests who stayed here loved</p>
                <p class="review-quote">"Property was cozy and spotless. Hosts were responsive and helpful."</p>
                <p class="review-author">Fatima - United States</p>
              </div>
            </div>
            <div class="map-card" aria-label="Location map">
              <iframe
                title="${mapTitle}"
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
                src="${mapSrc}"
              ></iframe>
            </div>
          </aside>
        </div>
      </div>

      <section id="section-overview" class="property-section">
        <div class="price-card">
          <span class="price-label">From</span>
          <span class="price-value">${fmtMoney(
            property.price?.from,
            property.price?.currency
          )}</span>
          <span class="price-note">per night</span>
        </div>

        <div class="selector search-box" data-ols-date-range>
          <div class="selector-dates">
            <label for="checkin">Check-in
              <input type="text" id="checkin" value="${fmtDisplayDate(
                today
              )}" readonly inputmode="none" placeholder="Check-in" data-ols-checkin>
            </label>
            <label for="checkout">Check-out
              <input type="text" id="checkout" value="${fmtDisplayDate(
                tomorrow
              )}" readonly inputmode="none" placeholder="Check-out" data-ols-checkout>
            </label>
          </div>

          <label class="guest-label">Guests
            <select id="guests">${Array.from(
              { length: 6 },
              (_, i) => `<option value="${i + 1}">${i + 1}</option>`
            ).join("")}</select>
          </label>
          <div class="selector-action">
            <button type="button" class="availability-btn">Check Availability</button>
          </div>
        </div>
      </section>

      <section id="section-facilities" class="property-details">
        <div class="property-main">
          <div class="amenities-section">
            <h3>Amenities</h3>
            <div class="amenities-grid">
              ${topAmenities
                .map(
                  (amenity) =>
                    `<div class="amenity-card"><span class="amenity-icon" aria-hidden="true">${amenityIcon(
                      amenity
                    )}</span>${amenity}</div>`
                )
                .join("")}
            </div>
          </div>
          <div class="about-property">
            <h3>About this property</h3>
            <p><strong>Comfortable Accommodations:</strong> ${
              property.summary || ""
            }</p>
            ${
              essentialAmenities
                ? `<p><strong>Essential Facilities:</strong> ${essentialAmenities}.</p>`
                : ""
            }
            ${
              extraAmenities
                ? `<p><strong>Additional Amenities:</strong> ${extraAmenities}.</p>`
                : ""
            }
            <p><strong>Convenient Location:</strong> Located near ${
              property.location?.area || "the city center"
            }, ${
      property.address || "Antwerp"
    }, with easy access to local landmarks and transit.</p>
          </div>
          <div class="popular-facilities">
            <h4>Most popular facilities</h4>
            <div class="facility-list">
              ${popularAmenities
                .map(
                  (amenity) => `<span class="facility-item">${amenity}</span>`
                )
                .join("")}
            </div>
          </div>
        </div>
      </section>

      <section id="section-rooms" class="rooms">
        ${(property.rooms || [])
          .map((room, idx) => {
            const tourJson =
              room.virtualTourJson ||
              room.virtual_tour_json ||
              room.virtualTourUrl ||
              (property.virtualTours && property.virtualTours[idx]?.tourJson) ||
              property.virtualTourJson ||
              "";

            const hasTour = !!tourJson;

            return `
        <div class="room booking-row" data-room-index="${idx}">
          <div class="room-col room-col-type">
            <button 
              type="button" 
              class="room-type room-trigger"
              data-room-index="${idx}"
            >
              ${room.type}
            </button>
            <div class="bedrooms">
              ${(room.bedrooms || [])
                .map(
                  (b) =>
                    `<div class="bedroom-line">Bedroom ${b.bedroom}: ${b.beds}</div>`
                )
                .join("")}
            </div>
          </div>
          <div class="room-col room-col-guests">
            <div class="room-price-label">Guests</div>
            <div class="guest-icons" aria-label="${room.guests} guests">
              ${Array.from(
                { length: Math.min(room.guests || 1, 6) },
                () =>
                  `<span class="guest-icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" role="img" aria-hidden="true">
                      <path d="M8 9a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.5 0-5 1.2-5 3v1h10v-1c0-1.8-2.5-3-5-3z"/>
                    </svg>
                  </span>`
              ).join("")}
            </div>
          </div>
          <div class="room-col room-col-action">
            <div class="room-actions">
              ${
                hasTour
                  ? `<a
                     class="view-unit-btn"
                     href="/360?tour=${encodeURIComponent(tourJson)}"
                     data-link
                   >
                     Virtual Tour
                   </a>`
                  : ""
              }
              <a class="book-btn" href="#"
                 data-room-guests="${room.guests}"
                 data-room-id="${property.id}" 
                 data-guesty-id="${room.guestyid}">
                Book Now
              </a>
            </div>
          </div>
        </div>`;
          })
          .join("")}
      </section>

      <section id="section-reviews" class="reviews-section">
        <h3>Guest reviews</h3>
        <div class="reviews-summary">
          <span class="review-score-label">Good</span>
          <span class="review-score-value" data-reviews-rating>${property.rating ?? "9.7"}</span>
          <span class="review-count" data-reviews-count>${
            property.reviews
              ? `${property.reviews.toLocaleString()} reviews`
              : "125 reviews"
          }</span>
        </div>
        <div class="reviews-list" data-google-reviews-list>
          <div class="review-item">
            <p class="review-quote">"Property was cozy and spotless. Hosts were responsive and helpful."</p>
            <p class="review-author">Fatima - United States</p>
          </div>
        </div>
        <button class="reviews-more" type="button" data-reviews-more>Read more</button>
      </section>

      <section id="section-house-rules" class="house-rules">
        <div class="house-rules-header">
          <h3>House rules</h3>
          <p>Special requests are welcome — add them during your booking.</p>
        </div>
        <div class="house-rules-card">
          <div class="house-rule">
            <div class="rule-label">Check-in</div>
            <div class="rule-detail">
              <div class="rule-time">From 3:00 PM</div>
              <div class="rule-note">Government-issued ID required at check-in.</div>
            </div>
          </div>
          <div class="house-rule">
            <div class="rule-label">Check-out</div>
            <div class="rule-detail">
              <div class="rule-time">Until 11:00 PM</div>
            </div>
          </div>
          <div class="house-rule">
            <div class="rule-label">Age restriction</div>
            <div class="rule-detail">
              <div class="rule-time">Minimum age for check-in is 18</div>
            </div>
          </div>
        </div>
      </section>

      <div class="reviews-modal" id="reviewsModal" aria-hidden="true">
        <div class="reviews-modal-backdrop"></div>
        <div class="reviews-modal-dialog" role="dialog" aria-modal="true">
          <button class="reviews-modal-close" type="button">&times;</button>
          <div class="reviews-modal-content">
            <div class="reviews-modal-header">
              <h3>All reviews</h3>
              <span class="reviews-modal-rating" data-reviews-modal-rating></span>
            </div>
            <div class="reviews-modal-list" id="reviewsModalList"></div>
          </div>
        </div>
      </div>

      <div class="review-modal" id="reviewModal" aria-hidden="true">
        <div class="review-modal-backdrop"></div>
        <div class="review-modal-dialog" role="dialog" aria-modal="true">
          <button class="review-modal-close" type="button">&times;</button>
          <div class="review-modal-content">
            <h3 id="reviewModalTitle">Guest review</h3>
            <p id="reviewModalMeta"></p>
            <p id="reviewModalText"></p>
          </div>
        </div>
      </div>

      <div class="room-modal" id="roomModal" aria-hidden="true">
        <div class="room-modal-backdrop"></div>
        <div class="room-modal-dialog" role="dialog" aria-modal="true">
          <button class="room-modal-close" type="button">&times;</button>

          <div class="room-modal-layout">
            <div class="room-modal-media">
              <div class="room-modal-main">
                <img id="roomModalMainImage" src="" alt="">
              </div>
              <div class="room-modal-thumbs" id="roomModalThumbs"></div>
            </div>

            <div class="room-modal-info">
              <h2 id="roomModalTitle"></h2>
              <div class="room-modal-size" id="roomModalSize"></div>

              <h3 class="room-modal-subtitle">Facilities</h3>
              <ul class="room-modal-facilities" id="roomModalFacilities"></ul>

              <h3 class="room-modal-subtitle">Beds</h3>
              <ul class="room-modal-beds" id="roomModalBeds"></ul>
            </div>
          </div>
        </div>
      </div>
    `;

    initRoomModal(property);

    // ============================
    // live Guesty pricing hook
    // ============================
    async function refreshRoomPrices() {
      const ciEl = container.querySelector("#checkin");
      const coEl = container.querySelector("#checkout");
      const headerPriceEl = container.querySelector(".price");

      if (!ciEl || !coEl) return;
      const checkin = toISODateString(ciEl.value);
      const checkout = toISODateString(coEl.value);
      if (!checkin || !checkout) return;

      let globalMin = null;
      let globalCurrency = property.price?.currency || "EUR";

      const roomEls = Array.from(container.querySelectorAll(".room"));
      const guestsSelect = container.querySelector("#guests");
      const selectedGuests = Number(guestsSelect?.value || 1);
      if (!roomEls.length) return;

      // Group all room-price elements by Guesty listing id
      const byListing = new Map();

      const applyBasePrice = (el) => {
        if (!el) return;
        const base = Number(el.dataset.basePrice);
        const currency = el.dataset.currency || globalCurrency;
        if (Number.isFinite(base) && base > 0) {
          el.textContent = `Starts at: ${fmtMoney(base, currency)}`;
        } else {
          el.textContent = "Price on request";
        }
      };

      for (const roomEl of roomEls) {
        const bookBtn = roomEl.querySelector(".book-btn[data-guesty-id]");
        const priceEl = roomEl.querySelector(".room-price");
        const nightlyEl = roomEl.querySelector("[data-nightly-breakdown]");
        const guestyId = bookBtn?.dataset.guestyId;

        if (!guestyId || !priceEl) continue;

        applyBasePrice(priceEl);

        if (!byListing.has(guestyId)) {
          byListing.set(guestyId, []);
        }
        byListing.get(guestyId).push({ priceEl, nightlyEl });
      }

      // Call Netlify func once per Guesty listing id
      for (const [guestyId, slots] of byListing.entries()) {
        let nightlyBreakdown = [];
        let nightlyCurrency = null;
        let nightlySubtotal = null;
        try {
          const res = await fetchGuestyPricing(guestyId, checkin, checkout);
          const nightlyQuote = await fetchGuestyNightlyQuote(
            guestyId,
            checkin,
            checkout,
            selectedGuests
          );

          if (!res) {
            slots.forEach(({ priceEl: el, nightlyEl }) => {
              applyBasePrice(el);
              if (nightlyEl) nightlyEl.textContent = "";
            });
            continue;
          }

          const { avgPerNight, currency, totalPrice, nights } = res;
          globalCurrency = currency || globalCurrency;
          const effectiveAvg =
            typeof avgPerNight === "number" && !Number.isNaN(avgPerNight)
              ? avgPerNight
              : nights && totalPrice != null
              ? totalPrice / nights
              : null;

          nightlyBreakdown = nightlyQuote?.nightly || [];
          nightlyCurrency =
            nightlyBreakdown[0]?.currency || nightlyQuote?.currency || currency;
          nightlySubtotal = nightlyBreakdown.reduce(
            (sum, night) =>
              sum + (Number(night.price) || Number(night.basePrice) || 0),
            0
          );

          const derivedTotal =
            nightlyBreakdown.length > 0 ? nightlySubtotal : totalPrice;
          const displayCurrency = nightlyBreakdown.length
            ? nightlyCurrency
            : currency;

          if (derivedTotal != null) {
            const nightsLabel =
              (nightlyBreakdown.length || nights) > 0
                ? ` for ${nightlyBreakdown.length || nights} night${
                    (nightlyBreakdown.length || nights) > 1 ? "s" : ""
                  }`
                : "";
            slots.forEach(({ priceEl: el }) => {
              if (!el) return;
              el.textContent = `${fmtMoney(
                derivedTotal,
                displayCurrency
              )} total${nightsLabel}`;
            });
          } else if (effectiveAvg != null) {
            slots.forEach(({ priceEl: el }) => {
              if (!el) return;
              el.textContent = `Starts at: ${fmtMoney(
                effectiveAvg,
                displayCurrency
              )} per night`;
            });
          } else {
            slots.forEach(({ priceEl: el }) => {
              if (!el) return;
              el.textContent = "Price on request";
            });
          }

          if (
            effectiveAvg != null &&
            (globalMin == null || effectiveAvg < globalMin)
          ) {
            globalMin = effectiveAvg;
          }

          if (headerPriceEl && globalMin != null) {
            headerPriceEl.textContent = `From ${fmtMoney(
              globalMin,
              globalCurrency
            )}`;
          }
        } catch (err) {
          console.warn("Guesty price error for listing", guestyId, err);
          slots.forEach(({ priceEl: el, nightlyEl }) => {
            applyBasePrice(el);
            if (nightlyEl) nightlyEl.textContent = "";
          });
          continue;
        }

        slots.forEach(({ nightlyEl }) => {
          if (!nightlyEl) return;
          if (!nightlyBreakdown.length) {
            nightlyEl.textContent = "";
            return;
          }
          const items = nightlyBreakdown
            .map(
              (night) =>
                `<li>${new Date(night.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}: ${fmtMoney(
                  Number(night.price) || Number(night.basePrice) || 0,
                  nightlyCurrency
                )}</li>`
            )
            .join("");
          const subtotalText =
            nightlySubtotal != null
              ? `<div class="room-nightly-total">Subtotal: ${fmtMoney(
                  nightlySubtotal,
                  nightlyCurrency
                )}</div>`
              : "";
          nightlyEl.innerHTML = `<strong>Nightly</strong><ul>${items}</ul>${subtotalText}`;
        });
      }
    }

    const ciInput = container.querySelector("#checkin");
    const coInput = container.querySelector("#checkout");
    const guestsInput = container.querySelector("#guests");
    ciInput?.addEventListener("change", refreshRoomPrices);
    coInput?.addEventListener("change", refreshRoomPrices);
    guestsInput?.addEventListener("change", refreshRoomPrices);

    window.initOLSDatePicker?.();
    refreshRoomPrices();

    const mainImgs = container.querySelectorAll(".carousel-main img");
    const thumbs = container.querySelectorAll(".carousel-thumbs img");
    const thumbsContainer = container.querySelector(".carousel-thumbs");
    const galleryMain = container.querySelector(".gallery-main");
    const gallerySide = container.querySelectorAll(".gallery-side-img");
    thumbs.forEach((t) =>
      t.addEventListener("click", (e) => {
        const i = Number(e.currentTarget.dataset.index);
        if (galleryMain && images.length) {
          const mainSrc = images[i] || images[0] || "";
          const sideA = images[i + 1] || images[0] || "";
          const sideB = images[i + 2] || images[1] || images[0] || "";
          if (mainSrc) {
            galleryMain.src = mainSrc;
            galleryMain.dataset.index = String(i);
          }
          if (gallerySide[0] && sideA) {
            gallerySide[0].src = sideA;
            gallerySide[0].dataset.index = String((i + 1) % images.length);
          }
          if (gallerySide[1] && sideB) {
            gallerySide[1].src = sideB;
            gallerySide[1].dataset.index = String((i + 2) % images.length);
          }
        } else {
          mainImgs[i]?.scrollIntoView({ behavior: "smooth", inline: "center" });
        }
        thumbs.forEach((x) => x.classList.remove("active"));
        e.currentTarget.classList.add("active");
      })
    );

    if (thumbsContainer) {
      let hoverRaf = null;
      thumbsContainer.addEventListener("mousemove", (e) => {
        if (thumbsContainer.scrollWidth <= thumbsContainer.clientWidth) return;
        const rect = thumbsContainer.getBoundingClientRect();
        const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        const ratio = rect.width ? x / rect.width : 0;
        const maxScroll = thumbsContainer.scrollWidth - thumbsContainer.clientWidth;
        const target = maxScroll * ratio;
        if (hoverRaf) cancelAnimationFrame(hoverRaf);
        hoverRaf = requestAnimationFrame(() => {
          thumbsContainer.scrollLeft = target;
        });
      });
      thumbsContainer.addEventListener("mouseleave", () => {
        if (hoverRaf) cancelAnimationFrame(hoverRaf);
        hoverRaf = null;
      });
    }

    container.querySelectorAll(".book-btn[data-room-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const roomGuests = container.querySelector("#guests")?.value || "";
        const roomId = btn.dataset.guestyId;
        const checkin = toISODateString(
          container.querySelector("#checkin")?.value || ""
        );
        const checkout = toISODateString(
          container.querySelector("#checkout")?.value || ""
        );

        const url =
          `https://reservations.oneluxstay.com/en/properties/${encodeURIComponent(
            roomId
          )}` +
          `?minOccupancy=${encodeURIComponent(roomGuests)}` +
          (checkin && checkout
            ? `&checkIn=${encodeURIComponent(
                checkin
              )}&checkOut=${encodeURIComponent(checkout)}`
            : "");

        window.location.href = url;
      });
    });

    window.ensureFeather?.();
    window.initScrollAnimations?.();
    if (typeof window.__nav_refreshHero === "function")
      window.__nav_refreshHero();

    if (localReviewsUrl) {
      loadLocalReviews(localReviewsUrl);
    }
    if (googleReviewsPlaceId) {
      loadGoogleReviews(googleReviewsPlaceId);
    }

    const reviewsModal = document.getElementById("reviewsModal");
    const reviewsModalBackdrop = reviewsModal?.querySelector(
      ".reviews-modal-backdrop"
    );
    const reviewsModalClose = reviewsModal?.querySelector(
      ".reviews-modal-close"
    );
    const reviewsModalList = reviewsModal?.querySelector("#reviewsModalList");
    const reviewsMoreBtn = container.querySelector("[data-reviews-more]");

    const reviewModal = document.getElementById("reviewModal");
    const reviewModalBackdrop = reviewModal?.querySelector(
      ".review-modal-backdrop"
    );
    const reviewModalClose = reviewModal?.querySelector(".review-modal-close");
    const reviewModalTitle = reviewModal?.querySelector("#reviewModalTitle");
    const reviewModalMeta = reviewModal?.querySelector("#reviewModalMeta");
    const reviewModalText = reviewModal?.querySelector("#reviewModalText");

    function openReviewModal(review) {
      if (!reviewModal) return;
      if (reviewModalTitle) reviewModalTitle.textContent = "Guest review";
      if (reviewModalMeta)
        reviewModalMeta.textContent = `${review.author_name || "Guest"}${
          review.relative_time_description
            ? ` • ${review.relative_time_description}`
            : ""
        }`;
      if (reviewModalText) reviewModalText.textContent = review.text || "";
      reviewModal.classList.add("open");
      reviewModal.setAttribute("aria-hidden", "false");
    }

    function closeReviewModal() {
      if (!reviewModal) return;
      reviewModal.classList.remove("open");
      reviewModal.setAttribute("aria-hidden", "true");
    }

    function openReviewsModal(payload) {
      if (!reviewsModal || !reviewsModalList) return;
      const formatRating = (value) => {
        if (!value) return null;
        const str = String(value);
        return str.includes("/") ? str : `${str}/5`;
      };
      const reviews = payload?.reviews || [];
      const normalized = reviews
        .map((review) => ({
          author_name: review.author_name || "Guest",
          relative_time_description: review.relative_time_description || "",
          rating: review.rating || null,
          text: review.text || "",
        }))
        .filter((review) => review.text);

      const modalRatingEl = reviewsModal.querySelector(
        "[data-reviews-modal-rating]"
      );
      if (modalRatingEl) {
        const rating = formatRating(payload?.rating);
        modalRatingEl.textContent = rating ? `Overall ${rating}` : "Overall 5/5";
      }

      reviewsModalList.innerHTML = normalized
        .map(
          (review) => `
            <div class="review-item">
              ${
                review.rating
                  ? `<span class="review-rating">${formatRating(
                      review.rating
                    )}</span>`
                  : ""
              }
              <p class="review-quote">"${review.text}"</p>
              <p class="review-author">${review.author_name}${
            review.relative_time_description
              ? ` • ${review.relative_time_description}`
              : ""
          }</p>
            </div>
          `
        )
        .join("");

      reviewsModal.classList.add("open");
      reviewsModal.setAttribute("aria-hidden", "false");
    }

    function closeReviewsModal() {
      if (!reviewsModal) return;
      reviewsModal.classList.remove("open");
      reviewsModal.setAttribute("aria-hidden", "true");
    }

    reviewModalBackdrop?.addEventListener("click", closeReviewModal);
    reviewModalClose?.addEventListener("click", closeReviewModal);
    reviewsModalBackdrop?.addEventListener("click", closeReviewsModal);
    reviewsModalClose?.addEventListener("click", closeReviewsModal);
    if (reviewsMoreBtn && !reviewsMoreBtn.__olsBound) {
      reviewsMoreBtn.__olsBound = true;
      reviewsMoreBtn.addEventListener("click", () => {
        if (reviewsForModal) openReviewsModal(reviewsForModal);
      });
    }

    function startReviewSlideshow(reviews, listEl) {
      if (!listEl) return;
      if (listEl.__olsReviewTimer) {
        clearInterval(listEl.__olsReviewTimer);
      }

      const normalized = (reviews || [])
        .map((review) => ({
          author_name: review.author_name || "Guest",
          relative_time_description: review.relative_time_description || "",
          text: review.text || "",
        }))
        .filter((review) => review.text);

      if (!normalized.length) return;

      let index = 0;

      const renderReview = (idx) => {
        const review = normalized[idx];
        listEl.innerHTML = `
          <div class="review-item">
            <p class="review-quote">"${review.text}"</p>
            <p class="review-author">${review.author_name}${
          review.relative_time_description
            ? ` • ${review.relative_time_description}`
            : ""
        }</p>
          </div>
        `;
      };

      renderReview(index);

      listEl.__olsReviewTimer = setInterval(() => {
        const item = listEl.querySelector(".review-item");
        if (item) item.classList.add("is-fading");
        setTimeout(() => {
          index = (index + 1) % normalized.length;
          renderReview(index);
        }, 300);
      }, 6000);
    }

    function renderReviewsList(reviews, listEl, limit) {
      if (!listEl) return;
      const normalized = (reviews || [])
        .map((review) => ({
          author_name: review.author_name || "Guest",
          relative_time_description: review.relative_time_description || "",
          text: review.text || "",
        }))
        .filter((review) => review.text);

      const slice = normalized.slice(0, limit);
      listEl.innerHTML = slice
        .map(
          (review) => `
            <div class="review-item">
              <p class="review-quote">"${review.text}"</p>
              <p class="review-author">${review.author_name}${
            review.relative_time_description
              ? ` • ${review.relative_time_description}`
              : ""
          }</p>
            </div>
          `
        )
        .join("");
    }

    function startSidebarReviewSlideshow(reviews, snippetEl, cardEl) {
      if (!snippetEl) return;
      if (snippetEl.__olsReviewTimer) {
        clearInterval(snippetEl.__olsReviewTimer);
      }

      const normalized = (reviews || [])
        .map((review) => ({
          author_name: review.author_name || "Guest",
          relative_time_description: review.relative_time_description || "",
          text: review.text || "",
        }))
        .filter((review) => review.text);

      if (!normalized.length) return;

      let index = 0;
      let isPaused = false;

      const renderReview = (idx) => {
        const review = normalized[idx];
        const needsMore = review.text.length > 220;
        snippetEl.innerHTML = `
          <p class="review-title">Guests who stayed here loved</p>
          <p class="review-quote">"${review.text}"</p>
          <p class="review-author">${review.author_name}${
          review.relative_time_description
            ? ` • ${review.relative_time_description}`
            : ""
        }</p>
          ${
            needsMore
              ? `<button class="review-more" type="button" data-review-index="${idx}">Read more</button>`
              : ""
          }
        `;
      };

      renderReview(index);

      const tick = () => {
        if (isPaused) return;
        snippetEl.classList.add("is-fading");
        setTimeout(() => {
          if (isPaused) return;
          index = (index + 1) % normalized.length;
          renderReview(index);
          snippetEl.classList.remove("is-fading");
        }, 300);
      };

      snippetEl.__olsReviewTimer = setInterval(tick, 6000);

      if (cardEl && !cardEl.__olsHoverBound) {
        cardEl.__olsHoverBound = true;
        cardEl.addEventListener("mouseenter", () => {
          isPaused = true;
        });
        cardEl.addEventListener("mouseleave", () => {
          isPaused = false;
        });
      }

      if (!snippetEl.__olsMoreBound) {
        snippetEl.__olsMoreBound = true;
        snippetEl.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-review-index]");
          if (!btn) return;
          const idx = Number(btn.dataset.reviewIndex || 0);
          const review = normalized[idx];
          openReviewModal(review);
        });
      }
    }

    const formatRatingValue = (value) => {
      if (!value) return null;
      const str = String(value);
      return str.includes("/") ? str : `${str}/5`;
    };

    async function loadGoogleReviews(placeId) {
      const reviewsSection = container.querySelector(
        "#section-reviews"
      );
      if (!reviewsSection) return;

      const headerRatingEl = container.querySelector("[data-header-rating]");
      const headerCountEl = container.querySelector("[data-header-count]");
      const ratingEl = reviewsSection.querySelector("[data-reviews-rating]");
      const countEl = reviewsSection.querySelector("[data-reviews-count]");
      const listEl = reviewsSection.querySelector("[data-google-reviews-list]");
      const cardEl = container.querySelector("[data-review-card]");
      const cardRatingEl = cardEl?.querySelector("[data-review-card-rating]");
      const cardCountEl = cardEl?.querySelector("[data-review-card-count]");
      const cardLabelEl = cardEl?.querySelector("[data-review-card-label]");
      const cardSnippetEl = cardEl?.querySelector("[data-review-card-snippet]");
      if (!listEl) return;

      try {
        const baseUrl =
          window.OLS_GOOGLE_REVIEWS_ENDPOINT ||
          "/.netlify/functions/get-google-reviews";
        const res = await fetch(
          `${baseUrl}?placeId=${encodeURIComponent(placeId)}`
        );
        if (!res.ok) return;
        const data = await res.json();

        const displayRating = formatRatingValue(data.rating);
        const totalReviews = Number(data.total || 0);

        if (displayRating && ratingEl) {
          ratingEl.textContent = displayRating;
        }
        if (totalReviews && countEl) {
          countEl.textContent = `${totalReviews.toLocaleString()} reviews`;
        }
        if (displayRating && cardRatingEl) {
          cardRatingEl.textContent = displayRating;
        }
        if (totalReviews && cardCountEl) {
          cardCountEl.textContent = `${totalReviews.toLocaleString()} reviews`;
        }
        if (displayRating && headerRatingEl) {
          headerRatingEl.textContent = displayRating;
        }
        if (headerCountEl) {
          headerCountEl.textContent = totalReviews
            ? `(${totalReviews.toLocaleString()} reviews)`
            : "";
        }
        if (cardLabelEl) {
          cardLabelEl.textContent = "Excellent";
        }

        if (Array.isArray(data.reviews) && data.reviews.length) {
          const rating = displayRating ? data.rating : null;
          reviewsForModal = { reviews: data.reviews, rating };
          renderReviewsList(data.reviews, listEl, 5);
          if (reviewsMoreBtn) {
            reviewsMoreBtn.style.display =
              data.reviews.length > 5 ? "inline-flex" : "none";
          }
          if (cardSnippetEl) {
            startSidebarReviewSlideshow(data.reviews, cardSnippetEl, cardEl);
          }
        }
      } catch (err) {
        // Keep fallback copy if the API call fails.
      }
    }

    async function loadLocalReviews(url) {
      const reviewsSection = container.querySelector("#section-reviews");
      if (!reviewsSection) return;

      const headerRatingEl = container.querySelector("[data-header-rating]");
      const headerCountEl = container.querySelector("[data-header-count]");
      const ratingEl = reviewsSection.querySelector("[data-reviews-rating]");
      const countEl = reviewsSection.querySelector("[data-reviews-count]");
      const labelEl = reviewsSection.querySelector(".review-score-label");
      const listEl = reviewsSection.querySelector("[data-google-reviews-list]");
      const cardEl = container.querySelector("[data-review-card]");
      const cardRatingEl = cardEl?.querySelector("[data-review-card-rating]");
      const cardCountEl = cardEl?.querySelector("[data-review-card-count]");
      const cardLabelEl = cardEl?.querySelector("[data-review-card-label]");
      const cardSnippetEl = cardEl?.querySelector("[data-review-card-snippet]");
      if (!listEl) return;

      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        const numericRatings = Array.isArray(data.reviews)
          ? data.reviews
              .map((review) => Number(review.rating))
              .filter((value) => Number.isFinite(value))
          : [];
        const avg =
          numericRatings.length > 0
            ? (
                numericRatings.reduce((sum, value) => sum + value, 0) /
                numericRatings.length
              ).toFixed(1)
            : data.rating || null;
        const displayRating = formatRatingValue(avg || data.rating || "5");
        const totalReviews = Number(
          data.total || (data.reviews ? data.reviews.length : 0)
        );

        if (ratingEl) {
          ratingEl.textContent = displayRating || "5/5";
        }
        if (labelEl) {
          labelEl.textContent = "Excellent";
        }
        if (countEl && totalReviews) {
          countEl.textContent = `${totalReviews.toLocaleString()} reviews`;
        }
        if (cardRatingEl) {
          cardRatingEl.textContent = displayRating || "5/5";
        }
        if (cardLabelEl) {
          cardLabelEl.textContent = "Excellent";
        }
        if (cardCountEl && totalReviews) {
          cardCountEl.textContent = `${totalReviews.toLocaleString()} reviews`;
        }
        if (headerRatingEl) {
          headerRatingEl.textContent = displayRating || "5/5";
        }
        if (headerCountEl) {
          headerCountEl.textContent = totalReviews
            ? `(${totalReviews.toLocaleString()} reviews)`
            : "";
        }

        if (Array.isArray(data.reviews) && data.reviews.length) {
          reviewsForModal = { reviews: data.reviews, rating: avg };
          renderReviewsList(data.reviews, listEl, 5);
          if (reviewsMoreBtn) {
            reviewsMoreBtn.style.display =
              data.reviews.length > 5 ? "inline-flex" : "none";
          }
          if (cardSnippetEl) {
            startSidebarReviewSlideshow(data.reviews, cardSnippetEl, cardEl);
          }
        }
      } catch (err) {
        // Keep fallback copy if the local file fails.
      }
    }
  }

  function initRoomModal(property) {
    const modal = document.getElementById("roomModal");
    if (!modal) return;

    const backdrop = modal.querySelector(".room-modal-backdrop");
    const closeBtn = modal.querySelector(".room-modal-close");

    const mainImg = document.getElementById("roomModalMainImage");
    const thumbsEl = document.getElementById("roomModalThumbs");
    const titleEl = document.getElementById("roomModalTitle");
    const sizeEl = document.getElementById("roomModalSize");
    const facilitiesEl = document.getElementById("roomModalFacilities");
    const bedsEl = document.getElementById("roomModalBeds");

    const triggers = document.querySelectorAll(".room-trigger");

    function openRoom(room) {
      titleEl.textContent = `${room.type} (${room.guests} guests)`;
      sizeEl.textContent = room.size ? `Size: ${room.size}` : "";
      const allAmenities = [
        ...(property.amenities || []),
        ...(property.facilities || []),
        ...(room.amenities || []),
        ...(room.facilities || []),
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item) => !/^(apartment|apartments)$/i.test(item));

      const imgs =
        (Array.isArray(room.images) && room.images.length
          ? room.images
          : Array.isArray(property.images)
          ? property.images
          : []) || [];

      if (imgs.length) {
        mainImg.src = imgs[0];
        mainImg.alt = `${room.type}  ${property.title}`;
        thumbsEl.innerHTML = imgs
          .map(
            (src, i) =>
              `<img 
              src="${src}" 
              data-index="${i}" 
              class="${i === 0 ? "active" : ""}"
              alt="${room.type} photo ${i + 1}"
            >`
          )
          .join("");
      } else {
        mainImg.src = "";
        mainImg.alt = "";
        thumbsEl.innerHTML = "";
      }

      bedsEl.innerHTML = (room.bedrooms || [])
        .map((b) => `<li>Bedroom ${b.bedroom}: ${b.beds}</li>`)
        .join("");

      facilitiesEl.innerHTML = allAmenities.map((a) => `<li>${a}</li>`).join("");

      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }

    triggers.forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.roomIndex);
        const room = (property.rooms || [])[idx];
        if (room) openRoom(room);
      });
    });

    function closeModal() {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }

    backdrop.addEventListener("click", closeModal);
    closeBtn.addEventListener("click", closeModal);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    thumbsEl.addEventListener("click", (e) => {
      const img = e.target.closest("img[data-index]");
      if (!img) return;
      const all = [...thumbsEl.querySelectorAll("img")];
      all.forEach((el) => el.classList.remove("active"));
      img.classList.add("active");
      mainImg.src = img.src;
    });
  }

  if (!propertyId) {
    notFound("Missing property id.");
    return;
  }

  container.innerHTML = '<p style="padding:16px">Loading</p>';

  Promise.all(
    propsUrls.map((u) =>
      fetch(u, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`Failed to load ${u}: ${r.status}`);
          return r.json();
        })
        .catch((err) => {
          console.error("Failed to load", u, err);
          return null;
        })
    )
  )
    .then((jsons) => {
      const list = jsons
        .filter(Boolean)
        .flatMap((json) =>
          Array.isArray(json?.properties) ? json.properties : []
        );
      const prop = list.find((p) => p.id === propertyId);
      if (!prop) return notFound(`No property with id "${propertyId}".`);
      render(prop, list);
    })
    .catch((err) => {
      console.error(err);
      notFound("Failed to load property data.");
    });
}

/* ==========================================
   Listings utils (global, idempotent)
   ========================================== */
(function () {
  if (window.normalizeProperties) return;

  function computeAntwerpAreaSlug(city, neighborhood, areaLabel) {
    const isAntwerp = (city || "").toLowerCase().includes("antwerp");
    if (!isAntwerp) return "";
    const text = `${neighborhood || ""} ${areaLabel || ""}`.toLowerCase();
    if (text.includes("diamond")) return "diamond";
    if (text.includes("fashion") || text.includes("mode")) return "fashion";
    if (
      text.includes("historic") ||
      text.includes("centre") ||
      text.includes("center")
    )
      return "centre";
    if (text.includes("central")) return "central";
    return "centre";
  }

  function inferCurrency(city) {
    const c = (city || "").toLowerCase();
    if (c.includes("dubai")) return "AED";
    if (
      c.includes("miami") ||
      c.includes("los angeles") ||
      c.includes("redondo")
    )
      return "USD";
    return "EUR";
  }

  window.currencySymbol = function currencySymbol(code) {
    switch ((code || "EUR").toUpperCase()) {
      case "USD":
        return "$";
      case "AED":
        return "AED ";
      case "EUR":
        return "EUR ";
      case "GBP":
        return "GBP ";
      default:
        return code ? code.toUpperCase() + " " : "";
    }
  };

  function mapItem(it) {
    if (!it) return null;
    const title = it.title || it.name || "";
    const city = it.location?.city || "";
    const neighborhood = it.location?.neighborhood || it.district || "";
    const areaLabel = it.location?.area || it.area || "";
    const area = computeAntwerpAreaSlug(city, neighborhood, areaLabel);
    const price_from = it.price?.from ?? it.price_from ?? null;
    const currency = it.price?.currency || it.currency || inferCurrency(city);
    const district =
      city.toLowerCase() === "antwerp"
        ? neighborhood || "Antwerp City Centre"
        : city || "-";

    return {
      id: it.id || title.toLowerCase().replace(/\s+/g, "-"),
      name: title,
      district,
      city,
      area,
      rating: it.rating ?? 0,
      reviews: it.reviews ?? 0,
      distance_km: it.distance_km ?? null,
      stars: it.stars ?? null,
      description: it.summary || it.description || "",
      amenities: it.amenities || [],
      price_from,
      currency,
      images: it.images || [],
      url: it.booking_url || it.url || "#",
      __raw: it,
    };
  }

  window.normalizeProperties = function normalizeProperties(json) {
    const arr = Array.isArray(json) ? json : json.properties || [];
    return arr.map(mapItem).filter(Boolean);
  };
})();

window.initPropertyDetailPageAntwerp = initPropertyDetailPageAntwerp;
