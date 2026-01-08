/* ================================
   SPA Loader + Page Initializers
   ================================ */

window.__useOLSDatePicker = true;
let cleanupHomeExperience = null;
let cleanupAntwerpExperience = null;
let cleanupDubaiExperience = null;
let cleanupLosAngelesExperience = null;
let cleanupHollywoodExperience = null;
let cleanupRedondoExperience = null;
let cleanupMiamiExperience = null;

// Load page content into the #app container
function loadPage(pageName) {
  const app = document.getElementById("app");
  app.style.opacity = 0;

  if (cleanupHomeExperience) {
    cleanupHomeExperience();
    cleanupHomeExperience = null;
  }
  if (cleanupAntwerpExperience) {
    cleanupAntwerpExperience();
    cleanupAntwerpExperience = null;
  }
  if (cleanupDubaiExperience) {
    cleanupDubaiExperience();
    cleanupDubaiExperience = null;
  }
  if (cleanupLosAngelesExperience) {
    cleanupLosAngelesExperience();
    cleanupLosAngelesExperience = null;
  }
  if (cleanupHollywoodExperience) {
    cleanupHollywoodExperience();
    cleanupHollywoodExperience = null;
  }
  if (cleanupRedondoExperience) {
    cleanupRedondoExperience();
    cleanupRedondoExperience = null;
  }
  if (cleanupMiamiExperience) {
    cleanupMiamiExperience();
    cleanupMiamiExperience = null;
  }

  fetch(`/pages/${pageName}.html`)
    .then((res) => res.text())
    .then((html) => {
      setTimeout(() => {
        app.innerHTML = html;

        // After fragment injection, init per-page features
        if (document.getElementById("listing-root-antwerp")) {
          initListingsPage(); // listings screen
        }

        // NEW: detail screen initializer (antwerpProp.html)
        if (document.getElementById("property-detail-antwerp")) {
          initPropertyDetailPageAntwerp();
        }

        if (document.getElementById("property-detail-dubai")) {
          initPropertyDetailPageDubai();
        }

        if (document.getElementById("property-detail-redondo")) {
          initPropertyDetailPageRedondo();
        }

        if (document.getElementById("property-detail-losangeles")) {
          initPropertyDetailPageLosAngeles();
        }

        if (document.getElementById("property-detail-miami")) {
          initPropertyDetailPageMiami();
        }

        if (document.getElementById("property-detail-hollywood")) {
          initPropertyDetailPageHollywood();
        }

        if (document.getElementById("listing-root-all")) {
          initPropertyDetailPageAntwerp();
        }

        app.style.opacity = 1;
        window.scrollTo(0, 0);

        // Re-init sitewide behaviors for SPA nav
        initMenuToggle();
        bookingFormInit();
        // newBookingFormInit();
        showNotification();
        ensureFeather();
        initScrollAnimations();
        initPanoramaIfPresent();
        initTypeOnScroll();

        initPanorama();
        // refresh nav observer so it can find hero inside loaded html
        if (typeof window.__nav_refreshHero === "function") {
          window.__nav_refreshHero();
        }
        // init units carousel if present
        initUnitsCarousel();
        // Init the single-calendar, two-click range picker if the fields exist
        if (
          window.initOLSDatePicker &&
          document.getElementById("checkin") &&
          document.getElementById("checkout")
        ) {
          window.initOLSDatePicker();
        }

        // AOS: animate-on-scroll
        if (window.AOS) {
          AOS.init({
            once: true,
            duration: 700,
            easing: "ease-out",
            offset: 120,
          });
          // make sure new fragments are measured
          AOS.refreshHard();
        }

        initHomeExperience();
        initAntwerpExperience();
        initDubaiExperience();
        initLosAngelesExperience();
        initHollywoodExperience();
        initRedondoExperience();
        initMiamiExperience();
      }, 150);
    })
    .catch((err) => {
      console.error("Failed to load page:", err);
      app.style.opacity = 1;
    });
}

/* =========================
   Scroll Animations helper
   ========================= */
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 }
  );

  document
    .querySelectorAll(".animate-on-scroll")
    .forEach((el) => observer.observe(el));
}

/* =========================
   Toast Notification helper
   ========================= */
function showNotification(message) {
  const notification = document.getElementById("notification");
  if (!notification) return;
  notification.textContent = message || notification.textContent || "";
  notification.style.display = "block";
  notification.style.opacity = "0.97";
  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => {
      notification.style.display = "none";
    }, 300);
  }, 5000);
}

/* =========================
   Accessible Menu Toggle
   ========================= */
function initMenuToggle() {
  const btn = document.getElementById("menuToggle");
  const curtain = document.getElementById("navCurtain");
  if (!btn || !curtain) return;

  btn.setAttribute(
    "aria-expanded",
    btn.getAttribute("aria-expanded") || "false"
  );
  curtain.setAttribute(
    "aria-hidden",
    curtain.classList.contains("open") ? "false" : "true"
  );

  // Remove previously attached handlers to avoid duplicates
  document.removeEventListener("click", documentClickHandler);
  document.removeEventListener("keydown", keydownHandler);

  function openMenu() {
    curtain.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    curtain.setAttribute("aria-hidden", "false");
    swapToCloseIcon();
    const focusable = curtain.querySelector(
      'a, button, input, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) focusable.focus();
  }

  function closeMenu() {
    curtain.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
    curtain.setAttribute("aria-hidden", "true");
    swapToBurgerIcon();
    btn.focus();
  }

  function toggleMenu() {
    if (curtain.classList.contains("open")) closeMenu();
    else openMenu();
  }

  function swapToCloseIcon() {
    btn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
  }
  function swapToBurgerIcon() {
    btn.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
  }

  function buttonClickHandler(e) {
    e.stopPropagation();
    toggleMenu();
  }

  function documentClickHandler(e) {
    if (!curtain.classList.contains("open")) return;
    const withinCurtain = e.target.closest("#navCurtain");
    const withinButton = e.target.closest("#menuToggle");
    if (!withinCurtain && !withinButton) closeMenu();
  }

  function keydownHandler(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      if (curtain.classList.contains("open")) closeMenu();
    }
  }

  function linkClickHandler(e) {
    const a = e.target.closest("a");
    if (a && curtain.contains(a)) closeMenu();
  }

  btn.addEventListener("click", buttonClickHandler);
  document.addEventListener("click", documentClickHandler);
  document.addEventListener("keydown", keydownHandler);
  curtain.addEventListener("click", linkClickHandler);

  if (curtain.classList.contains("open")) swapToCloseIcon();
  else swapToBurgerIcon();

  btn._menuHandlers = {
    buttonClickHandler,
    documentClickHandler,
    keydownHandler,
    linkClickHandler,
  };
}

/**
 * Home page specific motion/parallax/cursor enhancements
 */
function initHomeExperience() {
  cleanupHomeExperience?.();

  const homeRoot = document.getElementById("home-root");
  if (!homeRoot) return;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const isMobileViewport = window.matchMedia("(max-width: 768px)").matches;

  let scrollObserver = null;
  const scrollTargets = homeRoot.querySelectorAll(".animate-on-scroll");
  if (!prefersReducedMotion && "IntersectionObserver" in window) {
    scrollObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            scrollObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );
    scrollTargets.forEach((el) => scrollObserver.observe(el));
  } else {
    scrollTargets.forEach((el) => el.classList.add("visible"));
  }

  const parallaxLayers = prefersReducedMotion || isMobileViewport
    ? []
    : homeRoot.querySelectorAll("[data-parallax]");
  let parallaxHandler = null;
  if (parallaxLayers.length) {
    let parallaxTicking = false;
    const runParallax = () => {
      const scrollY =
        window.pageYOffset || document.documentElement.scrollTop || 0;
      parallaxLayers.forEach((layer) => {
        const depth = parseFloat(layer.dataset.parallax || "0");
        layer.style.transform = `translate3d(0, ${scrollY * depth * -1}px, 0)`;
      });
      parallaxTicking = false;
    };
    parallaxHandler = () => {
      if (parallaxTicking) return;
      parallaxTicking = true;
      requestAnimationFrame(runParallax);
    };
    window.addEventListener("scroll", parallaxHandler, { passive: true });
    parallaxHandler();
  }

  const cursorOrb = homeRoot.querySelector(".cursor-orb");
  const cursorTrail = homeRoot.querySelector(".cursor-trail");
  let cursorCleanup = null;
  if (
    cursorOrb &&
    !prefersReducedMotion &&
    !isMobileViewport &&
    !window.matchMedia("(pointer: coarse)").matches
  ) {
    let orbX = window.innerWidth / 2;
    let orbY = window.innerHeight / 2;
    let targetX = orbX;
    let targetY = orbY;
    let rafId;
    let orbHalfW = cursorOrb.offsetWidth / 2;
    let orbHalfH = cursorOrb.offsetHeight / 2;
    let orbVisible = false;
    let lastSparkleTime = 0;
    let orbFadeTimeout = null;
    const MAX_SPARKLES = 12;
    let sparkleCount = 0;

    const updateOrbSize = () => {
      orbHalfW = cursorOrb.offsetWidth / 2;
      orbHalfH = cursorOrb.offsetHeight / 2;
    };

    const renderOrb = () => {
      orbX += (targetX - orbX) * 0.15;
      orbY += (targetY - orbY) * 0.15;
      cursorOrb.style.opacity = orbVisible ? "0.85" : "0";
      cursorOrb.style.transform = `translate3d(${orbX - orbHalfW}px, ${
        orbY - orbHalfH
      }px, 0)`;
      rafId = requestAnimationFrame(renderOrb);
    };

    const spawnSparkle = (x, y) => {
      if (!cursorTrail) return;
      if (sparkleCount >= MAX_SPARKLES) {
        const oldest = cursorTrail.firstElementChild;
        if (oldest) {
          oldest.remove();
          sparkleCount = Math.max(0, sparkleCount - 1);
        }
      }
      const sparkle = document.createElement("span");
      sparkle.className = "cursor-spark";
      const size = 6 + Math.random() * 12;
      sparkle.style.width = `${size}px`;
      sparkle.style.height = `${size}px`;
      sparkle.style.left = `${x}px`;
      sparkle.style.top = `${y}px`;
      const hue = 35 + Math.random() * 30;
      sparkle.style.setProperty(
        "--sparkle-color",
        `hsla(${hue}, 90%, 85%, 0.95)`
      );
      sparkle.style.setProperty(
        "--sparkle-shadow",
        `hsla(${hue}, 90%, 70%, 0.85)`
      );
      sparkle.style.setProperty(
        "--sparkle-drift-x",
        `${(Math.random() - 0.5) * 80}px`
      );
      sparkle.style.setProperty(
        "--sparkle-drift-y",
        `${-20 - Math.random() * 60}px`
      );
      cursorTrail.appendChild(sparkle);
      sparkleCount += 1;
      sparkle.addEventListener("animationend", () => {
        sparkle.remove();
        sparkleCount = Math.max(0, sparkleCount - 1);
      });
    };

    const pointerHandler = (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
      orbVisible = true;
      if (orbFadeTimeout) {
        clearTimeout(orbFadeTimeout);
      }
      orbFadeTimeout = setTimeout(() => {
        orbVisible = false;
      }, 300);
      const now = performance.now();
      if (now - lastSparkleTime > 75) {
        spawnSparkle(e.clientX, e.clientY);
        lastSparkleTime = now;
      }
    };

    const leaveHandler = () => {
      orbVisible = false;
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") {
        orbVisible = false;
        cursorOrb.style.opacity = "0";
      }
    };

    window.addEventListener("pointermove", pointerHandler, { passive: true });
    window.addEventListener("pointerleave", leaveHandler, { passive: true });
    window.addEventListener("resize", updateOrbSize);
    document.addEventListener("visibilitychange", handleVisibility);
    updateOrbSize();
    renderOrb();

    cursorCleanup = () => {
      window.removeEventListener("pointermove", pointerHandler);
      window.removeEventListener("pointerleave", leaveHandler);
      window.removeEventListener("resize", updateOrbSize);
      document.removeEventListener("visibilitychange", handleVisibility);
      cancelAnimationFrame(rafId);
      if (orbFadeTimeout) {
        clearTimeout(orbFadeTimeout);
      }
      cursorOrb.style.opacity = "0";
      if (cursorTrail) {
        cursorTrail.innerHTML = "";
      }
    };
  }

  cleanupHomeExperience = () => {
    scrollObserver?.disconnect();
    if (parallaxLayers.length) {
      window.removeEventListener("scroll", parallaxHandler);
    }
    cursorCleanup?.();
  };
}

function setupCityExperience(root) {
  if (!root) return null;
  const cleanupTasks = [];
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const parallaxLayers = prefersReducedMotion
    ? []
    : Array.from(root.querySelectorAll("[data-parallax]"));
  if (parallaxLayers.length) {
    let parallaxTicking = false;
    const runParallax = () => {
      const scrollY =
        window.pageYOffset || document.documentElement.scrollTop || 0;
      parallaxLayers.forEach((layer) => {
        const depth = parseFloat(layer.dataset.parallax || "0");
        layer.style.transform = `translate3d(0, ${scrollY * depth * -1}px, 0)`;
      });
      parallaxTicking = false;
    };
    const parallaxHandler = () => {
      if (parallaxTicking) return;
      parallaxTicking = true;
      requestAnimationFrame(runParallax);
    };
    window.addEventListener("scroll", parallaxHandler, { passive: true });
    runParallax();
    cleanupTasks.push(() =>
      window.removeEventListener("scroll", parallaxHandler)
    );
  }

  // Scroll reveal for split sections/cards
  (function initReveals() {
    const targets = Array.from(
      root.querySelectorAll(
        ".section-split .split-media, .section-split .split-body, .section, .property-card, .landmark-showcase, .transit-stage, .transit-roster"
      )
    );

    if (!targets.length) return;

    // assign directional presets for the split blocks
    targets.forEach((el) => {
      if (el.classList.contains("split-media")) el.classList.add("fade-left");
      if (el.classList.contains("split-body")) el.classList.add("fade-right");
      el.classList.add("will-animate");
    });

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -10% 0px" }
    );

    targets.forEach((el, idx) => {
      if (idx % 3 === 1) el.classList.add("animate-delay-1");
      if (idx % 3 === 2) el.classList.add("animate-delay-2");
      io.observe(el);
    });

    cleanupTasks.push(() => io.disconnect());
  })();

  const cursorOrb = root.querySelector(".cursor-orb");
  const cursorTrail = root.querySelector(".cursor-trail");
  if (
    cursorOrb &&
    !prefersReducedMotion &&
    !window.matchMedia("(pointer: coarse)").matches
  ) {
    let orbX = window.innerWidth / 2;
    let orbY = window.innerHeight / 2;
    let targetX = orbX;
    let targetY = orbY;
    let orbVisible = false;
    let orbHalfW = cursorOrb.offsetWidth / 2;
    let orbHalfH = cursorOrb.offsetHeight / 2;
    let rafId;
    let lastSparkleTime = 0;
    let sparkleCount = 0;
    const MAX_SPARKLES = 14;
    let orbGlowTimeout = null;
    let orbFadeTimeout = null;
    let isGlowing = false;

    const updateOrbSize = () => {
      orbHalfW = cursorOrb.offsetWidth / 2;
      orbHalfH = cursorOrb.offsetHeight / 2;
    };

    const renderOrb = () => {
      orbX += (targetX - orbX) * 0.15;
      orbY += (targetY - orbY) * 0.15;
      cursorOrb.style.opacity = orbVisible ? "0.85" : "0";
      cursorOrb.style.transform = `translate3d(${orbX - orbHalfW}px, ${
        orbY - orbHalfH
      }px, 0)`;
      rafId = requestAnimationFrame(renderOrb);
    };

    const spawnSparkle = (x, y) => {
      if (!cursorTrail) return;
      if (sparkleCount >= MAX_SPARKLES) {
        const oldest = cursorTrail.firstElementChild;
        if (oldest) {
          oldest.remove();
          sparkleCount = Math.max(0, sparkleCount - 1);
        }
      }
      const sparkle = document.createElement("span");
      sparkle.className = "cursor-spark";
      const size = 6 + Math.random() * 10;
      sparkle.style.width = `${size}px`;
      sparkle.style.height = `${size}px`;
      sparkle.style.left = `${x}px`;
      sparkle.style.top = `${y}px`;
      sparkle.style.setProperty(
        "--sparkle-drift-x",
        `${(Math.random() - 0.5) * 70}px`
      );
      sparkle.style.setProperty(
        "--sparkle-drift-y",
        `${-20 - Math.random() * 70}px`
      );
      cursorTrail.appendChild(sparkle);
      sparkleCount += 1;
      sparkle.addEventListener("animationend", () => {
        sparkle.remove();
        sparkleCount = Math.max(0, sparkleCount - 1);
      });
    };

    const pointerHandler = (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
      orbVisible = true;
      if (orbFadeTimeout) clearTimeout(orbFadeTimeout);
      orbFadeTimeout = setTimeout(() => {
        orbVisible = false;
        cursorOrb.classList.remove("cursor-orb--glow");
        isGlowing = false;
      }, 350);
      if (!isGlowing) {
        isGlowing = true;
        cursorOrb.classList.add("cursor-orb--glow");
      }
      if (orbGlowTimeout) clearTimeout(orbGlowTimeout);
      orbGlowTimeout = setTimeout(() => {
        cursorOrb.classList.remove("cursor-orb--glow");
        isGlowing = false;
      }, 400);
      const now = performance.now();
      if (now - lastSparkleTime > 60) {
        spawnSparkle(event.clientX, event.clientY);
        lastSparkleTime = now;
      }
    };

    const leaveHandler = () => {
      orbVisible = false;
      cursorOrb.classList.remove("cursor-orb--glow");
      isGlowing = false;
      if (orbFadeTimeout) clearTimeout(orbFadeTimeout);
    };

    window.addEventListener("pointermove", pointerHandler, { passive: true });
    window.addEventListener("pointerleave", leaveHandler, { passive: true });
    window.addEventListener("resize", updateOrbSize);
    renderOrb();

    cleanupTasks.push(() => {
      window.removeEventListener("pointermove", pointerHandler);
      window.removeEventListener("pointerleave", leaveHandler);
      window.removeEventListener("resize", updateOrbSize);
      cancelAnimationFrame(rafId);
      if (orbGlowTimeout) clearTimeout(orbGlowTimeout);
      if (orbFadeTimeout) clearTimeout(orbFadeTimeout);
      cursorOrb.classList.remove("cursor-orb--glow");
      cursorOrb.style.opacity = "0";
      if (cursorTrail) cursorTrail.innerHTML = "";
    });
  }

  const landmarkTokens = Array.from(root.querySelectorAll(".landmark-token"));
  if (landmarkTokens.length) {
    const media = root.querySelector(".landmark-showcase-media");
    const labelEl = root.querySelector("[data-landmark-label]");
    const titleEl = root.querySelector("[data-landmark-title]");
    const copyEl = root.querySelector("[data-landmark-copy]");

    const activate = (token) => {
      if (!token) return;
      landmarkTokens.forEach((btn) => {
        const isActive = btn === token;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      const photo = token.getAttribute("data-photo");
      if (media && photo) {
        media.style.backgroundImage = `url('${photo}')`;
      }
      if (labelEl) labelEl.textContent = token.getAttribute("data-label") || "";
      if (titleEl) titleEl.textContent = token.getAttribute("data-title") || "";
      if (copyEl) copyEl.textContent = token.getAttribute("data-copy") || "";
    };

    const listeners = landmarkTokens.map((token) => {
      const handler = () => activate(token);
      token.addEventListener("click", handler);
      return { token, handler };
    });

    activate(
      landmarkTokens.find((btn) => btn.classList.contains("active")) ||
        landmarkTokens[0]
    );

    // Swipe support for landmark carousel (mobile)
    const showcase = root.querySelector(".landmark-showcase");
    if (showcase) {
      let startX = 0;
      let deltaX = 0;
      const threshold = 30;

      const step = (delta) => {
        const total = landmarkTokens.length;
        const currentIdx = landmarkTokens.findIndex((btn) =>
          btn.classList.contains("active")
        );
        const nextIdx =
          ((currentIdx < 0 ? 0 : currentIdx) + delta + total) % total;
        activate(landmarkTokens[nextIdx]);
      };

      const onTouchStart = (e) => {
        const touch = e.touches?.[0];
        if (!touch) return;
        startX = touch.clientX;
        deltaX = 0;
      };

      const onTouchMove = (e) => {
        const touch = e.touches?.[0];
        if (!touch) return;
        deltaX = touch.clientX - startX;
      };

      const onTouchEnd = () => {
        if (Math.abs(deltaX) > threshold) {
          if (deltaX < 0) step(1);
          else step(-1);
        }
        startX = 0;
        deltaX = 0;
      };

      showcase.addEventListener("touchstart", onTouchStart, { passive: true });
      showcase.addEventListener("touchmove", onTouchMove, { passive: true });
      showcase.addEventListener("touchend", onTouchEnd);

      cleanupTasks.push(() => {
        showcase.removeEventListener("touchstart", onTouchStart);
        showcase.removeEventListener("touchmove", onTouchMove);
        showcase.removeEventListener("touchend", onTouchEnd);
      });
    }

    cleanupTasks.push(() =>
      listeners.forEach(({ token, handler }) =>
        token.removeEventListener("click", handler)
      )
    );
  }

  const transitTokens = Array.from(root.querySelectorAll(".transit-chip"));
  if (transitTokens.length) {
    const glyphImg = root.querySelector("[data-transit-glyph]");
    const tagEl = root.querySelector("[data-transit-tag]");
    const titleEl = root.querySelector("[data-transit-title]");
    const descEl = root.querySelector("[data-transit-desc]");
    const ghostLeftImg = root.querySelector("[data-transit-ghost-left]");
    const ghostRightImg = root.querySelector("[data-transit-ghost-right]");
    const prevBtn = root.querySelector("[data-transit-prev]");
    const nextBtn = root.querySelector("[data-transit-next]");
    const swipeArea = root.querySelector(".transit-spotlight");
    let currentIndex = transitTokens.findIndex((btn) =>
      btn.classList.contains("active")
    );
    if (currentIndex < 0) currentIndex = 0;

    const setImage = (imgEl, src, altText) => {
      if (!imgEl || !src) return;
      imgEl.src = src;
      if (typeof altText === "string") {
        imgEl.alt = altText;
      }
    };

    const setGhost = (imgEl, idx) => {
      if (!imgEl) return;
      const token = transitTokens[idx];
      if (!token) return;
      setImage(imgEl, token.getAttribute("data-image"), "");
    };

    const activateTransit = (index) => {
      const token = transitTokens[index];
      if (!token) return;
      currentIndex = index;
      transitTokens.forEach((btn, idx) => {
        const isActive = idx === index;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      const image = token.getAttribute("data-image");
      const altText =
        token.getAttribute("data-alt") || token.getAttribute("data-title") || "";
      setImage(glyphImg, image, altText);
      if (tagEl) tagEl.textContent = token.getAttribute("data-tag") || "";
      if (titleEl) titleEl.textContent = token.getAttribute("data-title") || "";
      if (descEl) descEl.textContent = token.getAttribute("data-desc") || "";
      const total = transitTokens.length;
      setGhost(ghostLeftImg, (index - 1 + total) % total);
      setGhost(ghostRightImg, (index + 1) % total);
    };

    const tokenListeners = transitTokens.map((token, idx) => {
      const handler = () => activateTransit(idx);
      token.addEventListener("click", handler);
      return { token, handler };
    });

    const step = (delta) => {
      const total = transitTokens.length;
      const next = (currentIndex + delta + total) % total;
      activateTransit(next);
    };

    const prevHandler = () => step(-1);
    const nextHandler = () => step(1);
    prevBtn?.addEventListener("click", prevHandler);
    nextBtn?.addEventListener("click", nextHandler);

    // Basic swipe support for spotlight (mobile)
    if (swipeArea) {
      let startX = 0;
      let deltaX = 0;
      const threshold = 30;

      const onTouchStart = (e) => {
        const touch = e.touches?.[0];
        if (!touch) return;
        startX = touch.clientX;
        deltaX = 0;
      };

      const onTouchMove = (e) => {
        const touch = e.touches?.[0];
        if (!touch) return;
        deltaX = touch.clientX - startX;
      };

      const onTouchEnd = () => {
        if (Math.abs(deltaX) > threshold) {
          if (deltaX < 0) nextHandler();
          else prevHandler();
        }
        startX = 0;
        deltaX = 0;
      };

      swipeArea.addEventListener("touchstart", onTouchStart, { passive: true });
      swipeArea.addEventListener("touchmove", onTouchMove, { passive: true });
      swipeArea.addEventListener("touchend", onTouchEnd);

      cleanupTasks.push(() => {
        swipeArea.removeEventListener("touchstart", onTouchStart);
        swipeArea.removeEventListener("touchmove", onTouchMove);
        swipeArea.removeEventListener("touchend", onTouchEnd);
      });
    }

    activateTransit(currentIndex);

    cleanupTasks.push(() => {
      tokenListeners.forEach(({ token, handler }) =>
        token.removeEventListener("click", handler)
      );
      prevBtn?.removeEventListener("click", prevHandler);
      nextBtn?.removeEventListener("click", nextHandler);
    });
  }

  return cleanupTasks.length
    ? () => cleanupTasks.forEach((fn) => fn())
    : null;
}

function initAntwerpExperience() {
  cleanupAntwerpExperience?.();
  const root = document.getElementById("antwerp-root");
  cleanupAntwerpExperience = setupCityExperience(root);
}

function initDubaiExperience() {
  cleanupDubaiExperience?.();
  const root = document.getElementById("dubai-root");
  cleanupDubaiExperience = setupCityExperience(root);
}

function initLosAngelesExperience() {
  cleanupLosAngelesExperience?.();
  const root = document.getElementById("losangeles-root");
  cleanupLosAngelesExperience = setupCityExperience(root);
}

function initHollywoodExperience() {
  cleanupHollywoodExperience?.();
  const root = document.getElementById("hollywood-root");
  cleanupHollywoodExperience = setupCityExperience(root);
}

function initRedondoExperience() {
  cleanupRedondoExperience?.();
  const root = document.getElementById("redondo-root");
  cleanupRedondoExperience = setupCityExperience(root);
}

function initMiamiExperience() {
  cleanupMiamiExperience?.();
  const root = document.getElementById("miami-root");
  cleanupMiamiExperience = setupCityExperience(root);
}

/* =========================================
   Progressive Nav Blur over Scrolling Hero
   ========================================= */
(function () {
  const nav = document.getElementById("nav");
  if (!nav) return;

  const MAX_BLUR = 10; // px when fully over hero
  const MIN_BLUR = 6; // px when scrolled
  const START_ALPHA = 0.06;
  const END_ALPHA = 0.78;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function computeProgress(heroRect, navH) {
    const bottom = heroRect.bottom;
    const heroHeight = heroRect.height || window.innerHeight;
    const raw = (heroHeight - (bottom - navH)) / heroHeight;
    return clamp(raw, 0, 1);
  }

  function applyProgress(progress) {
    const blur = MIN_BLUR + (MAX_BLUR - MIN_BLUR) * (1 - progress);
    const alpha = START_ALPHA + (END_ALPHA - START_ALPHA) * progress;
    nav.style.backdropFilter = `blur(${blur}px)`;
    nav.style.webkitBackdropFilter = `blur(${blur}px)`;
    nav.style.backgroundColor = `rgba(0,0,0,${alpha})`;
  }

  function resetStyle() {
    nav.style.backdropFilter = "";
    nav.style.webkitBackdropFilter = "";
    nav.style.backgroundColor = "";
  }

  function connect() {
    const hero =
      document.querySelector(".hero") ||
      document.querySelector("#hero") ||
      null;
    if (!hero) {
      if (window.scrollY > 0) applyProgress(1);
      else resetStyle();
      window.addEventListener(
        "scroll",
        () => {
          if (window.scrollY > 0) applyProgress(1);
          else resetStyle();
        },
        { passive: true }
      );
      return;
    }

    if ("IntersectionObserver" in window) {
      const navH = Math.ceil(nav.getBoundingClientRect().height || 64);

      const io = new IntersectionObserver(
        () => {
          const rect = hero.getBoundingClientRect();
          const p = computeProgress(rect, navH);
          applyProgress(p);
        },
        {
          root: null,
          threshold: new Array(21).fill(0).map((_, i) => i / 20),
          rootMargin: `-${navH}px 0px 0px 0px`,
        }
      );

      io.observe(hero);
      window.__navState = window.__navState || {};
      window.__navState.progressObserver = io;

      window.addEventListener("resize", () => {
        const rect = hero.getBoundingClientRect();
        applyProgress(
          computeProgress(
            rect,
            Math.ceil(nav.getBoundingClientRect().height || 64)
          )
        );
      });
    } else {
      const onScroll = () => {
        const rect = hero.getBoundingClientRect();
        const p = computeProgress(
          rect,
          Math.ceil(nav.getBoundingClientRect().height || 64)
        );
        applyProgress(p);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      onScroll();
      window.__navState = window.__navState || {};
      window.__navState.progressScrollHandler = onScroll;
    }
  }

  connect();
  window.__nav_progressConnect = connect;
})();

(function () {
  const fmt = (d) => {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}/${dd}/${d.getFullYear()}`;
  };

  // function createEl(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; }

  function createEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (tag === "button") el.type = "button"; // 👈 ADD THIS LINE
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }

  class OLSDateRange {
    constructor({
      anchor,
      inputStart,
      inputEnd,
      min = new Date(),
      max = null,
    }) {
      this.anchor = anchor; // element to position under (we'll use #checkin)
      this.inputStart = inputStart;
      this.inputEnd = inputEnd;
      this.min = new Date(min.getFullYear(), min.getMonth(), min.getDate());
      this.max =
        max ||
        new Date(
          this.min.getFullYear() + 2,
          this.min.getMonth(),
          this.min.getDate()
        ); // +2y
      this.view = new Date(this.min.getFullYear(), this.min.getMonth(), 1);
      this.start = null;
      this.end = null;
      this.hover = null;

      this.build();
      this.attach();
    }

    build() {
      this.wrap = createEl("div", "ols-dp");
      this.header = createEl("div", "ols-dp-header");
      const nav = createEl("div", "ols-dp-nav");
      this.prevBtn = createEl("button", "ols-dp-btn", "‹");
      this.nextBtn = createEl("button", "ols-dp-btn", "›");
      this.title = createEl("div", "ols-dp-title");
      nav.append(this.prevBtn, this.nextBtn);
      this.header.append(this.title, nav);

      this.grid = createEl("div", "ols-dp-grid");
      // DOW header
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((d) =>
        this.grid.append(createEl("div", "ols-dp-dow", d))
      );

      this.wrap.append(this.header, this.grid);
      this.render();
    }

    attach() {
      // Choose a host container to anchor/position under (the whole search bar if present)
      this.host =
        this.anchor.closest(".search-box") || this.anchor.parentElement;

      const open = (ev) => this.open(ev);
      this.inputStart.addEventListener("focus", open);
      this.inputEnd.addEventListener("focus", open);
      this.inputStart.addEventListener("click", open);
      this.inputEnd.addEventListener("click", open);

      // Close only when clicking truly outside the calendar AND the host (both inputs live there)
      this._outside = (e) => {
        if (!this.wrap.isConnected) return;
        const t = e.target;
        if (this.wrap.contains(t)) return;
        if (this.host && this.host.contains(t)) return; // <- protects both inputs & button
        this.close();
      };
    }

    open() {
      // Mount once under the host so it isn't clipped by the grid
      if (!this.wrap.isConnected) {
        (this.host || this.anchor.parentElement).appendChild(this.wrap);
        // listen with mousedown so it doesn't fire after day-click
        document.addEventListener("mousedown", this._outside, true);
      }
      const r = this.anchor.getBoundingClientRect();
      const parentR = (
        this.host || this.anchor.parentElement
      ).getBoundingClientRect();
      this.wrap.style.left = r.left - parentR.left - 10 + "px";
      this.wrap.style.top = r.bottom - parentR.top - 20 + "px";
    }

    close() {
      if (this.wrap.isConnected) this.wrap.remove();
      document.removeEventListener("mousedown", this._outside, true);
    }

    setRange(s, e) {
      if (e < s) {
        const t = s;
        s = e;
        e = t;
      }
      this.start = s;
      this.end = e;
      this.inputStart.value = fmt(s);
      this.inputEnd.value = fmt(e);
      const changeEvent = new Event("change", { bubbles: true });
      this.inputStart.dispatchEvent(changeEvent);
      this.inputEnd.dispatchEvent(changeEvent);
      this.close();
    }

    render() {
      // header title
      const monthName = this.view.toLocaleString(undefined, { month: "long" });
      this.title.textContent = `${monthName} ${this.view.getFullYear()}`;

      // month days
      // clear previous day cells (keep first 7 DOW headers)
      while (this.grid.children.length > 7)
        this.grid.removeChild(this.grid.lastChild);

      const first = new Date(this.view.getFullYear(), this.view.getMonth(), 1);
      const startIdx = first.getDay();
      const daysInMonth = new Date(
        this.view.getFullYear(),
        this.view.getMonth() + 1,
        0
      ).getDate();

      // leading blanks from previous month
      for (let i = 0; i < startIdx; i++) {
        this.grid.append(createEl("div"));
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(this.view.getFullYear(), this.view.getMonth(), d);
        const cell = createEl("div", "ols-dp-day", String(d));

        if (date < this.min || date > this.max) cell.classList.add("disabled");

        // out-of-month (not needed here because we only show one month), kept for style parity
        // range styling
        const inRange =
          this.start && this.end && date >= this.start && date <= this.end;
        if (inRange) cell.classList.add("in-range");
        if (this.start && date.getTime() === this.start.getTime())
          cell.classList.add("start");
        if (this.end && date.getTime() === this.end.getTime())
          cell.classList.add("end");

        // hover preview
        cell.addEventListener("mouseenter", () => {
          this.hover = date;
          this.paintPreview();
        });

        cell.addEventListener("click", () => {
          if (!this.start || (this.start && this.end)) {
            // (re)start
            this.start = date;
            this.end = null;
            this.hover = null;
            this.inputStart.value = fmt(date);
            this.inputEnd.value = "";
            this.render();
          } else {
            // finish
            this.setRange(this.start, date);
          }
        });

        this.grid.append(cell);
      }

      // nav buttons
      this.prevBtn.onclick = () => {
        this.view = new Date(
          this.view.getFullYear(),
          this.view.getMonth() - 1,
          1
        );
        this.render();
      };
      this.nextBtn.onclick = () => {
        this.view = new Date(
          this.view.getFullYear(),
          this.view.getMonth() + 1,
          1
        );
        this.render();
      };
    }

    paintPreview() {
      // Re-render quickly to apply hover preview range
      const cells = [...this.grid.querySelectorAll(".ols-dp-day")];
      // clear classes
      cells.forEach((c) => c.classList.remove("in-range", "start", "end"));
      const year = this.view.getFullYear(),
        month = this.view.getMonth();
      cells.forEach((c, idx) => {
        // skip the first 7 DOW headers (already excluded)
        const day = Number(c.textContent);
        const date = new Date(year, month, day);
        if (this.start && !this.end && this.hover) {
          const a = this.start < this.hover ? this.start : this.hover;
          const b = this.start < this.hover ? this.hover : this.start;
          if (date >= a && date <= b) c.classList.add("in-range");
          if (date.getTime() === this.start.getTime()) c.classList.add("start");
          if (date.getTime() === this.hover.getTime()) c.classList.add("end");
        } else {
          if (this.start && this.end && date >= this.start && date <= this.end)
            c.classList.add("in-range");
          if (this.start && date.getTime() === this.start.getTime())
            c.classList.add("start");
          if (this.end && date.getTime() === this.end.getTime())
            c.classList.add("end");
        }
      });
    }
  }

  // ===== INIT (call after SPA page load) =====
  window.initOLSDatePicker = function () {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const wrappers = document.querySelectorAll("[data-ols-date-range]");
    if (wrappers.length) {
      wrappers.forEach((wrapper) => {
        if (wrapper.__olsDatePickerInitialized) return;
        const checkin = wrapper.querySelector("[data-ols-checkin]");
        const checkout = wrapper.querySelector("[data-ols-checkout]");
        if (!checkin || !checkout) return;

        new OLSDateRange({
          anchor: checkin,
          inputStart: checkin,
          inputEnd: checkout,
          min: today,
        });

        wrapper.__olsDatePickerInitialized = true;
      });
      return;
    }

    const checkin = document.getElementById("checkin");
    const checkout = document.getElementById("checkout");
    if (!checkin || !checkout) return;

    new OLSDateRange({
      anchor: checkin,
      inputStart: checkin,
      inputEnd: checkout,
      min: today,
    });
  };

  // Auto-run now if elements already present
  if (document.getElementById("checkin")) window.initOLSDatePicker();

  // If you have a SPA route hook, call window.initOLSDatePicker() after injecting the home page.
})();

/* =========================
   Router boot (page.js)
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  // Define routes
  page("/", () => loadPage("home"));
  page("/about", () => loadPage("about"));
  page("/contactus", () => loadPage("contactus"));
  page("/destination", () => loadPage("destination"));
  page("/accomdation", () => loadPage("accomdation"));
  page("/termsandcond", () => loadPage("termsandcond"));
  page("/privacypolicy", () => loadPage("privacypolicy"));
  page("/cancellation", () => loadPage("cancellation"));
  page("/USCAPP", () => loadPage("USCAPP"));
  page("/properties-antwerp", () => loadPage("properties-antwerp"));
  page("/properties-dubai", () => loadPage("properties-dubai"));
  page("/properties-redondo", () => loadPage("properties-redondo"));
  page("/properties-losangeles", () => loadPage("properties-losangeles"));
  page("/properties-miami", () => loadPage("properties-miami"));

  // New city routes
  page("/miami", () => loadPage("miami"));
  page("/antwerp", () => loadPage("antwerp"));
  page("/antwerpProp", () => loadPage("antwerpProp")); // detail route (fragment)
  page("/dubaiProp", () => loadPage("dubaiProp")); // detail route (fragment)
  page("/redondoProp", () => loadPage("redondoProp")); // detail route (fragment)
  page("/losangelesProp", () => loadPage("losangelesProp")); // detail route (fragment)
  page("/miamiProp", () => loadPage("miamiProp")); // detail route (fragment)
  page("/hollywoodProp", () => loadPage("hollywoodProp")); // detail route (fragment)

  page("/dubai", () => loadPage("dubai"));

  page("/redondo", () => loadPage("redondo"));

  // Antwerpen Units
  page("/diamond-district", () => loadPage("diamond-district"));
  page("/fashion-district", () => loadPage("fashion-district"));
  page("/central-signature", () => loadPage("central-signature"));
  page("/city-centre", () => loadPage("city-centre"));

  // Los Angeles Units
  page("/losangeles", () => loadPage("losangeles"));
  page("/hwh-suites", () => loadPage("hwh-suites"));
  page("/dodgers-stadium", () => loadPage("dodgers-stadium"));
  page("/lachinatown", () => loadPage("lachinatown"));
  page("/hollywood", () => loadPage("hollywood"));

  page("/privacypolicy", () => loadPage("privacypolicy"));

  page("/reservations", () => loadPage("reservations"));
  page("/properties-list", () => loadPage("properties-list"));

  // Fort Lauderdale
  page("/fort-lauderdale", () => loadPage("fort-lauderdale"));

  page("/360", () => loadPage("360"));

  // Redirect /index.html to /
  if (location.pathname === "/index.html") {
    page.redirect("/");
  }

  // Start the router
  page();

  // Force router to render the current path immediately
  page.replace(location.pathname);

  // Handle internal link clicks to prevent full reload (SPA navigation)
  document.addEventListener("click", (e) => {
    const target = e.target.closest("a");
    if (!target) return;

    // Do not hijack if:
    if (
      target.hasAttribute("download") ||
      target.getAttribute("target") === "_blank" ||
      target.getAttribute("rel")?.includes("external") ||
      target.dataset.external === "true"
    )
      return;

    const href = target.getAttribute("href") || "";
    const isSameOrigin = target.origin === location.origin;

    if (href.startsWith("#")) {
      e.preventDefault();
      const section = document.querySelector(href);
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    if (isSameOrigin && href.startsWith("/")) {
      e.preventDefault();
      page.show(href);
    }
  });

  // Disable right-click on videos
  const videos = document.querySelectorAll("video");
  videos.forEach((video) => {
    video.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
  });

  initMenuToggle();
  bookingFormInit();
  // newBookingFormInit();
  initTypeOnScroll();
});

/* =========================
   Icons (Feather)
   ========================= */
function ensureFeather() {
  try {
    if (
      typeof feather !== "undefined" &&
      typeof feather.replace === "function"
    ) {
      feather.replace();
    } else {
      setTimeout(ensureFeather, 200);
    }
  } catch (err) {
    console.warn("Feather replace failed:", err);
  }
}

/* =========================
   Typing effect on scroll
   ========================= */
function initTypeOnScroll() {
  const els = document.querySelectorAll(".type-title");
  if (!els.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        if (el.dataset.typed === "true") {
          observer.unobserve(el);
          return;
        }
        const full = (el.dataset.typedText || el.textContent || "").trim();
        if (!full) return;
        el.dataset.typed = "true";
        el.dataset.typedText = full;
        el.textContent = "";
        el.classList.add("typing");
        let i = 0;
        const step = () => {
          if (i <= full.length) {
            el.textContent = full.slice(0, i);
            i += 1;
            setTimeout(step, 24);
          } else {
            el.classList.remove("typing");
            el.classList.add("typed-done");
            observer.unobserve(el);
          }
        };
        step();
      });
    },
    { threshold: 0.6 }
  );

  els.forEach((el) => observer.observe(el));
}

/* =========================
   Panorama (Marzipano)
   ========================= */
// function initPanoramaIfPresent() {
//   const panoElement = document.getElementById("pano");
//   if (!panoElement) return;

//   if (!panoElement.style.height) panoElement.style.height = "100vh";

//   if (window.__marzViewer) {
//     try {
//       window.__marzViewer.destroy();
//     } catch (e) {}
//     window.__marzViewer = null;
//   }

//   initPanorama();
// }

// function initPanorama() {
//   const panoElement = document.getElementById("pano");
//   const viewer = new Marzipano.Viewer(panoElement);

//   const limiter = Marzipano.RectilinearView.limit.traditional(
//     1024,
//     (100 * Math.PI) / 140
//   );

//   const view = new Marzipano.RectilinearView(
//     { yaw: 0, pitch: 0, fov: 90 },
//     limiter
//   );

//   const sourceHallway = Marzipano.ImageUrlSource.fromString(
//     "https://res.cloudinary.com/dajua7tff/image/upload/v1762272139/hallway_ss0iqk.jpg"
//   );
//   const geometry = new Marzipano.EquirectGeometry([{ width: 4000 }]);

//   const sceneHallway = viewer.createScene({
//     source: sourceHallway,
//     geometry,
//     view,
//     pinFirstLevel: true,
//   });

//   const sourceLivingRoom = Marzipano.ImageUrlSource.fromString(
//     "https://res.cloudinary.com/dajua7tff/image/upload/v1762342451/living-room_hgq0gn.jpg"
//   );
//   const sceneLivingRoom = viewer.createScene({
//     source: sourceLivingRoom,
//     geometry,
//     view,
//     pinFirstLevel: true,
//   });

//   const sourceRoom1 = Marzipano.ImageUrlSource.fromString(
//     "https://res.cloudinary.com/dajua7tff/image/upload/v1762272152/livingroom_vbchtq.jpg"
//   );
//   const sceneRoom1 = viewer.createScene({
//     source: sourceRoom1,
//     geometry,
//     view,
//     pinFirstLevel: true,
//   });

//   const sourceRoom2 = Marzipano.ImageUrlSource.fromString(
//     "https://res.cloudinary.com/dajua7tff/image/upload/v1762344172/room2_dx8tw4.jpg"
//   );
//   const sceneRoom2 = viewer.createScene({
//     source: sourceRoom2,
//     geometry,
//     view,
//     pinFirstLevel: true,
//   });

//   const sourceElevator = Marzipano.ImageUrlSource.fromString(
//     "https://res.cloudinary.com/dajua7tff/image/upload/v1762342500/elevground_y6ln1g.jpg"
//   );
//   const sceneElevator = viewer.createScene({
//     source: sourceElevator,
//     geometry,
//     view,
//     pinFirstLevel: true,
//   });

//   const sourceLobby = Marzipano.ImageUrlSource.fromString(
//     "/assets/livingroom.jpg"
//   );
//   const sceneLobby = viewer.createScene({
//     source: sourceLobby,
//     geometry,
//     view,
//     pinFirstLevel: true,
//   });

//   const sourcePool = Marzipano.ImageUrlSource.fromString(
//     "https://res.cloudinary.com/dajua7tff/image/upload/v1762342501/pool_rd5eew.jpg"
//   );
//   const scenePool = viewer.createScene({
//     source: sourcePool,
//     geometry,
//     view,
//     pinFirstLevel: true,
//   });

//   function createHotspot(scene, yaw, pitch, text, targetScene) {
//     const hotspotElement = document.createElement("div");
//     hotspotElement.classList.add("hotspot-tooltip");
//     hotspotElement.innerHTML = `<span>${text}</span>`;
//     hotspotElement.onclick = () =>
//       targetScene.switchTo({ transitionDuration: 1000 });
//     scene.hotspotContainer().createHotspot(hotspotElement, { yaw, pitch });
//   }

//   createHotspot(
//     sceneHallway,
//     0.7,
//     0,
//     "Go to Living Room Unit 517",
//     sceneLivingRoom
//   );
//   createHotspot(sceneLivingRoom, 2.2, 0, "Back to Hallway", sceneHallway);
//   createHotspot(sceneLivingRoom, 0.6, 0, "Go to Room 1", sceneRoom1);
//   createHotspot(sceneRoom1, 2.9, 0, "Go to Living Room", sceneLivingRoom);
//   createHotspot(sceneLivingRoom, 0.4, 0, "Go to Room 2", sceneRoom2);
//   createHotspot(sceneRoom2, 2.5, 0, "Go to Living Room", sceneLivingRoom);
//   createHotspot(sceneHallway, 0, 0, "Go to Ground Floor", sceneElevator);
//   createHotspot(
//     sceneElevator,
//     -1.6,
//     0,
//     "Go to 5th floor Hallway",
//     sceneHallway
//   );
//   createHotspot(sceneElevator, 0, 0, "Go to Lobby", sceneLobby);
//   createHotspot(sceneLobby, 0, 0, "Go to Elevator", sceneElevator);
//   createHotspot(sceneLobby, 4, 0, "Go to Pool Side", scenePool);
//   createHotspot(scenePool, 0.7, 0, "Go to Lobby", sceneLobby);

//   sceneLobby.switchTo();
// }

/* =========================
   Signature Suites Carousel (Home)
   ========================= */
function initUnitsCarousel() {
  const track = document.getElementById("units-track");
  if (!track) return;
  if (track.dataset.built === "true") return;

  const fallbackImg =
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1600&q=80";

  const toCard = (p) => {
    const title = p.title || p.name || "Signature Suite";
    const city =
      (p.location && (p.location.city || p.location.neighborhood)) ||
      p.city ||
      "";
    const id = p.id || title.toLowerCase().replace(/\s+/g, "-");
    const image =
      (p.images && p.images[0]) || (p.media && p.media[0]) || fallbackImg;
    const summary =
      p.summary ||
      p.description ||
      "Curated suite with concierge service and designer finishes.";
    const cityLower = city.toLowerCase();
    let detailLink = "/properties-list";
    if (cityLower.includes("los angeles"))
      detailLink = `/losangelesProp?id=${encodeURIComponent(id)}`;
    else if (cityLower.includes("hollywood"))
      detailLink = `/hollywoodProp?id=${encodeURIComponent(id)}`;
    else if (cityLower.includes("dubai"))
      detailLink = `/dubaiProp?id=${encodeURIComponent(id)}`;
    else if (cityLower.includes("miami"))
      detailLink = `/miamiProp?id=${encodeURIComponent(id)}`;
    else if (cityLower.includes("redondo"))
      detailLink = `/redondoProp?id=${encodeURIComponent(id)}`;
    else if (cityLower.includes("antwerp") || cityLower.includes("antwerpen"))
      detailLink = `/antwerpProp?id=${encodeURIComponent(id)}`;

    return { title, city, image, summary, detailLink };
  };

  const files = [
    "/data/properties-antwerp.json",
    "/data/properties-dubai.json",
    "/data/properties-hollywood.json",
    "/data/properties-losangeles.json",
    "/data/properties-miami.json",
    "/data/properties-redondo.json",
  ];

  Promise.all(
    files.map((url) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : { properties: [] }))
        .catch(() => ({ properties: [] }))
    )
  )
    .then((jsons) => {
      const items = jsons
        .flatMap((j) => j.properties || [])
        .map(toCard)
        .filter((p) => p.image && p.title);
      if (!items.length) return;

      const sample = items.slice(0, 40);

      const render = (data) => {
        const frag = document.createDocumentFragment();
        data.forEach((p) => {
          const card = document.createElement("article");
          card.className = "unit-slide";
          card.innerHTML = `
            <div class="unit-media" style="background-image:url('${
              p.image
            }')"></div>
            <div class="unit-body">
              <div class="pill-row">
                <span class="pill">${p.city || "One Lux Stay"}</span>
                <span class="sparkle" aria-hidden="true">✦</span>
              </div>
              <h3>${p.title}</h3>
              <p class="unit-summary" data-full="${p.summary}">${p.summary}</p>
              <div class="unit-actions">
                <a class="btn btn-primary" href="${
                  p.detailLink
                }" data-link>View</a>
                <a class="btn btn-ghost" href="/properties-list" data-link>All listings</a>
                <button class="btn btn-ghost btn-see-more" type="button">See more</button>
              </div>
            </div>
          `;
          frag.appendChild(card);
        });
        return frag;
      };

      track.appendChild(render(sample));
      track.appendChild(render(sample)); // duplicate for marquee
      track.classList.add("is-animating");
      track.dataset.built = "true";
      track.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-see-more");
        if (!btn) return;
        const card = btn.closest(".unit-slide");
        if (!card) return;
        const expanded = card.classList.toggle("expanded");
        btn.textContent = expanded ? "See less" : "See more";
      });
    })
    .catch((err) => {
      console.warn("Failed to build units carousel:", err);
    });
}

/* =========================
   Hover Active Cards
   ========================= */
document.querySelectorAll(".grid-item").forEach((card) => {
  card.addEventListener("mouseover", () => {
    document
      .querySelectorAll(".grid-item.active")
      .forEach((prev) => prev.classList.remove("active"));
    card.classList.add("active");
  });
});

/* =========================
   Booking form (new)
   ========================= */
// function newBookingFormInit() {
//   const searchBtnNew = document.getElementById("search-btn-new");
//   const guestSelect = document.querySelector(".booking-select-guests");
//   const checkinInput = document.getElementById("checkin");
//   const checkoutInput = document.getElementById("checkout");

//   if (searchBtnNew) {
//     const newBtn = searchBtnNew.cloneNode(true);
//     searchBtnNew.parentNode.replaceChild(newBtn, searchBtnNew);
//   }

//   const btn = document.getElementById("search-btn-new");
//   if (!btn) {
//     console.log("newBookingFormInit: search button not found");
//     return;
//   }

//   const guestsVal = guestSelect ? guestSelect.value.trim() : "";
//   let minOccupancy = 1;
//   if (guestsVal) {
//     const m = guestsVal.match(/\d+/);
//     if (m) minOccupancy = parseInt(m[0], 10);
//   }

//   try {
//     if (typeof flatpickr !== "undefined") {
//       const today = new Date();
//       if (checkinInput && checkinInput._flatpickr)
//         checkinInput._flatpickr.destroy();
//       if (checkoutInput && checkoutInput._flatpickr)
//         checkoutInput._flatpickr.destroy();

//       if (checkinInput) {
//         flatpickr(checkinInput, {
//           dateFormat: "Y-m-d",
//           minDate: "today",
//           onChange(selectedDates) {
//             if (!selectedDates || selectedDates.length === 0) return;
//             const sel = selectedDates[0];
//             const nextDay = new Date(sel.getTime());
//             nextDay.setDate(nextDay.getDate() + 1);
//             if (checkoutInput && checkoutInput._flatpickr) {
//               checkoutInput._flatpickr.set("minDate", nextDay);
//               const currentCheckout = checkoutInput._flatpickr.selectedDates[0];
//               if (currentCheckout && currentCheckout <= sel) {
//                 checkoutInput._flatpickr.clear();
//               }
//             }
//           },
//         });
//       }

//       if (checkoutInput) {
//         flatpickr(checkoutInput, {
//           dateFormat: "Y-m-d",
//           minDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
//         });
//       }
//     } else {
//       console.warn(
//         "Flatpickr not found. Date inputs will behave as native inputs (if present)."
//       );
//     }
//   } catch (err) {
//     console.error("Error initializing flatpickr:", err);
//   }

//   function buildReservationsUrl() {
//     const dest = (destinationSelect?.value || "").trim();
//     const guestsVal = (guestSelect?.value || "").trim();
//     const roomVal = (roomSelect?.value || "").trim();

//     const minOccupancy = Math.max(
//       1,
//       parseInt((guestsVal.match(/\d+/) || [1])[0], 10) || 1
//     );
//     const minRooms = Math.max(
//       1,
//       parseInt((roomVal.match(/\d+/) || [1])[0], 10) || 1
//     );

//     const checkin = checkinInput?.value || "";
//     const checkout = checkoutInput?.value || "";

//     if (checkinInput || checkoutInput) {
//       if (!checkin) {
//         showNotification?.("Please select a check-in date.");
//         checkinInput?.focus();
//         return null;
//       }
//       if (!checkout) {
//         showNotification?.("Please select a check-out date.");
//         checkoutInput?.focus();
//         return null;
//       }
//       const ci = new Date(checkin + "T00:00:00");
//       const co = new Date(checkout + "T00:00:00");
//       if (!(co > ci)) {
//         showNotification?.("Check-out must be after check-in.");
//         return null;
//       }
//     }

//     let country = "";
//     const cityLower = dest.toLowerCase();
//     if (cityLower.includes("antwerp") || cityLower.includes("antwerpen"))
//       country = "Belgium";
//     else if (cityLower.includes("dubai")) country = "United Arab Emirates";
//     else if (cityLower.includes("redondo")) country = "United States";
//     else if (dest) country = "United States";

//     let url = new URL("https://reservations.oneluxstay.com/en/properties");
//     const p = new URLSearchParams();

//     if (dest) p.set("city", dest);
//     if (country) p.set("country", country);
//     p.set("minOccupancy", String(minOccupancy));
//     p.set("numberOfBedrooms", String(minRooms));

//     if (checkin && checkout) {
//       p.set("checkIn", checkin);
//       p.set("checkOut", checkout);
//     }

//     url.search = p.toString();
//     return url.toString();
//   }

//   btn.addEventListener(
//     "click",
//     (e) => {
//       e?.preventDefault?.();
//       const url = buildReservationsUrl();
//       if (!url) return;
//       showNotification?.("Searching for available suites…");
//       setTimeout(() => {
//         window.location.href = url;
//       }, 400);
//     },
//     { signal }
//   );
// }

/* =========================
   Booking form (legacy)
   ========================= */
function bookingFormInit() {
  const btn = document.getElementById("search-btn");
  const destinationSelect = document.querySelector(
    ".booking-select-destination"
  );
  const guestSelect = document.querySelector(".booking-select-guests");
  const roomSelect = document.querySelector(".booking-select-room");
  const checkinInput = document.getElementById("checkin");
  const checkoutInput = document.getElementById("checkout");

  if (!bookingFormInit._ac) bookingFormInit._ac = new AbortController();
  else {
    bookingFormInit._ac.abort();
    bookingFormInit._ac = new AbortController();
  }
  const signal = bookingFormInit._ac.signal;

  // (function initOrLazyFlatpickr() {
  //   const ensureInstances = () => {
  //     try {
  //       if (checkinInput?.__fp) {
  //         checkinInput.__fp.destroy();
  //         checkinInput.__fp = null;
  //       }
  //       if (checkoutInput?.__fp) {
  //         checkoutInput.__fp.destroy();
  //         checkoutInput.__fp = null;
  //       }

  //       const today = new Date();
  //       if (checkinInput && window.flatpickr) {
  //         checkinInput.__fp = flatpickr(checkinInput, {
  //           dateFormat: "Y-m-d",
  //           minDate: "today",
  //           onChange(selectedDates) {
  //             if (!selectedDates?.length || !checkoutInput?.__fp) return;
  //             const sel = selectedDates[0];
  //             const nextDay = new Date(sel.getTime());
  //             nextDay.setDate(nextDay.getDate() + 1);
  //             checkoutInput.__fp.set("minDate", nextDay);

  //             const co = checkoutInput.__fp.selectedDates?.[0];
  //             if (co && co <= sel) checkoutInput.__fp.clear();
  //           },
  //         });
  //       }
  //       if (checkoutInput && window.flatpickr) {
  //         const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  //         checkoutInput.__fp = flatpickr(checkoutInput, {
  //           dateFormat: "Y-m-d",
  //           minDate: tomorrow,
  //         });
  //       }
  //     } catch (e) {
  //       console.warn("Flatpickr init failed:", e);
  //     }
  //   };

  //   if (typeof window.flatpickr !== "undefined") {
  //     ensureInstances();
  //     return;
  //   }

  //   const lazyLoad = async () => {
  //     if (initOrLazyFlatpickr._loading) return;
  //     initOrLazyFlatpickr._loading = true;

  //     const css = document.createElement("link");
  //     css.rel = "stylesheet";
  //     css.href =
  //       "https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.css";
  //     document.head.appendChild(css);

  //     await new Promise((res) => {
  //       const s = document.createElement("script");
  //       s.src =
  //         "https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js";
  //       s.onload = res;
  //       document.head.appendChild(s);
  //     });

  //     ensureInstances();
  //   };

  //   // [checkinInput, checkoutInput].forEach((el) => {
  //   //   if (!el) return;
  //   //   el.addEventListener("focus", lazyLoad, { once: true, signal });
  //   //   el.addEventListener("click", lazyLoad, { once: true, signal });
  //   // });
  // })();

  if (!btn) {
    console.log(
      "bookingFormInit: search button not found (#search-btn or #search-btn-new)"
    );
    return;
  }

  function buildReservationsUrl() {
    const dest = (destinationSelect?.value || "").trim();
    const guestsVal = (guestSelect?.value || "").trim();
    const roomVal = (roomSelect?.value || "").trim();

    const minOccupancy = Math.max(
      1,
      parseInt((guestsVal.match(/\d+/) || [1])[0], 10) || 1
    );

    const checkin = checkinInput?.value || "";
    const checkout = checkoutInput?.value || "";

    if (checkinInput || checkoutInput) {
      if (!checkin) {
        showNotification?.("Please select a check-in date.");
        checkinInput?.focus();
        return null;
      }
      if (!checkout) {
        showNotification?.("Please select a check-out date.");
        checkoutInput?.focus();
        return null;
      }
      // const ci = new Date(checkin + "T00:00:00");
      // const co = new Date(checkout + "T00:00:00");
      // if (!(co > ci)) {
      //   showNotification?.("Check-out must be after check-in.");
      //   return null;
      // }
    }

    let country = "";
    const cityLower = dest.toLowerCase();
    if (cityLower.includes("antwerp") || cityLower.includes("antwerpen"))
      country = "Belgium";
    else if (cityLower.includes("dubai")) country = "United Arab Emirates";
    else if (cityLower.includes("redondo")) country = "United States";
    else if (dest) country = "United States";

    let url = new URL("https://reservations.oneluxstay.com/en/properties");
    const p = new URLSearchParams();

    if (dest) p.set("city", dest);
    if (country) p.set("country", country);
    p.set("minOccupancy", String(minOccupancy));

    if (checkin && checkout) {
      p.set("checkIn", checkin);
      p.set("checkOut", checkout);
    }

    url.search = p.toString();
    return url.toString();
  }

  btn.addEventListener(
    "click",
    (e) => {
      e?.preventDefault?.();
      const url = buildReservationsUrl();
      if (!url) return;
      showNotification?.("Searching for available suites…");
      setTimeout(() => {
        window.location.href = url;
      }, 400);
    },
    { signal }
  );

  console.log(
    "bookingFormInit: listener attached to",
    btn.id ? `#${btn.id}` : btn
  );
}

/* =========================
   Nav scroll class toggle
   ========================= */
window.addEventListener("scroll", () => {
  const nav = document.getElementById("nav");
  if (!nav) return;
  if (window.scrollY > 50) nav.classList.add("scrolled");
  else nav.classList.remove("scrolled");
});

////////Marzipano Panorama////////
/* =========================
   Panorama (Marzipano)
   ========================= */
function initPanoramaIfPresent() {
  const panoElement = document.getElementById("pano");
  if (!panoElement) return;

  // Give it a height if none set
  if (!panoElement.style.height) panoElement.style.height = "100vh";

  // Clean up any previous viewer instance
  if (window.__marzViewer) {
    try {
      window.__marzViewer.destroy();
    } catch (e) {
      console.warn("Failed to destroy previous Marzipano viewer:", e);
    }
    window.__marzViewer = null;
  }

  initPanorama();
}

function initPanorama() {
  const panoElement = document.getElementById("pano");
  if (!panoElement) {
    console.warn("initPanorama: #pano not found.");
    return;
  }

  if (typeof Marzipano === "undefined") {
    console.warn("initPanorama: Marzipano library not loaded.");
    return;
  }

  // Read ?tour=/data/tours/xxx.json
  const params = new URLSearchParams(window.location.search);
  const tourUrl = params.get("tour");
  if (!tourUrl) {
    console.warn("initPanorama: no ?tour= parameter in URL.");
    return;
  }

  fetch(tourUrl, { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${tourUrl}`);
      return r.json();
    })
    .then((tourConfig) => {
      try {
        buildPanoramaFromConfig(panoElement, tourConfig);
      } catch (e) {
        console.error("initPanorama: failed to build tour from config:", e);
      }
    })
    .catch((err) => {
      console.error("initPanorama: failed to load tour JSON:", err);
    });
}

function buildPanoramaFromConfig(container, rawConfig) {
  const config = rawConfig || {};

  // Your JSON: { initialSceneId, initialView, scenes: [...] }
  const scenesCfg = Array.isArray(config.scenes) ? config.scenes : [];
  if (!scenesCfg.length) {
    console.error(
      "buildPanoramaFromConfig: config.scenes is empty or missing."
    );
    return;
  }

  const viewer = new Marzipano.Viewer(container);
  window.__marzViewer = viewer;

  const limiter = Marzipano.RectilinearView.limit.traditional(
    1024,
    (100 * Math.PI) / 140
  );

  const scenesById = {};

  const degToRad = (deg) =>
    typeof deg === "number" ? (deg * Math.PI) / 180 : null;

  function createSceneFromConfig(sceneCfg) {
    if (!sceneCfg || !sceneCfg.id) return null;

    // Support both "image" and your "imageUrl"
    const image = sceneCfg.image || sceneCfg.imageUrl;
    if (!image) return null;

    const width = sceneCfg.width || sceneCfg.size || 4000;

    // Use per-scene initialView if present, else fall back to global initialView
    const baseInitial = sceneCfg.initialView || config.initialView || {};
    let fov = baseInitial.fov;

    // If fov looks like degrees (e.g. 90), convert to radians
    if (typeof fov === "number") {
      if (fov > 10) {
        fov = degToRad(fov); // assume degrees
      }
    } else {
      fov = Math.PI / 2; // default ~90°
    }

    const view = new Marzipano.RectilinearView(
      {
        yaw: baseInitial.yaw ?? 0,
        pitch: baseInitial.pitch ?? 0,
        fov,
      },
      limiter
    );

    const source = Marzipano.ImageUrlSource.fromString(image);
    const geometry = new Marzipano.EquirectGeometry([{ width }]);

    const scene = viewer.createScene({
      source,
      geometry,
      view,
      pinFirstLevel: true,
    });

    // Support both "hotspots" and your "linkHotspots"
    const hotspots = sceneCfg.hotspots || sceneCfg.linkHotspots || [];
    hotspots.forEach((hs) => {
      if (!hs || typeof hs.yaw !== "number" || typeof hs.pitch !== "number") {
        return;
      }

      const targetSceneId = hs.target;
      const label = hs.label || "Go";

      const hotspotElement = document.createElement("div");
      hotspotElement.classList.add("hotspot-tooltip");
      hotspotElement.innerHTML = `<span>${label}</span>`;

      hotspotElement.onclick = () => {
        const targetScene = scenesById[targetSceneId];
        if (targetScene) {
          targetScene.switchTo({ transitionDuration: 1000 });
        }
      };

      scene.hotspotContainer().createHotspot(hotspotElement, {
        yaw: hs.yaw,
        pitch: hs.pitch,
      });
    });

    return scene;
  }

  // Create all scenes
  scenesCfg.forEach((sceneCfg) => {
    const scene = createSceneFromConfig(sceneCfg);
    if (scene) {
      scenesById[sceneCfg.id] = scene;
    }
  });

  const sceneIds = Object.keys(scenesById);
  if (!sceneIds.length) {
    console.error(
      "buildPanoramaFromConfig: no valid scenes could be created from config."
    );
    return;
  }

  // Start scene: use your "initialSceneId" if valid, else default to first
  let startId = config.startScene || config.initialSceneId;
  if (!startId || !scenesById[startId]) {
    startId = sceneIds[0];
  }

  scenesById[startId].switchTo();
}

/**
 * Fetch a tour JSON file and initialize the panorama.
 */
function loadTourAndInitPanorama(jsonUrl) {
  const panoElement = document.getElementById("pano");
  if (!panoElement) return;

  fetch(jsonUrl)
    .then((res) => {
      if (!res.ok) {
        throw new Error("Failed to load tour JSON: " + res.status);
      }
      return res.json();
    })
    .then((tourData) => {
      initPanorama(tourData);

      // If your 360° viewer is inside a modal, you can open it here, e.g.:
      // document.querySelector("#pano-modal")?.classList.add("open");
    })
    .catch((err) => {
      console.error("Error loading Marzipano tour:", err);
    });
}

/**
 * Keep this helper, but now it will auto-load a tour JSON
 * if the #pano element has data-tour-json attribute.
 */

// Global handler for "View unit" virtual tour buttons
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tour-json]");
  if (!btn) return;

  const jsonUrl = btn.getAttribute("data-tour-json");
  if (!jsonUrl) return;

  e.preventDefault();

  // If you need to open a modal first, do it here:
  // document.querySelector("#pano-modal")?.classList.add("open");

  loadTourAndInitPanorama(jsonUrl);
});
