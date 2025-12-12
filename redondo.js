/* =========================
   LISTINGS PAGE – REDONDO
   ========================= */
function initListingsPageRedondo() {
  const root = document.getElementById("listing-root-redondo");
  if (!root) return;

  const els = {
    chips: document.getElementById("chips"),
    results: document.getElementById("results"),
    meta: document.getElementById("meta"),
    q: document.getElementById("q"),
    sort: document.getElementById("sort"),
    clear: document.getElementById("clear"),
  };

  const state = { all: [], filters: { areas: new Set(), q: "", sort: "top" } };

  function wireControls() {
    els.q?.addEventListener("input", (e) => {
      state.filters.q = e.target.value.trim().toLowerCase();
      update();
    });
    els.sort?.addEventListener("change", (e) => {
      state.filters.sort = e.target.value;
      update();
    });
    els.clear?.addEventListener("click", () => {
      state.filters.q = "";
      state.filters.sort = "top";
      state.filters.areas.clear();
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

  function derive() {
    let items = [...state.all];
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
      const displayCurrency =
        p.currency || p.__raw?.price?.currency || "USD";
      const priceMarkup =
        basePrice != null
          ? `<div class="price">Starts at ${currencySymbol(
              displayCurrency
            )}${Number(basePrice).toLocaleString()} / night</div>`
          : `<div class="price ghost">Starts at —</div>`;
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="media">
          <img src="${
            (p.images && p.images[0]) ||
            "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?q=80&w=1200&auto=format&fit=crop"
          }"
               alt="${escapeHtml(p.name)} in ${escapeHtml(
        p.district || "Redondo Beach"
      )}" loading="lazy" />
        </div>
        <div class="body">
          <h3 class="title">${escapeHtml(p.name)}</h3>
          <div class="loc">${escapeHtml(
            p.district || "Redondo Beach"
          )} • ${escapeHtml(cap(p.area || ""))}${
        p.distance_km ? ` • ${p.distance_km} km from center` : ""
      }</div>

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
            ${priceMarkup}
            <!-- UPDATED: route to SPA detail page for Redondo -->
            <a class="btn btn--gold btn--price" href="/redondoProp?id=${encodeURIComponent(
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

  const propsUrl = root.dataset.props || "/data/properties-redondo.json";
  fetch(propsUrl, { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((json) => {
      state.all = normalizeProperties(json);
      wireControls();
      update();
    })
    .catch((err) => {
      console.warn("Failed to load properties-redondo.json:", err);
      state.all = [];
      wireControls();
      update();
    });
}

/* Expose Redondo listings init */
window.initListingsPageRedondo = initListingsPageRedondo;

/* =========================
   PROPERTY DETAIL PAGE – REDONDO
   ========================= */
function initPropertyDetailPageRedondo() {
  const container = document.getElementById("property-detail-redondo");
  if (!container) return;

  const propsUrl = container.dataset.props || "/data/properties-redondo.json";
  const params = new URLSearchParams(location.search);
  const propertyId = params.get("id");

  const fmtDate = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const fmtMoney = (amount, ccy = "USD") =>
    `${currencySymbol(ccy)}${Number(amount).toLocaleString()}`;

  function notFound(msg = "Property not found.") {
    container.innerHTML = `<p style="padding:16px">${msg} <a href="/properties-redondo" data-link>Back to listings</a></p>`;
  }

  function render(property, all) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    document.title = `${property.title} — One Lux Stay`;

    container.innerHTML = `
      <a class="btn" href="/redondo" style="color: black;" data-link>&larr; Back to listings</a>
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

        </div>
        <div class="carousel-thumbs">
          ${(property.images || [])
            .map(
              (img, i) =>
                `<img src="${img}" alt="Thumb ${i + 1}" data-index="${i}" class="${
                  i === 0 ? "active" : ""
                }">`
            )
            .join("")}
        </div>
      </div>

      <div class="summary">${property.summary || ""}</div>
      <div class="price">From ${fmtMoney(
        property.price?.from,
        property.price?.currency || "USD"
      )}</div>

      <!-- ============ Selector (Booking.com-style dates) ============ -->
      <div class="selector">
        <label>Dates
          <button type="button" id="dateRangeBtn" style="height:38px;padding:0 12px;border:1px solid #ccc;border-radius:6px;cursor:pointer;background:#fff">
            <span id="dateRangeText">Select dates</span>
          </button>
        </label>

        <!-- Hidden native date inputs (kept for your logic) -->
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
          </div>
          <div class="bedrooms">
            ${(room.bedrooms || [])
              .map((b) => `Bedroom ${b.bedroom}: ${b.beds}`)
              .join(", ")}
          </div>

          <div class="room-price" style="align-self: flex-end;"
             data-base-price="${room.price_per_night ?? ""}"
             data-currency="${property.price?.currency || "USD"}"
             style="align-self: start;">
            Starts at: ${fmtMoney(
              room.price_per_night,
              property.price?.currency || "USD"
            )}
          </div>
          <div class="room-nightly" style="align-self: flex-end;" data-nightly-breakdown></div>

          <div class="room-actions" style="align-self: flex-end;">
            ${
              hasTour
                ? `<a
                   class="view-unit-btn"
                   href="/360?tour=${encodeURIComponent(tourJson)}"
                   data-link>
                   View Unit (Virtual Tour)
                 </a>`
                : ""
            }
            <a class="book-btn" href="#"
               data-room-guests="${room.guests}"
               data-room-id="${property.id}" 
               data-guesty-id="${room.guestyid || ""}">
              Book Now
            </a>
          </div>
        </div>`;
          })
          .join("")}
      </div>

      <!-- Room detail modal -->
      <div class="room-modal" id="roomModal" aria-hidden="true">
        <div class="room-modal-backdrop"></div>
        <div class="room-modal-dialog" role="dialog" aria-modal="true">
          <button class="room-modal-close" type="button">&times;</button>

          <div class="room-modal-layout">
            <!-- Left: photos -->
            <div class="room-modal-media">
              <div class="room-modal-main">
                <img id="roomModalMainImage" src="" alt="">
              </div>
              <div class="room-modal-thumbs" id="roomModalThumbs"></div>
            </div>

            <!-- Right: info -->
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

      <div class="similar-properties">
        <h2>Similar Properties</h2>
        <div class="similar-list">
          ${all
            .filter((x) => x.id !== property.id)
            .map(
              (sp) => `
            <div class="similar-card">
              <img src="${(sp.images && sp.images[0]) || ""}" alt="${
                sp.title
              }">
              <h3>${sp.title}</h3>
              <div class="price">${fmtMoney(
                sp.price?.from,
                sp.price?.currency || "USD"
              )}</div>
              <a class="book-btn" href="/redondoProp?id=${encodeURIComponent(
                sp.id
              )}" data-link>View</a>
            </div>`
            )
            .join("")}
        </div>
      </div>
    `;

    initRoomModal(property);

    // ===== Date range button behavior (single control, native pickers) =====
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
      });

      co.addEventListener("change", () => {
        const base = new Date(ci.value);
        const minOut = new Date(base);
        minOut.setDate(minOut.getDate() + 1);
        const minStr = fmt(minOut);
        if (co.value < minStr) co.value = minStr;
        updateText();
      });

      // initial text
      updateText();
    })();

    // Carousel thumbs
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

    // Booking links
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

        // window.open(url, "_blank", "noopener");
        window.location.href = url;
      });
    });

    // Re-run global enhancements
    ensureFeather?.();
    initScrollAnimations?.();
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
      // Title
      titleEl.textContent = `${room.type} (${room.guests} guests)`;

      // Optional size
      sizeEl.textContent = room.size ? `Size: ${room.size}` : "";

      // Price
      priceEl.textContent = room.price_per_night
        ? `From ${fmtMoney(
            room.price_per_night,
            property.price?.currency || "USD"
          )} per night`
        : "";

      // Use room.images or fall back to property.images
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
            (src, i) => `<img 
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

      // Beds
      bedsEl.innerHTML = (room.bedrooms || [])
        .map((b) => `<li>Bedroom ${b.bedroom}: ${b.beds}</li>`)
        .join("");

      // Facilities
      facilitiesEl.innerHTML = (room.amenities || [])
        .map((a) => `<li>${a}</li>`)
        .join("");

      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }

    // Hook up triggers
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

    // Thumbnail click → change main image
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
  fetch(propsUrl, { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${propsUrl}: ${r.status}`);
      return r.json();
    })
    .then((json) => {
      const list = Array.isArray(json?.properties) ? json.properties : [];
      const prop = list.find((p) => p.id === propertyId);
      if (!prop) return notFound(`No property with id "${propertyId}".`);
      render(prop, list);
    })
    .catch((err) => {
      console.error(err);
      notFound("Failed to load property data.");
    });
}

/* Expose detail init */
window.initPropertyDetailPageRedondo = initPropertyDetailPageRedondo;

/* ==========================================
   Listings utils (global, idempotent)
   ========================================== */
(function () {
  if (window.normalizeProperties) return; // already defined

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
