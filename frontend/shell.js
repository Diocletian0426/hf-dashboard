/* =============================================================================
   HF Dashboard — SHARED SHELL (nav bar + login guard + page access tiers)
   =============================================================================
   Every page (except login.html) includes this AFTER the engine and has:
     <header id="nav"></header>   <- the nav bar is injected here
     <main id="main"> ... </main> <- replaced with a notice if access is denied

   PAGE ACCESS TIERS (by staff.designation, via Dash.getMyProfile()):
     - Pages NOT listed in PAGE_ACCESS are visible to every signed-in account.
     - Pages listed are visible ONLY to the named designations.
     - An account not linked to a staff record gets the unlisted pages only,
       plus a visible "not linked" notice.
   NOTE: for view-only pages this is a convenience layer — the real lock is in
   the database (grants + RLS). Write actions get their own database-side
   designation checks when they arrive.
   ============================================================================= */
(function () {
  "use strict";

  var NAV_LINKS = [
    { href: "index.html",      label: "Overview"   },
    { href: "projects.html",   label: "Progress"   },
    { href: "issues.html",     label: "Issues"     },
    { href: "machines.html",   label: "Machines"   },
    { href: "attendance.html", label: "Attendance" },
    { href: "leave.html",      label: "Leave"      },
    { href: "tests.html",      label: "Tests"      }
  ];

  // page -> designations allowed. Unlisted page = everyone signed in.
  var PAGE_ACCESS = {
    "leave.html": ["management", "office"]
  };
  // piles.html rides with projects.html (reached from there, unlisted = open).

  function currentPage() {
    var p = window.location.pathname.split("/").pop();
    return p && p.length ? p : "index.html";
  }

  function allowed(page, profile) {
    var list = PAGE_ACCESS[page];
    if (!list) return true;                       // unlisted = everyone
    if (!profile) return false;                   // unlinked account = lowest tier
    return list.indexOf(profile.designation) !== -1;
  }

  async function boot() {
    var user = await Dash.requireLogin();
    if (!user) return;                            // redirecting to login.html

    var profile = await Dash.getMyProfile();
    var page = currentPage();

    // ---- build the nav bar ----
    var nav = document.getElementById("nav");
    if (nav) {
      var links = NAV_LINKS
        .filter(function (l) { return allowed(l.href, profile); })
        .map(function (l) {
          var active = (l.href === page || (page === "piles.html" && l.href === "projects.html"));
          return '<a href="' + l.href + '"' + (active ? ' class="active"' : "") + ">" + l.label + "</a>";
        })
        .join("");

      var who = profile
        ? profile.full_name + ' <span class="muted">(' + profile.designation + ")</span>"
        : (user.email || "signed in");

      nav.innerHTML =
        '<div class="nav-inner">' +
          '<span class="brand">HF Dashboard</span>' +
          '<nav class="nav-links">' + links + "</nav>" +
          '<span class="nav-user">' + who +
            ' <button id="signout-btn" class="btn-plain">Sign out</button>' +
          "</span>" +
        "</div>" +
        (profile ? "" :
          '<div class="banner banner-amber">This login is not linked to a staff record yet — ' +
          "ask the office to link it (page access stays limited until then).</div>");

      document.getElementById("signout-btn").addEventListener("click", function () {
        Dash.signOut();
      });
    }

    // ---- gate the page body ----
    if (!allowed(page, profile)) {
      var main = document.getElementById("main");
      if (main) {
        main.innerHTML =
          '<div class="banner banner-red">Your account does not have access to this page.</div>';
      }
      return;
    }

    // page scripts hook their loading here (runs only when access is allowed)
    if (typeof window.onShellReady === "function") window.onShellReady(profile);
  }

  // never fail silently — paint any startup error onto the page
  boot().catch(function (e) {
    var main = document.getElementById("main");
    if (main) {
      main.innerHTML =
        '<div class="banner banner-red">Dashboard failed to start: ' +
        (e && e.message ? e.message : e) +
        "<br>Try a hard refresh (Ctrl+F5). If it persists, send this message to the office.</div>";
    }
  });
})();
