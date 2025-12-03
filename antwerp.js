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
    const res = await fetch(`/.netlify/functions/get-pricing?${qs}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("Guesty pricing HTTP error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.days) || !data.days.length) return null;

    const nights = data.days.length;
    const currency = data.days[0]?.currency || "EUR";
    const sum = data.days.reduce((acc, d) => acc + (Number(d.price) || 0), 0);
    const avgPerNight = nights > 0 ? sum / nights : null;

    return {
      nights,
      avgPerNight,
      currency,
      days: data.days,
    };
  } catch (err) {
    console.warn("Error calling Guesty pricing function:", err);
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

  // 👉 filters.cities for location chips
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
    return typeof x === "number" && x > 0 ? x.toFixed(1) : "—";
  }
  function fmtReviews(x) {
    return typeof x === "number" ? x.toLocaleString() : "0";
  }
  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // 👉 build location chips from state.all
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
        p.area ? ` • ${escapeHtml(cap(p.area || ""))}` : ""
      }${p.distance_km ? ` • ${p.distance_km} km from center` : ""}</div>

          <div class="badges">
            <span class="badge score" title="Guest score">${fmtScore(
              p.rating
            )}</span>
            <span class="badge" title="Reviews">${fmtReviews(
              p.reviews
            )} reviews</span>
            ${
              p.stars
                ? `<span class="badge" title="Star rating">${"★".repeat(
                    p.stars
                  )}${"☆".repeat(Math.max(0, 5 - p.stars))}</span>`
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
            ${
              p.price_from
                ? `<div class="price">From ${currencySymbol(
                    p.currency
                  )}${p.price_from.toLocaleString()} / night</div>`
                : `<div class="price ghost">Price available on request</div>`
            }
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
            state.filters.cities.delete(key);
          } else {
            chip.classList.add("active");
            chip.setAttribute("aria-pressed", "true");
            state.filters.cities.add(key);
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
      state.filters.cities.clear();
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
            "→ cities:",
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
  const fmtMoney = (amount, ccy = "EUR") =>
    `${currencySymbol(ccy)}${Number(amount || 0).toLocaleString()}`;

  function notFound(msg = "Property not found.") {
    container.innerHTML = `<p style="padding:16px">${msg} <a href="/properties-antwerp" data-link>Back to listings</a></p>`;
  }

  function render(property, all) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    document.title = `${property.title} — One Lux Stay`;

    container.innerHTML = `
      <a class="btn" href="/antwerp" style="color: black;" data-link>&larr; Back to listings</a>
      <h1 style="margin:12px 0 6px">${property.title}</h1>
      ${
        property.badge
          ? `<div class="badge" style="margin-bottom:8px">${property.badge}</div>`
          : ""
      }
      <div class="location">${property.location?.area || ""} • ${
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

      <div class="carousel-container">
        <div class="carousel-main">
          ${(property.images || [])
            .map(
              (img, i) =>
                `<img src="${img}" alt="${property.title} image ${
                  i + 1
                }" data-index="${i}">`
            )
            .join("")}
        </div>
        <div class="carousel-thumbs">
          ${(property.images || [])
            .map(
              (img, i) =>
                `<img src="${img}" alt="Thumb ${
                  i + 1
                }" data-index="${i}" class="${i === 0 ? "active" : ""}">`
            )
            .join("")}
        </div>
      </div>

      <div class="summary">${property.summary || ""}</div>
      <div class="price">From ${fmtMoney(
        property.price?.from,
        property.price?.currency
      )}</div>

      <div class="selector">
        <label>Dates
          <button type="button" id="dateRangeBtn" style="height:38px;padding:0 12px;border:1px solid #ccc;border-radius:6px;cursor:pointer;background:#fff">
            <span id="dateRangeText">Select dates</span>
          </button>
        </label>

        <input type="date" id="checkin"
               value="${fmtDate(today)}"
               min="${fmtDate(today)}"
               style="position:absolute;opacity:0;width:0;height:0;pointer-events:none">
        <input type="date" id="checkout"
               value="${fmtDate(tomorrow)}"
               min="${fmtDate(tomorrow)}"
               style="position:absolute;opacity:0;width:0;height:0;pointer-events:none">

        <label>Guests
          <select id="guests">${Array.from(
            { length: 6 },
            (_, i) => `<option value="${i + 1}">${i + 1}</option>`
          ).join("")}</select>
        </label>
      </div>

      <div class="rooms">
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
        <div class="room" data-room-index="${idx}">
          <div class="room-header">
            <button 
              type="button" 
              class="room-type room-trigger"
              data-room-index="${idx}"
            >
              ${room.type} (${room.guests} guests)
            </button>
            <div class="room-price">
              Starts at: ${fmtMoney(
                room.price_per_night,
                property.price?.currency
              )}
            </div>
          </div>
          <div class="bedrooms">
            ${(room.bedrooms || [])
              .map((b) => `Bedroom ${b.bedroom}: ${b.beds}`)
              .join(", ")}
          </div>

          <div class="room-actions">
            <a class="book-btn" href="#"
               data-room-guests="${room.guests}"
               data-room-id="${property.id}" 
               data-guesty-id="${room.guestyid}">
              Book Now
            </a>

            ${
              hasTour
                ? `<a
                   class="view-unit-btn"
                   href="/360?tour=${encodeURIComponent(tourJson)}"
                   data-link
                 >
                   View Unit (Virtual Tour)
                 </a>`
                : ""
            }
          </div>
        </div>`;
          })
          .join("")}
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
      const checkin = ciEl.value;
      const checkout = coEl.value;
      if (!checkin || !checkout) return;

      let globalMin = null;
      let globalCurrency = property.price?.currency || "EUR";

      const roomEls = container.querySelectorAll(".room");
      roomEls.forEach((roomEl) => {
        const bookBtn = roomEl.querySelector(".book-btn[data-guesty-id]");
        const priceEl = roomEl.querySelector(".room-price");
        const guestyId = bookBtn?.dataset.guestyId;

        if (!guestyId || !priceEl) return;

        priceEl.textContent = "Loading live price…";

        fetchGuestyPricing(guestyId, checkin, checkout)
          .then((res) => {
            if (!res || res.avgPerNight == null) {
              priceEl.textContent = "Price on request";
              return;
            }

            const { avgPerNight, currency } = res;
            globalCurrency = currency || globalCurrency;

            priceEl.textContent = `Starts at: ${fmtMoney(
              avgPerNight,
              currency
            )} per night`;

            if (globalMin == null || avgPerNight < globalMin) {
              globalMin = avgPerNight;
            }

            if (headerPriceEl && globalMin != null) {
              headerPriceEl.textContent = `From ${fmtMoney(
                globalMin,
                globalCurrency
              )}`;
            }
          })
          .catch((err) => {
            console.warn("Guesty price error for room", guestyId, err);
            priceEl.textContent = "Price on request";
          });
      });
    }

    (function initDateRangeSelectorWithinContainer() {
      const btn = container.querySelector("#dateRangeBtn");
      const txt = container.querySelector("#dateRangeText");
      const ci = container.querySelector("#checkin");
      const co = container.querySelector("#checkout");

      const pad = (n) => String(n).padStart(2, "0");
      const fmt = (d) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const pretty = (val) => {
        if (!val) return "—";
        const d = new Date(val);
        return d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      };

      function updateText() {
        txt.textContent = `${pretty(ci.value)} — ${pretty(co.value)}`;
      }

      btn.addEventListener("click", () => {
        ci.showPicker && ci.showPicker();
      });

      ci.addEventListener("change", () => {
        const d = new Date(ci.value);
        d.setDate(d.getDate() + 1);
        const next = fmt(d);
        co.min = next;
        if (!co.value || co.value < next) co.value = next;
        co.showPicker && co.showPicker();
        updateText();
        refreshRoomPrices();
      });

      co.addEventListener("change", () => {
        const base = new Date(ci.value);
        const minOut = new Date(base);
        minOut.setDate(minOut.getDate() + 1);
        const minStr = fmt(minOut);
        if (co.value < minStr) co.value = minStr;
        updateText();
        refreshRoomPrices();
      });

      updateText();
      refreshRoomPrices();
    })();

    const mainImgs = container.querySelectorAll(".carousel-main img");
    const thumbs = container.querySelectorAll(".carousel-thumbs img");
    thumbs.forEach((t) =>
      t.addEventListener("click", (e) => {
        const i = Number(e.currentTarget.dataset.index);
        mainImgs[i]?.scrollIntoView({ behavior: "smooth", inline: "center" });
        thumbs.forEach((x) => x.classList.remove("active"));
        e.currentTarget.classList.add("active");
      })
    );

    container.querySelectorAll(".book-btn[data-room-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const roomGuests = container.querySelector("#guests")?.value || "";
        const roomId = btn.dataset.guestyId;
        const checkin = container.querySelector("#checkin")?.value || "";
        const checkout = container.querySelector("#checkout")?.value || "";

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
        mainImg.alt = `${room.type} — ${property.title}`;
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

  container.innerHTML = '<p style="padding:16px">Loading…</p>';

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
        return "€";
      case "GBP":
        return "£";
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
        : city || "—";

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
