// Load page content into the #app container
function loadPage(pageName) {
  const app = document.getElementById("app");
  app.style.opacity = 0;

  fetch(`/pages/${pageName}.html`)
    .then(res => res.text())
    .then(html => {
      setTimeout(() => {
        app.innerHTML = html;
        app.style.opacity = 1;
        window.scrollTo(0, 0);

        // Re-init menu toggle in case page navigation changes elements
        initMenuToggle();
      }, 150);
    });
}

// Initialize hamburger menu toggle
function initMenuToggle() {
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  if (menuToggle && navLinks) {
    // Toggle menu on button click
    menuToggle.onclick = () => {
      navLinks.classList.toggle("active");
      console.log("Toggled menu");
    };

    // Auto-close when a link is clicked
    navLinks.querySelectorAll("a").forEach(link => {
      link.onclick = () => {
        navLinks.classList.remove("active");
      };
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Define routes
  page("/", () => loadPage("home"));
  page("/about", () => loadPage("about"));
  page("/contactus", () => loadPage("contactus"));
  page("/destination", () => loadPage("destination"));
  page("/accomdation", () => loadPage("accomdation"));
  page("/termsandconditions", () => loadPage("termsandcond"));
  page("/privacypolicy", () => loadPage("privacypolicy"));
  page("/cancellation", () => loadPage("cancellation"));
  page("/USCAPP", () => loadPage("USCAPP"));
  page("/360", () => loadPage("360"));

  // New city routes
  page("/miami", () => loadPage("miami"));
  page("/antwerp", () => loadPage("antwerp"));
  page("/dubai", () => loadPage("dubai"));
  page("/losangeles", () => loadPage("losangeles"));

  // Redirect /index.html to /
  if (location.pathname === "/index.html") {
    page.redirect("/");
  }

  // Start the router
  page();

  // Handle internal link clicks to prevent full reload
  document.addEventListener("click", (e) => {
    const target = e.target.closest("a");
    if (target && target.href.startsWith(location.origin)) {
      e.preventDefault();
      const href = target.getAttribute("href");
      page.show(href);
    }
  });


});



page('/360', () => {
  // Load 360.html content into <main>
  fetch('/pages/360.html')
    .then(res => res.text())
    .then(html => {
      document.getElementById('main').innerHTML = html;

      // Wait a tiny bit to ensure content is rendered before initializing Marzipano
      setTimeout(initPanorama, 50);
    });
});

// Start router
page();

// Initialize Marzipano
function initPanorama() {
  const panoElement = document.getElementById('pano');
  if (!panoElement) return;

  const viewer = new Marzipano.Viewer(panoElement);
  const source = Marzipano.ImageUrlSource.fromString('../assets/hallway.jpg'); // adjust path if needed
  const geometry = new Marzipano.EquirectGeometry([{ width: 4000 }]);
  const view = new Marzipano.RectilinearView();
  const scene = viewer.createScene({ source, geometry, view });
  scene.switchTo();
}
