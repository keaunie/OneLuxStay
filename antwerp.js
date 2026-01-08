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
      if (/(washing|laundry)/i.test(name)) {
        return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="4" width="10" height="10" rx="2"/><circle cx="8" cy="9" r="3"/><path d="M5 6h2"/></svg>';
      }
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/></svg>';
    };

    const isFashionDistrict =
      (property.id || "").includes("fashion") ||
      /fashion/i.test(property.title || "") ||
      /fashion/i.test(property.location?.neighborhood || "");
    const mapTitle = isFashionDistrict
      ? "One Lux Stay Antwerp Fashion District map"
      : "Lange Leemstraat 5, Antwerpen map";
    const mapSrc = isFashionDistrict
      ? "https://www.google.com/maps?q=One+Lux+Stay+Antwerp+Fashion+District&output=embed&z=15"
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
            Rating: <span>${property.rating ?? ""}</span>
            ${
              property.reviews
                ? `(${property.reviews.toLocaleString()} reviews)`
                : ""
            }
          </div>
        </div>
        <div class="contact-card contact-card--top">
          <h3>For Reservation Contact</h3>
          <p class="contact-label">Antwerp reservations</p>
          <div class="contact-actions">
            <a class="contact-phone" href="tel:+32483338745">+32 483 338 745</a>
            <a class="contact-phone" href="tel:+32493813441">+32 493 813 441</a>
            <a class="contact-phone" href="https://wa.me/32493813441?text=Hello%2C%20I%20have%20questions%20about%20the%20unit%20on%20OneLuxStay%20Antwerp%20near%20Central" target="_blank" rel="noopener">
              <span aria-hidden="true">💬</span> WhatsApp: +32 493 813 441
            </a>
          </div>
        </div>
      </div>

      <nav class="property-tabs" aria-label="Property sections">
        <a class="property-tab" href="#section-overview">Overview</a>
        <a class="property-tab" href="#section-facilities">Facilities</a>
        <a class="property-tab" href="#section-rooms">Rooms</a>
        <a class="property-tab" href="#section-reviews">Guest reviews</a>
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
            <div class="review-card">
              <div class="review-score">
                <span class="review-score-label">Good</span>
                <span class="review-score-value">${
                  property.rating ?? "9.7"
                }</span>
              </div>
              <p class="review-count">${
                property.reviews
                  ? `${property.reviews.toLocaleString()} reviews`
                  : "125 reviews"
              }</p>
              <div class="review-snippet">
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
        <div class="summary">${property.summary || ""}</div>
        <div class="price">From ${fmtMoney(
          property.price?.from,
          property.price?.currency
        )}</div>

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
            <div class="room-guests">${room.guests} guests</div>
            <div class="bedrooms">
              ${(room.bedrooms || [])
                .map(
                  (b) =>
                    `<div class="bedroom-line">Bedroom ${b.bedroom}: ${b.beds}</div>`
                )
                .join("")}
            </div>
            ${(() => {
              const amenities = room.amenities || property.amenities || [];
              if (!amenities.length) return "";
              const chips = amenities.slice(0, 6);
              const rest = amenities.slice(6);
              return `
                <div class="amenity-chips">
                  ${chips
                    .map((a) => `<span class="amenity-chip">${a}</span>`)
                    .join("")}
                </div>
                ${
                  rest.length
                    ? `<ul class="amenity-list">
                        ${rest
                          .map((a) => `<li class="amenity-item">${a}</li>`)
                          .join("")}
                      </ul>`
                    : ""
                }
              `;
            })()}
          </div>
          <div class="room-col room-col-price">
            <div class="room-price-label">Price per night</div>
            <div class="room-price"
              data-base-price="${room.price_per_night ?? ""}"
              data-currency="${property.price?.currency || "EUR"}">
              ${fmtMoney(room.price_per_night, property.price?.currency)}
            </div>
            <div class="room-nightly" data-nightly-breakdown></div>
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
                     View Unit
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
          <span class="review-score-value">${property.rating ?? "9.7"}</span>
          <span class="review-count">${
            property.reviews
              ? `${property.reviews.toLocaleString()} reviews`
              : "125 reviews"
          }</span>
        </div>
        <p class="review-quote">"Property was cozy and spotless. Hosts were responsive and helpful."</p>
        <p class="review-author">Fatima - United States</p>
      </section>

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
              <div class="room-modal-price" id="roomModalPrice"></div>

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
    const priceEl = document.getElementById("roomModalPrice");
    const facilitiesEl = document.getElementById("roomModalFacilities");
    const bedsEl = document.getElementById("roomModalBeds");

    const triggers = document.querySelectorAll(".room-trigger");

    function openRoom(room) {
      titleEl.textContent = `${room.type} (${room.guests} guests)`;
      sizeEl.textContent = room.size ? `Size: ${room.size}` : "";
      priceEl.textContent = room.price_per_night
        ? `From ${fmtMoney(
            room.price_per_night,
            property.price?.currency
          )} per night`
        : "";

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

      facilitiesEl.innerHTML = (room.amenities || [])
        .map((a) => `<li>${a}</li>`)
        .join("");

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
