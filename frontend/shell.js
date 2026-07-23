/* =============================================================================
   HF Dashboard — SHARED SHELL (top bar + login guard + page access tiers)
   =============================================================================
   Every page (except login.html) includes this AFTER the engine and has:
     <header id="nav"></header>   <- the bar is injected here
     <main id="main"> ... </main> <- replaced with a notice if access is denied

   What gets injected:
     .topbar  — brand, the primary links (burger menu on phones), user menu
     .ctxbar  — ONLY on project-scoped pages (project/piles/claims):
                "Projects › [project switcher]  Hub | Piles | Claims"

   PAGE ACCESS TIERS (by staff.designation, via Dash.getMyProfile()):
     - Pages NOT listed in PAGE_ACCESS are visible to every signed-in account.
     - Pages listed are visible ONLY to the named designations.
     - An account not linked to a staff record gets the unlisted pages only,
       plus a visible "not linked" notice.
   NOTE: for view-only pages this is a convenience layer — the real lock is in
   the database (grants + RLS). Write actions get their own database-side
   designation checks.

   This file deliberately does NOT use window.UI — attendance.html (owned by
   the attendance collaborator, never edited here) loads shell without ui.js.
   ============================================================================= */
(function () {
  "use strict";

  var NAV_LINKS = [
    { href: "index.html",      label: "Overview"   },
    { href: "projects.html",   label: "Projects"   },
    { href: "issues.html",     label: "Issues"     },
    { href: "machines.html",   label: "Machines"   },
    { href: "manpower.html",   label: "Manpower"   },
    { href: "attendance.html", label: "Attendance" },
    // leave.html stays in PAGE_ACCESS but is out of the nav until the page
    // is actually built (owner decision — leave UI deferred)
    { href: "tests.html",      label: "Tests"      }
  ];

  // page -> designations allowed. Unlisted page = everyone signed in.
  var PAGE_ACCESS = {
    "leave.html": ["management", "office"],
    "claims.html": ["management", "office"]   // MONEY page — DB re-checks every call too
  };

  // project-scoped pages: they get the context bar and light up "Projects"
  var PROJECT_PAGES = {
    "project.html": "Hub",
    "piles.html":   "Piles",
    "claims.html":  "Claims"
  };

  // tiny local copy (shell must not depend on ui.js — see header)
  var DESIG_LABELS = {
    management: "Management", office: "Office",
    site_supervisor: "Site Supervisor", site: "Site Crew"
  };
  function desigLabel(d) {
    if (!d) return "";
    return DESIG_LABELS[d] || String(d).replace(/_/g, " ");
  }

  function escText(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

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

  function initialsOf(profile, user) {
    var name = profile && profile.full_name ? profile.full_name : (user && user.email) || "?";
    var parts = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(function (w) { return w.length; });
    if (!parts.length) return "?";
    var out = parts[0].charAt(0);
    if (parts.length > 1) out += parts[1].charAt(0);
    return out.toUpperCase();
  }

  /* ---- the project context bar (project-scoped pages only) ---- */

  function buildCtxBar(page, profile) {
    var projectId = new URLSearchParams(window.location.search).get("project") || "";

    var tabs = "";
    if (projectId) {
      tabs = Object.keys(PROJECT_PAGES).map(function (p) {
        if (p === "claims.html" &&
            (!profile || ["management", "office"].indexOf(profile.designation) === -1)) return "";
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

  /* ---- boot ---- */

  async function boot() {
    var user = await Dash.requireLogin();
    if (!user) return;                            // redirecting to login.html

    var profile = await Dash.getMyProfile();
    var page = currentPage();

    var nav = document.getElementById("nav");
    if (nav) {
      var links = NAV_LINKS
        .filter(function (l) { return allowed(l.href, profile); })
        .map(function (l) {
          var active = (l.href === page || PROJECT_PAGES[page] !== undefined && l.href === "projects.html");
          return '<a href="' + l.href + '"' + (active ? ' class="active"' : "") + ">" + l.label + "</a>";
        })
        .join("");

      var fullName = profile ? profile.full_name : (user.email || "Signed in");
      var desig = profile ? desigLabel(profile.designation) : "Not linked to a staff record";

      nav.innerHTML =
        '<div class="topbar">' +
          '<button class="nav-burger" type="button" aria-label="Menu" aria-expanded="false">' +
            "<span></span><span></span><span></span>" +
          "</button>" +
          '<a class="brand" href="index.html">HF Dashboard</a>' +
          '<nav class="nav-links">' + links +
            '<div class="nav-user-mobile">' +
              '<div class="nav-who">' + escText(fullName) +
                '<span class="nav-desig">' + escText(desig) + "</span></div>" +
              '<button type="button" class="btn-plain signout-btn">Sign out</button>' +
            "</div>" +
          "</nav>" +
          '<details class="user-menu">' +
            '<summary title="' + escText(fullName) + '" aria-label="Account menu">' +
              escText(initialsOf(profile, user)) + "</summary>" +
            '<div class="user-pop">' +
              '<div class="user-name">' + escText(fullName) + "</div>" +
              '<div class="user-desig">' + escText(desig) + "</div>" +
              '<button type="button" class="btn-plain signout-btn">Sign out</button>' +
            "</div>" +
          "</details>" +
        "</div>" +
        (PROJECT_PAGES[page] !== undefined ? buildCtxBar(page, profile) : "") +
        (profile ? "" :
          '<div class="banner banner-amber">This login is not linked to a staff record yet — ' +
          "ask the office to link it (page access stays limited until then).</div>");

      // sign out (one button in the phone menu, one in the user menu)
      var outs = nav.querySelectorAll(".signout-btn");
      for (var i = 0; i < outs.length; i++) {
        outs[i].addEventListener("click", function () { Dash.signOut(); });
      }

      // burger toggles the phone menu
      var burger = nav.querySelector(".nav-burger");
      if (burger) {
        burger.addEventListener("click", function () {
          var open = nav.classList.toggle("nav-open");
          burger.setAttribute("aria-expanded", open ? "true" : "false");
        });
      }

      // click elsewhere closes the user menu
      document.addEventListener("click", function (ev) {
        var menu = nav.querySelector("details.user-menu[open]");
        if (menu && !menu.contains(ev.target)) menu.removeAttribute("open");
      });

      if (PROJECT_PAGES[page] !== undefined) fillCtxSwitcher(page);
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
