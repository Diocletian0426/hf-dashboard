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
    { href: "tests.html",      label: "Tests"      },
    // only appears for logins holding users.view (the allowed() filter below)
    { href: "users.html",      label: "Users"      }
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
          return '<a href="' + l.href + '"' + (active ? ' class="active"' : "") + ">" + l.label + "</a>";
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
        (PROJECT_PAGES[page] !== undefined ? buildCtxBar(page, acc) : "") +
        // Only ever shown when the server actually said "no account for you" —
        // never because a request failed. See the error branch above.
        (profile ? "" :
          '<div class="banner banner-amber">This login is not set up yet — ' +
          "ask the office to finish setting up your account. You will not see " +
          "any company information until they do.</div>");

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
