/* =============================================================================
   HF Dashboard — SHARED SHELL (left rail + login guard + page access gates)
   =============================================================================
   Every page (except login.html) includes this AFTER the engine and has:
     <header id="nav"></header>   <- the rail + top bar are injected here
     <main id="main"> ... </main> <- replaced with a notice if access is denied

   What gets injected:
     .rail    — fixed left column: brand, the primary links, sign out
     .topbar  — to the rail's right: burger (phones), global site search,
                account menu
     .ctxbar  — ONLY on project-scoped pages (project/piles/claims):
                "Projects › [project switcher]  Hub | Piles | Claims"

   PAGE ACCESS (permissions, via Dash.getMyAccess() / Dash.can()):
     - PAGE_ACCESS maps every page to the permission that opens it.
     - DEFAULT-CLOSED: a page not listed is refused for everyone.
     - Before migration 0062 (legacy mode) the old designation rule is
       reproduced exactly, so shipping this frontend ahead of the database
       work changes nothing anyone can see.
   NOTE: for view-only pages this is a convenience layer — the real lock is in
   the database (grants + RLS). Write actions get their own database-side
   permission checks.

   This file deliberately does NOT use window.UI — attendance.html (owned by
   the attendance collaborator, never edited here) loads shell without ui.js.
   ============================================================================= */
(function () {
  "use strict";

  // Rail icons: hand-drawn 24x24 strokes. shell.js must stay dependency-free
  // (attendance.html loads it WITHOUT ui.js), so they live here, not in UI.
  var ICONS = {
    overview:   '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/>' +
                '<rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    projects:   '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.4h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
    issues:     '<path d="M12 4.6 20.6 19.5H3.4z"/><path d="M12 10v4.2"/><path d="M12 17.2v.4"/>',
    machines:   '<rect x="2.6" y="12.6" width="10" height="6" rx="1.5"/><path d="M12.6 15.2h3.6l3-5.6"/>' +
                '<path d="M19.2 9.6h2.2"/><circle cx="6" cy="20.4" r="1.4"/><circle cx="15.6" cy="20.4" r="1.4"/>',
    manpower:   '<circle cx="9" cy="7.4" r="3"/><path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5"/>' +
                '<circle cx="17.2" cy="9" r="2.2"/><path d="M17.2 13.4c2.3 0 4.2 1.9 4.2 4.2"/>',
    attendance: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17"/>' +
                '<path d="M8 3.5v3M16 3.5v3"/><path d="M8.8 14.6l2 2 3.6-3.8"/>',
    tests:      '<path d="M9.5 3.5v6.2L4.7 18a1.6 1.6 0 0 0 1.4 2.5h11.8a1.6 1.6 0 0 0 1.4-2.5l-4.8-8.3V3.5"/>' +
                '<path d="M8.6 3.5h6.8"/><path d="M7.6 14.5h8.8"/>',
    // a core sample with its strata lines — the bore log itself
    borelogs:   '<rect x="7" y="3.5" width="10" height="17" rx="2"/>' +
                '<path d="M7 8.5h10M7 12.5h10M7 16.5h10"/>',
    // an ID card — accounts and what each one may do
    users:      '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10.5" r="2.2"/>' +
                '<path d="M5.8 16.5c0-1.8 1.4-3.2 3.2-3.2s3.2 1.4 3.2 3.2"/><path d="M14.5 9.5h4M14.5 13h4"/>',
    signout:    '<path d="M14.5 8V5.5A1.5 1.5 0 0 0 13 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H13a1.5 1.5 0 0 0 1.5-1.5V16"/>' +
                '<path d="M9.5 12h11"/><path d="M17.5 8.8 20.7 12l-3.2 3.2"/>',
    search:     '<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8 20.5 20.5"/>'
  };
  function icon(name) {
    return '<svg class="ric" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  var NAV_LINKS = [
    { href: "index.html",      label: "Overview",   icon: "overview"   },
    { href: "projects.html",   label: "Projects",   icon: "projects"   },
    { href: "issues.html",     label: "Issues",     icon: "issues"     },
    { href: "machines.html",   label: "Machines",   icon: "machines"   },
    { href: "manpower.html",   label: "Manpower",   icon: "manpower"   },
    { href: "attendance.html", label: "Attendance", icon: "attendance" },
    // leave.html stays in PAGE_ACCESS but is out of the nav until the page
    // is actually built (owner decision — leave UI deferred)
    { href: "tests.html",      label: "Tests",      icon: "tests"      },
    { href: "bore-logs.html",  label: "Bore Logs",  icon: "borelogs"   },
    // only appears for logins holding users.view (the allowed() filter below)
    { href: "users.html",      label: "Users",      icon: "users"      }
  ];

  // page -> the permission needed to open it.
  //
  // DEFAULT-CLOSED. Every page must be listed. A page that is not listed is
  // refused, which is the opposite of how this used to work: unlisted meant
  // "visible to everyone", so each new page was exposed to every signed-in
  // account until somebody remembered to come back here.
  //
  // The database re-checks every read and write regardless (migrations
  // 0059-0066). This map decides what is worth showing, not what is allowed.
  var PAGE_ACCESS = {
    "index.html":      "overview.view",
    "projects.html":   "projects.view",
    "project.html":    "projects.view",
    "piles.html":      "piles.view",
    "issues.html":     "issues.view",
    "machines.html":   "machines.view",
    "manpower.html":   "manpower.view",
    "attendance.html": "attendance.view",
    "tests.html":      "tests.view",
    "bore-logs.html":  "bore_logs.view",  // inbox + the review screen (?id=…)
    "claims.html":     "claims.view",     // MONEY — the DB re-checks every call too
    "leave.html":      "leave.view",
    "users.html":      "users.view",      // admin — writes carry their own DB gates
    "roles.html":      "users.view"       // read-only reference, reached from users.html
  };

  // project-scoped pages: they get the context bar and light up "Projects"
  var PROJECT_PAGES = {
    "project.html": "Hub",
    "piles.html":   "Piles",
    "claims.html":  "Claims"
  };

  // tiny local copy (shell must not depend on ui.js — see header).
  // Covers the legacy staff designations AND the access profiles from migration
  // 0059, because either can arrive here depending on whether the database work
  // has been applied yet. Anything unrecognised is sentence-cased rather than
  // shown as a raw code.
  var DESIG_LABELS = {
    // legacy staff.designation values
    management: "Management", office: "Office",
    site_supervisor: "Site Supervisor", site: "Site Crew",
    // access profiles (0059)
    super_admin: "Super Administrator", admin: "Administrator",
    qs: "Quantity Surveyor", project_manager: "Project Manager",
    supervisor: "Site Supervisor", viewer: "Viewer (read only)",
    external_viewer: "External — assigned sites only"
  };
  function desigLabel(d) {
    if (!d) return "";
    if (DESIG_LABELS[d]) return DESIG_LABELS[d];
    var s = String(d).replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function escText(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function currentPage() {
    var p = window.location.pathname.split("/").pop();
    return p && p.length ? p : "index.html";
  }

  // `acc` is the verdict from Dash.getMyAccess(), not a bare profile.
  function allowed(page, acc) {
    // no account, or we could not find out: show nothing. An account with no
    // confirmed permissions must see no company information.
    if (!acc || !acc.ok) return false;

    var a = acc.access;
    if (a.status !== "active") return false;

    // Before migration 0062 there is no permission list to consult, so
    // reproduce the OLD rule exactly. That way shipping this frontend ahead of
    // the database work changes nothing anyone can see.
    if (a.legacy) {
      if (page === "claims.html" || page === "leave.html") return !!a.legacy_is_office;
      return true;
    }

    var perm = PAGE_ACCESS[page];
    if (!perm) return false;                      // DEFAULT-CLOSED: unlisted = refused
    return Dash.can(perm);
  }

  function initialsOf(profile, user) {
    var name = profile && profile.full_name ? profile.full_name : (user && user.email) || "?";
    var parts = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(function (w) { return w.length; });
    if (!parts.length) return "?";
    var out = parts[0].charAt(0);
    if (parts.length > 1) out += parts[1].charAt(0);
    return out.toUpperCase();
  }

  /* ---- the project context bar (project-scoped pages only) ---- */

  function buildCtxBar(page, acc) {
    var projectId = new URLSearchParams(window.location.search).get("project") || "";

    var tabs = "";
    if (projectId) {
      tabs = Object.keys(PROJECT_PAGES).map(function (p) {
        // was a second, hand-maintained copy of the money rule; now the same
        // one check every other page uses
        if (!allowed(p, acc)) return "";
        var active = (p === page) ? ' class="active"' : "";
        return '<a href="' + p + "?project=" + encodeURIComponent(projectId) + '"' + active + ">" +
               PROJECT_PAGES[p] + "</a>";
      }).join("");
    }

    return '<div class="ctxbar">' +
             '<a class="ctx-root" href="projects.html">Projects</a>' +
             '<span class="ctx-sep">&rsaquo;</span>' +
             '<select id="ctx-project" class="ctx-switch" aria-label="Switch project">' +
               '<option value="">' + (projectId ? "Loading projects…" : "Choose a project…") + "</option>" +
             "</select>" +
             (tabs ? '<nav class="ctx-tabs">' + tabs + "</nav>" : "") +
           "</div>";
  }

  // fill the switcher once the directory arrives; on failure the breadcrumb
  // simply stays as-is (the bar still works as a "back to Projects" link)
  function fillCtxSwitcher(page) {
    var sel = document.getElementById("ctx-project");
    if (!sel || typeof Dash.getProjectDirectory !== "function") return;
    var projectId = new URLSearchParams(window.location.search).get("project") || "";

    Dash.getProjectDirectory().then(function (rows) {
      // hub/piles/claims are bored-piling pages — sheet-piling-only sites
      // have nothing to show there, so keep them out of the switcher
      rows = (rows || []).filter(function (r) { return r.has_bored_scope !== false; });
      rows = rows.slice().sort(function (a, b) {
        var aa = a.status === "active" ? 0 : 1, bb = b.status === "active" ? 0 : 1;
        if (aa !== bb) return aa - bb;
        return String(a.project_code || "").localeCompare(String(b.project_code || ""));
      });
      var opts = ['<option value=""' + (projectId ? "" : " selected") + ' disabled>Choose a project…</option>'];
      rows.forEach(function (r) {
        var label = (r.project_code || "?") + " — " + (r.project_name || "");
        if (r.status && r.status !== "active") label += " (" + String(r.status).replace(/_/g, " ") + ")";
        opts.push('<option value="' + r.project_id + '"' +
                  (String(r.project_id) === projectId ? " selected" : "") + ">" +
                  escText(label) + "</option>");
      });
      sel.innerHTML = opts.join("");
      sel.addEventListener("change", function () {
        if (!this.value) return;
        window.location.href = page + "?project=" + encodeURIComponent(this.value);
      });
    }).catch(function () { /* keep the plain breadcrumb */ });
  }

  /* ---- global search ----
     Scope is deliberately SITES: it reuses the project directory the context
     switcher already fetches, so it costs one cached call and works on every
     page. Searching issues/machines/workers would mean new engine calls on
     every page load, so those stay on their own pages for now. */

  var _dir = null;                                  // cached directory rows

  function hideSearch() {
    var pop = document.getElementById("gsearch-pop");
    if (pop) { pop.hidden = true; pop.innerHTML = ""; }
  }

  function searchRows(q) {
    q = q.trim().toLowerCase();
    if (!q || !_dir) return [];
    return _dir.filter(function (r) {
      return (String(r.project_code || "") + " " + String(r.project_name || "") + " " +
              String(r.client_name || "")).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 8);
  }

  function initSearch() {
    var input = document.getElementById("gsearch-input");
    var pop = document.getElementById("gsearch-pop");
    if (!input || !pop || typeof Dash.getProjectDirectory !== "function") return;

    function paint() {
      var rows = searchRows(input.value);
      if (!input.value.trim()) { hideSearch(); return; }
      pop.hidden = false;
      pop.innerHTML = rows.length
        ? rows.map(function (r, i) {
            var sub = (r.project_name || "") + (r.status && r.status !== "active"
              ? " · " + String(r.status).replace(/_/g, " ") : "");
            return '<a class="gs-row' + (i === 0 ? " gs-first" : "") +
                   '" href="project.html?project=' + encodeURIComponent(r.project_id) + '">' +
                   '<b>' + escText(r.project_code || "?") + "</b>" +
                   "<span>" + escText(sub) + "</span></a>";
          }).join("")
        : '<div class="gs-none">No site matches that.</div>';
    }

    // load the directory once, on first use — not on every page load
    function ensureDir(then) {
      if (_dir) { then(); return; }
      Dash.getProjectDirectory().then(function (rows) {
        _dir = rows || [];
        then();
      }).catch(function () {
        _dir = [];
        pop.hidden = false;
        pop.innerHTML = '<div class="gs-none">Could not load the site list.</div>';
      });
    }

    input.addEventListener("input", function () { ensureDir(paint); });
    input.addEventListener("focus", function () { ensureDir(paint); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { input.blur(); hideSearch(); return; }
      if (ev.key === "Enter") {
        var first = pop.querySelector(".gs-first");
        if (first) { ev.preventDefault(); window.location.href = first.getAttribute("href"); }
      }
    });
  }

  /* ---- boot ---- */

  async function boot() {
    // A password-reset link is a real sign-in, so without this the person lands
    // straight in the dashboard and never changes their password. It is checked
    // here and not only on login.html because Supabase falls back to the Site
    // URL — the site root, i.e. index.html — whenever the reset link's redirect
    // is not on its allow-list.
    if (Dash.recoveryPending()) {
      window.location.replace("reset.html");
      return;
    }

    var user = await Dash.requireLogin();
    if (!user) return;                            // redirecting to login.html

    var acc = await Dash.getMyAccess();

    // An account that exists but has not been switched on yet gets the holding
    // page, not a stripped-down dashboard.
    if (acc.ok && acc.access.status !== "active") {
      window.location.replace("pending.html");
      return;
    }

    // Could not find out. Say so, and DO NOT quietly demote them — the old code
    // treated a network failure as "you have no permissions", which told a
    // director they were not linked to a staff record and emptied their menu.
    if (!acc.ok && acc.reason === "error") {
      var main0 = document.getElementById("main");
      if (main0) {
        main0.innerHTML =
          '<div class="banner banner-red">Could not check your access: ' +
          escText(acc.message || "the server did not respond") +
          '. Please reload. If this keeps happening, tell the office.</div>' + main0.innerHTML;
      }
      return;
    }

    var profile = acc.ok ? acc.access : null;
    var page = currentPage();

    var nav = document.getElementById("nav");
    if (nav) {
      var links = NAV_LINKS
        .filter(function (l) { return allowed(l.href, acc); })
        .map(function (l) {
          var active = (l.href === page || PROJECT_PAGES[page] !== undefined && l.href === "projects.html");
          return '<a href="' + l.href + '"' + (active ? ' class="active"' : "") + ">" +
                 icon(l.icon) + "<span>" + l.label + "</span></a>";
        })
        .join("");

      var fullName = profile ? profile.full_name : (user.email || "Signed in");
      // What they ARE (job title) and, once 0062 is applied, what they MAY DO
      // (access profile) — the two things this redesign separates. Before that
      // the profile code is just the old designation, so only one line shows.
      var desig = profile ? desigLabel(profile.designation) : "Not linked to a staff record";
      var profileName = (profile && !profile.legacy)
        ? (profile.access_profile_name || desigLabel(profile.access_profile_code))
        : "";
      if (profileName && profileName !== desig) desig = desig ? desig + " · " + profileName : profileName;

      // The rail is a fixed left column; the top bar sits to its right and
      // carries search + account. body.has-rail turns on the grid in
      // styles.css — login.html has no #nav, so it keeps the plain layout.
      document.body.classList.add("has-rail");

      nav.innerHTML =
        '<aside class="rail">' +
          '<a class="rail-brand" href="index.html">' +
            '<span class="rail-logo">HF</span><span class="rail-word">Nexus</span>' +
          "</a>" +
          '<div class="rail-label">Menu</div>' +
          '<nav class="rail-links">' + links + "</nav>" +
          '<div class="rail-foot">' +
            '<div class="rail-label">General</div>' +
            '<button type="button" class="rail-link signout-btn">' +
              icon("signout") + "<span>Sign out</span></button>" +
          "</div>" +
        "</aside>" +
        '<div class="topwrap">' +
          '<div class="topbar">' +
            '<button class="nav-burger" type="button" aria-label="Menu" aria-expanded="false">' +
              "<span></span><span></span><span></span>" +
            "</button>" +
            '<div class="gsearch">' +
              icon("search") +
              '<input id="gsearch-input" type="search" autocomplete="off" ' +
                     'placeholder="Search sites by code, name or client…" aria-label="Search sites">' +
              '<div class="gsearch-pop" id="gsearch-pop" hidden></div>' +
            "</div>" +
            '<details class="user-menu">' +
              '<summary title="' + escText(fullName) + '" aria-label="Account menu">' +
                '<span class="avatar">' + escText(initialsOf(profile, user)) + "</span>" +
                '<span class="who"><b>' + escText(fullName) + "</b>" +
                  "<i>" + escText(desig) + "</i></span>" +
              "</summary>" +
              '<div class="user-pop">' +
                '<div class="user-name">' + escText(fullName) + "</div>" +
                '<div class="user-desig">' + escText(desig) + "</div>" +
                '<button type="button" class="btn-plain signout-btn">Sign out</button>' +
              "</div>" +
            "</details>" +
          "</div>" +
          (PROJECT_PAGES[page] !== undefined ? buildCtxBar(page, acc) : "") +
        "</div>" +
        // Only ever shown when the server actually said "no account for you" —
        // never because a request failed. See the error branch above.
        (profile ? "" :
          '<div class="banner banner-amber rail-banner">This login is not set up yet — ' +
          "ask the office to finish setting up your account. You will not see " +
          "any company information until they do.</div>");

      // sign out (one in the rail, one in the account menu)
      var outs = nav.querySelectorAll(".signout-btn");
      for (var i = 0; i < outs.length; i++) {
        outs[i].addEventListener("click", function () { Dash.signOut(); });
      }

      // burger slides the rail in on phones
      var burger = nav.querySelector(".nav-burger");
      if (burger) {
        burger.addEventListener("click", function () {
          var open = document.body.classList.toggle("rail-open");
          burger.setAttribute("aria-expanded", open ? "true" : "false");
        });
      }

      // click elsewhere closes the account menu, the search results and the
      // phone rail
      document.addEventListener("click", function (ev) {
        var menu = nav.querySelector("details.user-menu[open]");
        if (menu && !menu.contains(ev.target)) menu.removeAttribute("open");
        var box = nav.querySelector(".gsearch");
        if (box && !box.contains(ev.target)) hideSearch();
        var rail = nav.querySelector(".rail");
        if (document.body.classList.contains("rail-open") &&
            rail && !rail.contains(ev.target) && !ev.target.closest(".nav-burger")) {
          document.body.classList.remove("rail-open");
        }
      });

      initSearch();
      if (PROJECT_PAGES[page] !== undefined) fillCtxSwitcher(page);
    }

    // ---- gate the page body ----
    // `acc`, not `profile`: allowed() takes the verdict from getMyAccess(), and
    // a bare access object has no .ok, so passing it refuses everything.
    if (!allowed(page, acc)) {
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
