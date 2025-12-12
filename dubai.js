/* =========================
   LISTINGS PAGE — DUBAI
   ========================= */
function initListingsPageDubai() {
  const root = document.getElementById("listing-root");
  if (!root) return;

  const els = {
    results: document.getElementById("results"),
    meta: document.getElementById("meta"),
    q: document.getElementById("q"),
    sort: document.getElementById("sort"),
    clear: document.getElementById("clear"),
  };

  const state = { all: [], filters: { q: "", sort: "top" } };

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
      if (els.q) els.q.value = "";
      if (els.sort) els.sort.value = "top";
      update();
    });
  }

  function derive() {
    let items = [...state.all];

    // Search
    if (state.filters.q) {
      const q = state.filters.q;
      items = items.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.amenities || []).join(" ").toLowerCase().includes(q) ||
          (p.district || "").toLowerCase().includes(q)
      );
    }

    // Sorting
    switch (state.filters.sort) {
      case "rating":
        items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case "price":
        items.sort((a, b) => (a.price_from || 0) - (b.price_from || 0));
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

  function update() {
    const items = derive();
    els.meta.textContent = `${items.length} ${items.length === 1 ? "property" : "properties"
      } found`;

    els.results.innerHTML = "";

    if (!items.length) {
      els.results.innerHTML = `<div class="empty">No results found.</div>`;
      return;
    }

    for (const p of items) {
      const basePrice =
        p.price_from ??
        p.__raw?.price?.from ??
        (typeof p.__raw?.price === "number" ? p.__raw.price : null);
      const displayCurrency =
        p.currency || p.__raw?.price?.currency || "AED";
      const priceMarkup =
        basePrice != null
          ? `<div class="price">Starts at ${currencySymbol(
              displayCurrency
            )}${Number(basePrice).toLocaleString()}</div>`
          : `<div class="price ghost">Starts at —</div>`;
      const card = document.createElement("article");
      card.className = "card";

      card.innerHTML = `
        <div class="media">
          <img src="${(p.images && p.images[0]) ||
        "https://images.unsplash.com/photo-1469793511611-36fdcedaae74"
        }"
          alt="${escapeHtml(p.name)} in ${escapeHtml(p.district || "Dubai")}"
          loading="lazy"/>
        </div>

        <div class="body">
          <h3 class="title">${escapeHtml(p.name)}</h3>

          <div class="loc">${escapeHtml(
          p.district || "Dubai"
        )} • ${p.area ? escapeHtml(p.area) : ""}</div>

          <div class="badges">
            <span class="badge score">${fmtScore(p.rating)}</span>
            <span class="badge">${fmtReviews(p.reviews)} reviews</span>
          </div>

          <p class="desc">${escapeHtml(
          p.description || "Luxury serviced residence in Dubai."
        )}</p>

          <div class="cta">
            ${priceMarkup}
            <a class="btn btn--gold btn--price" href="/dubaiProp?id=${encodeURIComponent(
          p.id
        )}" data-link>Show prices</a>
          </div>
        </div>
      `;

      els.results.appendChild(card);
    }
  }

  const propsUrl = root.dataset.props || "/data/properties-dubai.json";

  fetch(propsUrl, { cache: "no-store" })
    .then((r) => r.json())
    .then((json) => {
      state.all = normalizePropertiesDubai(json);
      wireControls();
      update();
    })
    .catch((err) => {
      console.warn("Failed to load Dubai properties:", err);
      state.all = [];
      wireControls();
      update();
    });
}

/* ======================================================================================
   PROPERTY DETAIL PAGE — DUBAI
   ====================================================================================== */
function initPropertyDetailPageDubai() {
  const container = document.getElementById("property-detail-dubai");
  if (!container) return;

  const propsUrl = container.dataset.props || "/data/properties-dubai.json";

  const params = new URLSearchParams(location.search);
  const propertyId = params.get("id");

  function notFound(msg = "Property not found.") {
    container.innerHTML = `<p style="padding:16px">${msg} <a href="/dubai" data-link>Back to Dubai listings</a></p>`;
  }

  const fmtMoney = (amt, ccy = "AED") =>
    `${currencySymbol(ccy || "AED")}${Number(amt).toLocaleString()}`;

  const fmtDate = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  function render(property, all) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const displayTitle =
      property.title || property.name || property.id || "Property";

    document.title = `${displayTitle} — One Lux Stay Dubai`;

    // --- helper: pick similar properties ---
    function getSimilar(allProps, current) {
      const others = allProps.filter((x) => x.id !== current.id);

      // Prefer same district / area first
      let sims = others.filter((x) => {
        const xDistrict = x.location?.district || x.district;
        const xArea = x.location?.area || x.area;
        const cDistrict = current.location?.district || current.district;
        const cArea = current.location?.area || current.area;
        return xDistrict === cDistrict || xArea === cArea;
      });

      // Fallback: just grab first few others
      if (!sims.length) sims = others;

      // Limit to 3–4 to avoid clutter
      return sims.slice(0, 4);
    }

    const similar = getSimilar(all, property);

    container.innerHTML = `
      <a class="btn" href="/dubai" style="color:black" data-link>&larr; Back to Dubai listings</a>
      <h1 style="margin:12px 0">${displayTitle}</h1>
      <div class="location">
        ${property.district || "Dubai"} • ${property.address || ""}
      </div>

      <div class="rating" style="margin:8px 0 14px">
        Rating: <span>${property.rating ?? ""}</span>
        ${property.reviews
        ? `(${property.reviews.toLocaleString()} reviews)`
        : ""
      }
      </div>

      <div class="carousel-container">
        <div class="carousel-main">
          ${(property.images || [])
        .map(
          (img, i) => `
            <img src="${img}" 
                 alt="${displayTitle} image ${i + 1}" 
                 data-index="${i}">
          `
        )
        .join("")}
      </div>

        </div>

        <div class="carousel-thumbs">
          ${(property.images || [])
        .map(
          (img, i) => `
            <img src="${img}" 
                 class="${i === 0 ? "active" : ""}" 
                 data-index="${i}">
          `
        )
        .join("")}
        </div>
      </div>

      <div class="summary">${property.summary || ""}</div>

      <div class="price">
        From ${fmtMoney(property.price?.from, property.price?.currency)}
      </div>

      <!-- ============ Selector (dates + guests) ============ -->
      <div class="selector">
        <label>Dates
          <button type="button" id="dateRangeBtn" style="height:38px;padding:0 12px;border:1px solid #ccc;border-radius:6px;cursor:pointer;background:#fff">
            <span id="dateRangeText">Select dates</span>
          </button>
        </label>

        <!-- Hidden native date inputs -->
        <input type="date" id="checkin"
               value="${fmtDate(today)}"
               min="${fmtDate(today)}"
               style="position:absolute;opacity:0;width:0;height:0;pointer-events:none">
        <input type="date" id="checkout"
               value="${fmtDate(tomorrow)}"
               min="${fmtDate(tomorrow)}"
               style="position:absolute;opacity:0;width:0;height:0;pointer-events:none">

        <label>Guests
          <select id="guests">
            ${Array.from(
          { length: 6 },
          (_, i) => `<option value="${i + 1}">${i + 1}</option>`
        ).join("")}
          </select>
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
                data-room-index="${idx}">
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
               data-currency="${property.price?.currency || "AED"}"
               style="align-self: start;">
              Starts at: ${fmtMoney(room.price_per_night, property.price?.currency)}
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
              <a class="book-btn"
                 href="#"
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
    `;

    // Init room modal (thumbnails, etc.)
    initRoomModalDubai(property);

    // ===== Date range button behavior =====
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

      // initial label
      updateText();
    })();

    // ===== Carousel thumbs behavior =====
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

    // ===== Booking links =====
    container.querySelectorAll(".book-btn[data-room-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();

        const roomGuests = container.querySelector("#guests")?.value || "";
        const roomId = btn.dataset.guestyId; // Guesty property id
        const checkin = container.querySelector("#checkin")?.value || "";
        const checkout = container.querySelector("#checkout")?.value || "";

        if (!roomId) {
          console.warn("Missing Guesty ID on room/book button");
          return;
        }

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

    // ===== Wire "Similar Properties" clicks to re-render detail =====
    const simLinks = container.querySelectorAll(".similar-view");
    simLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const id = link.dataset.simId;
        const next = all.find((p) => p.id === id);
        if (!next) return;

        // Update URL so back/refresh still points to the right property
        history.pushState({}, "", `/dubaiProp?id=${encodeURIComponent(id)}`);

        // Re-render with the new property
        render(next, all);

        // Scroll to top for a fresh view
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  if (!propertyId) {
    notFound("Missing Dubai property ID.");
    return;
  }

  container.innerHTML = "<p style='padding:16px'>Loading…</p>";

  fetch(propsUrl, { cache: "no-store" })
    .then((r) => r.json())
    .then((json) => {
      const list = Array.isArray(json.properties) ? json.properties : json;
      const prop = list.find((p) => p.id === propertyId);
      if (!prop) return notFound();

      render(prop, list);
    })
    .catch(() => notFound("Failed to load Dubai property data."));
}

/* ================================================================
   ROOM MODAL — DUBAI
   ================================================================ */
function initRoomModalDubai(property) {
  const modal = document.getElementById("roomModal");
  if (!modal) return;

  const backdrop = modal.querySelector(".room-modal-backdrop");
  const closeBtn = modal.querySelector(".room-modal-close");

  const mainImg = document.getElementById("roomModalMainImage");
  const thumbsEl = document.getElementById("roomModalThumbs");
  const titleEl = document.getElementById("roomModalTitle");
  const sizeEl = document.getElementById("roomModalSize"); // optional
  const priceEl = document.getElementById("roomModalPrice");
  const facilitiesEl = document.getElementById("roomModalFacilities");
  const bedsEl = document.getElementById("roomModalBeds");

  const triggers = document.querySelectorAll(".room-trigger");

  function openRoom(room) {
    titleEl.textContent = `${room.type} (${room.guests} guests)`;

    if (sizeEl) {
      sizeEl.textContent = room.size ? `Size: ${room.size}` : "";
    }

    priceEl.textContent = room.price_per_night
      ? `From ${currencySymbol(
        property.price?.currency || "AED"
      )}${room.price_per_night.toLocaleString()} per night`
      : "";

    const imgs =
      (Array.isArray(room.images) && room.images.length
        ? room.images
        : Array.isArray(property.images)
          ? property.images
          : []) || [];

    if (imgs.length) {
      mainImg.src = imgs[0];
      mainImg.alt = `${room.type} — ${property.title || property.name || "Room"
        }`;
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

/* ================================================================
   NORMALIZER for Dubai (similar to Antwerp)
   ================================================================ */
function normalizePropertiesDubai(json) {
  const arr = Array.isArray(json) ? json : json.properties || [];

  return arr.map((it) => {
    if (!it) return null;

    const title = it.title || it.name || "";
    const city = it.location?.city || "Dubai";
    const district = it.location?.district || it.district || "Dubai";
    const area = it.location?.area || "Dubai";
    const price_from = it.price?.from ?? it.price_from ?? null;
    const currency = it.price?.currency || "AED";

    return {
      id: it.id || title.toLowerCase().replace(/\s+/g, "-"),
      name: title,
      district,
      area,
      rating: it.rating ?? 0,
      reviews: it.reviews ?? 0,
      description: it.summary || it.description || "",
      amenities: it.amenities || [],
      price_from,
      currency,
      images: it.images || [],
      rooms: it.rooms || [],
      address: it.address || "",
      __raw: it,
    };
  });
}
