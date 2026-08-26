/* =============================================================================
   Consumable items — the other half of the Tooling page (window.Consumables)
   =============================================================================
   A tool is a thing you still own and can go and find. A consumable is a thing
   that gets used up, so the question is not "where is it" but "how many are
   left, and is that enough". That is why this is not just another view of the
   tooling table:

     All rows   the catalogue — one line per item: what the STORE holds, what
                the sites have asked for, and what that leaves. The last of
                those is the number the reorder warning watches.
     By site    what one site has requested — one line per request, not the
                whole catalogue. A request nobody made is not a line.

   THE ARITHMETIC, IN ONE LINE:  Left = In store − everything the sites took.
   Type 20 against Umech - Rawang in By site and All rows is 20 lighter the
   moment you look at it. Nothing is derived from movements and nothing is
   guessed: both halves of that sum are typed by somebody who counted.

   A blank is not a zero: blank means nobody has counted, zero means somebody
   looked and there were none. The page keeps them apart because "we have none"
   and "we don't know" lead to different phone calls.

   Saving goes to tools/tooling-api.py, which writes frontend/consumable-data.js.
   ============================================================================= */
(function () {
  "use strict";

  var esc = UI.esc, escHtml = UI.escHtml;

  var D = window.CONSUMABLE_DATA || { items: [], stock: [] };
  var SITES = (window.TOOLING_DATA && window.TOOLING_DATA.siteOptions) || [];

  var F = { mode: "list", site: "", text: "" };
  var EDIT_ITEM = {};        // itemId -> { field: value }
  var EDIT_STOCK = {};       // "itemId|site" -> { qty, remark }
  var REQ_DRAFTS = {};       // site -> [ { item, qty, remark } ] being typed
  var CAN_SAVE = false;
  var HOST = null;

  function key(itemId, site) { return itemId + "|" + site; }

  function drafts(site) { return (REQ_DRAFTS[site] = REQ_DRAFTS[site] || []); }

  function num(v) {
    var t = String(v === undefined || v === null ? "" : v).trim();
    if (t === "" || !/^[0-9]+(\.[0-9]+)?$/.test(t)) return null;
    return parseFloat(t);
  }

  /* ------------------------- the current picture -------------------------- */
  // base data with any unsaved edit laid over the top

  function itemVal(item, field) {   // works for saved and brand-new items alike
    var e = EDIT_ITEM[item.id];
    return (e && e[field] !== undefined) ? e[field] : (item[field] || "");
  }

  function stockVal(itemId, site, field) {
    var e = EDIT_STOCK[key(itemId, site)];
    if (e && e[field] !== undefined) return e[field];
    for (var i = 0; i < D.stock.length; i++) {
      if (D.stock[i].item === itemId && D.stock[i].site === site) return D.stock[i][field] || "";
    }
    return "";
  }

  // every site this item has ever been counted at, edits included
  function sitesFor(itemId) {
    var out = [];
    D.stock.forEach(function (s) {
      if (s.item === itemId && out.indexOf(s.site) === -1) out.push(s.site);
    });
    Object.keys(EDIT_STOCK).forEach(function (k) {
      var parts = k.split("|");
      if (parts[0] === itemId && out.indexOf(parts[1]) === -1) out.push(parts[1]);
    });
    return out;
  }

  // What the store holds — typed in All rows, and the figure every other number
  // on this page is worked out from. null means nobody has counted yet.
  function storeOf(item) { return num(itemVal(item, "qty")); }

  // What the sites have asked for and taken: every request line for this item,
  // added up. No request lines is a real 0, not an unknown — nobody asked.
  function outOf(itemId) {
    var total = 0;
    sitesFor(itemId).forEach(function (site) {
      var n = num(stockVal(itemId, site, "qty"));
      if (n !== null) total += n;
    });
    return total;
  }

  // What is left to give out. This is the number the office acts on, so it is
  // the one the reorder warning watches — a store with 20 on the shelf and 20
  // already promised to a site has nothing to send anybody.
  function leftOf(item) {
    var held = storeOf(item);
    return held === null ? null : held - outOf(item.id);
  }

  function isLow(item) {
    var min = num(itemVal(item, "min")), left = leftOf(item);
    return min !== null && left !== null && left <= min;
  }

  function allItems() { return D.items.concat(NEW_ITEMS); }

  function shown() {
    var t = F.text.toLowerCase();
    return allItems().filter(function (it) {
      if (!t) return true;
      return (itemVal(it, "name") + " " + itemVal(it, "size") + " " + itemVal(it, "remark"))
             .toLowerCase().indexOf(t) !== -1;
    });
  }

  /* ------------------------------- controls ------------------------------- */

  function controls() {
    return '<div class="mp-controls" id="cons-controls">' +
             "<span>View: " +
               '<button type="button" data-cmode="list"' + (F.mode === "list" ? ' class="active"' : "") +
                 ">All rows</button>" +
               '<button type="button" data-cmode="site"' + (F.mode === "site" ? ' class="active"' : "") +
                 ">By site</button>" +
             "</span>" +
             "<span>Site: <select id=\"cons-site\">" +
               '<option value="">' + (F.mode === "site" ? "Pick a site…" : "All sites") + "</option>" +
               SITES.map(function (s) {
                 return '<option value="' + esc(s) + '"' + (s === F.site ? " selected" : "") + ">" +
                        escHtml(s) + "</option>";
               }).join("") +
             "</select></span>" +
             '<span class="tool-search">' +
               '<svg class="ric" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
                 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                 '<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8 20.5 20.5"/></svg>' +
               '<input type="search" id="cons-text" value="' + esc(F.text) + '" ' +
                 'placeholder="Search item, size or remark…" aria-label="Search consumables">' +
             "</span>" +
           "</div>";
  }

  function stats() {
    var items = allItems().length;
    var counted = allItems().filter(function (i) { return storeOf(i) !== null; }).length;
    var low = allItems().filter(isLow).length;

    // request lines outstanding, and how many sites they are spread over
    var lines = 0, where = {};
    allItems().forEach(function (it) {
      sitesFor(it.id).forEach(function (site) {
        if (num(stockVal(it.id, site, "qty")) !== null) { lines += 1; where[site] = 1; }
      });
    });
    var sites = Object.keys(where).length;

    var cards = [
      { n: items, label: "Items", sub: "on the consumables list", icon: "machine", tone: "brand" },
      { n: counted, label: "Counted", sub: counted === items ? "all of them" : (items - counted) + " never counted",
        icon: "check", tone: counted ? "ok" : "grey" },
      { n: lines, label: "Requested", sub: lines ? "lines from " + sites + " site" + (sites === 1 ? "" : "s")
                                                 : "no site has asked for anything",
        icon: "site", tone: lines ? "info" : "grey" },
      { n: low, label: "Need reordering", sub: "at or below the minimum", icon: "alert",
        tone: low ? "bad" : "grey" }
    ];
    return '<div class="istats">' + cards.map(function (c) {
      return '<div class="istat tone-' + c.tone + '">' +
               '<span class="istat-ic">' + UI.icon(c.icon) + "</span>" +
               '<span class="istat-body"><span class="istat-top"><b>' + c.n + "</b><i>" +
                 escHtml(c.label) + "</i></span>" +
               '<span class="istat-sub">' + escHtml(c.sub) + "</span></span></div>";
    }).join("") + "</div>";
  }

  /* ------------------------------ all rows -------------------------------- */

  function itemInput(item, field, ph) {
    // NEW_ITEMS are held in a separate list but edited through the same map
    return '<input type="text" class="cons-edit" data-item="' + esc(item.id) + '" data-field="' + field +
           '" value="' + esc(itemVal(item, field)) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + ">";
  }

  // the reorder warning lives in the Remark cell, in front of whatever the
  // office has written there — that is the column people actually read
  function remarkCell(item) {
    var chip = "";
    if (isLow(item)) {
      chip = '<span class="chip chip-bad">Reorder</span>';
    } else if (storeOf(item) === null) {
      chip = '<span class="chip">Not counted</span>';
    }
    return '<div class="cons-remark">' + chip +
           (CAN_SAVE ? itemInput(item, "remark", "—")
                     : '<span>' + escHtml(itemVal(item, "remark") || "—") + "</span>") +
           "</div>";
  }

  // what the sites have taken, with the breakdown on hover — the total on its
  // own always draws the question "taken by whom"
  function outCell(item) {
    var out = outOf(item.id);
    if (!out) return '<span class="muted">—</span>';
    var where = sitesFor(item.id).filter(function (s) { return num(stockVal(item.id, s, "qty")) !== null; })
      .map(function (s) { return s + " " + UI.f1(num(stockVal(item.id, s, "qty"))); }).join(" · ");
    return '<span class="cons-out" title="' + esc(where) + '">−' + UI.f1(out) + "</span>";
  }

  // In store, less what the sites took. Below zero is not an error to hide: the
  // sites have been promised more than the store has, and somebody must know.
  function leftCell(item) {
    var left = leftOf(item);
    if (left === null) return '<span class="muted">not counted</span>';
    return "<strong" + (left < 0 ? ' class="cons-over" title="More has been requested than the store holds"' : "") +
           ">" + UI.f1(left) + "</strong>";
  }

  function listTable() {
    var rows = shown();
    if (!rows.length) return UI.empty("Nothing matches that.", "Clear the search.");

    return '<div class="table-wrap table-stack"><table class="tool-table cons-table">' +
             "<thead><tr><th>Item</th><th>Size</th><th>Unit</th>" +
               '<th class="num" title="What the store holds. This is the one number here that ' +
                 'is typed — everything to the right of it is worked out.">In store</th>' +
               '<th class="num" title="Everything the sites have asked for, added up from the ' +
                 'By site lines. Hover a number to see which sites.">Requested</th>' +
               '<th class="num" title="In store less requested — what is actually left to give out.">' +
                 "Left</th>" +
               '<th class="num" title="When Left drops to this number or below, the Remark column ' +
                 'says Reorder. Leave it blank and no warning is ever shown.">Reorder at</th>' +
               "<th>Remark</th></tr></thead><tbody>" +
             rows.map(function (it) {
               return "<tr>" +
                 UI.td("Item", CAN_SAVE ? itemInput(it, "name")
                                        : "<strong>" + escHtml(itemVal(it, "name")) + "</strong>", "wrap") +
                 UI.td("Size", CAN_SAVE ? itemInput(it, "size", "—") : escHtml(itemVal(it, "size"))) +
                 UI.td("Unit", CAN_SAVE ? itemInput(it, "unit", "—") : escHtml(itemVal(it, "unit"))) +
                 UI.td("In store", CAN_SAVE ? itemInput(it, "qty", "—")
                                            : (itemVal(it, "qty") === ""
                                                 ? '<span class="muted">—</span>'
                                                 : escHtml(itemVal(it, "qty"))), "num") +
                 UI.td("Requested", outCell(it), "num") +
                 UI.td("Left", leftCell(it), "num") +
                 UI.td("Reorder at", CAN_SAVE ? itemInput(it, "min", "—") : escHtml(itemVal(it, "min")), "num") +
                 UI.td("Remark", remarkCell(it), "wrap") +
               "</tr>";
             }).join("") +
           "</tbody></table></div>";
  }

  /* ------------------------------- by site --------------------------------
     A site's page is a list of what it ASKED FOR — not the whole catalogue with
     fifteen empty boxes on it. Fifteen empty boxes told nobody anything, and
     every one of them was a chance to type a number against the wrong line.

     Add a request, pick the item, say how many. That number comes straight off
     the store's count in All rows — see leftOf() above. */

  // one line per request: the items this site has a figure or a note against
  function requestedBy(site) {
    return allItems().filter(function (it) {
      return String(stockVal(it.id, site, "qty")).trim() !== "" ||
             String(stockVal(it.id, site, "remark")).trim() !== "";
    });
  }

  function stockInput(itemId, site, field, ph) {
    return '<input type="text" class="cons-stock" data-item="' + esc(itemId) + '" data-site="' +
           esc(site) + '" data-field="' + field + '" value="' + esc(stockVal(itemId, site, field)) +
           '" placeholder="' + esc(ph || "—") + '">';
  }

  // A request with no item picked yet, so there is nothing to key it by — it
  // lives in REQ_DRAFTS until it has one, and folds into the record on save.
  function draftRow(site, d, i) {
    var taken = {};
    requestedBy(site).forEach(function (it) { taken[it.id] = 1; });
    var chosen = null;
    allItems().forEach(function (it) { if (it.id === d.item) chosen = it; });

    return '<tr class="cons-draft">' +
      UI.td("Item",
        '<select class="cons-req" data-site="' + esc(site) + '" data-i="' + i + '" data-field="item">' +
          '<option value="">Pick an item…</option>' +
          allItems().filter(function (it) { return !taken[it.id] || it.id === d.item; })
            .map(function (it) {
              return '<option value="' + esc(it.id) + '"' + (it.id === d.item ? " selected" : "") + ">" +
                     escHtml(itemVal(it, "name")) + "</option>";
            }).join("") +
        "</select>", "wrap") +
      UI.td("Size", chosen ? escHtml(itemVal(chosen, "size")) : "") +
      UI.td("Unit", chosen ? escHtml(itemVal(chosen, "unit")) : "") +
      UI.td("Requested", '<input type="text" class="cons-req" data-site="' + esc(site) + '" data-i="' + i +
            '" data-field="qty" value="' + esc(d.qty) + '" placeholder="how many">', "num") +
      UI.td("Note", '<input type="text" class="cons-req" data-site="' + esc(site) + '" data-i="' + i +
            '" data-field="remark" value="' + esc(d.remark) + '" placeholder="—">', "wrap") +
      '<td class="cons-row-act"><button type="button" class="cons-x" data-req-drop="' + esc(site) + "|" + i +
        '" title="Drop this line" aria-label="Drop this line">\u00d7</button></td>' +
    "</tr>";
  }

  function siteTable(site) {
    var visible = shown();                       // the search box still applies
    var rows = requestedBy(site).filter(function (it) { return visible.indexOf(it) !== -1; });
    var list = drafts(site);

    if (!rows.length && !list.length) {
      return UI.empty("Nothing requested here yet.",
                      CAN_SAVE ? "Press \u201c+ Add request\u201d below and say what this site wants."
                               : "Start tools/tooling-api.py to add one.");
    }

    return '<div class="table-wrap table-stack"><table class="tool-table cons-site-table' +
             (CAN_SAVE ? " with-drop" : "") + '">' +
             "<thead><tr><th>Item</th><th>Size</th><th>Unit</th>" +
               '<th class="num" title="How many this site asked for. It comes off the store count ' +
                 'in All rows the moment it is typed.">Requested</th>' +
               "<th>Note</th>" + (CAN_SAVE ? "<th></th>" : "") +
             "</tr></thead><tbody>" +
             rows.map(function (it) {
               return "<tr>" +
                 UI.td("Item", "<strong>" + escHtml(itemVal(it, "name")) + "</strong>", "wrap") +
                 UI.td("Size", escHtml(itemVal(it, "size"))) +
                 UI.td("Unit", escHtml(itemVal(it, "unit"))) +
                 UI.td("Requested", CAN_SAVE ? stockInput(it.id, site, "qty")
                                             : escHtml(stockVal(it.id, site, "qty")), "num") +
                 UI.td("Note", CAN_SAVE ? stockInput(it.id, site, "remark")
                                        : escHtml(stockVal(it.id, site, "remark")), "wrap") +
                 (CAN_SAVE
                   ? '<td class="cons-row-act"><button type="button" class="cons-x" data-req-clear="' +
                     esc(it.id) + "|" + esc(site) + '" title="Take this request off" ' +
                     'aria-label="Remove this request">\u00d7</button></td>'
                   : "") +
               "</tr>";
             }).join("") +
             list.map(function (d, i) { return draftRow(site, d, i); }).join("") +
           "</tbody></table></div>";
  }

  function bySite() {
    if (F.site) {
      var n = requestedBy(F.site).length;
      return '<details class="zone" open><summary><span class="zone-name">' + escHtml(F.site) + "</span>" +
               '<span class="group-head"><span class="chip">' + n + " request" + (n === 1 ? "" : "s") +
               "</span></span></summary>" + siteTable(F.site) + "</details>";
    }

    // no site picked: every site that has asked for something
    var sites = [];
    allItems().forEach(function (it) {
      sitesFor(it.id).forEach(function (s) { if (sites.indexOf(s) === -1) sites.push(s); });
    });
    Object.keys(REQ_DRAFTS).forEach(function (s) {
      if (REQ_DRAFTS[s].length && sites.indexOf(s) === -1) sites.push(s);
    });
    if (!sites.length) {
      return UI.empty("No site has asked for anything yet.",
                      "Pick a site above, then add what they want.");
    }
    return sites.sort().map(function (s) {
      var n = requestedBy(s).length;
      return '<details class="zone" open><summary><span class="zone-name">' + escHtml(s) + "</span>" +
               '<span class="group-head"><span class="chip">' + n + " request" + (n === 1 ? "" : "s") +
               "</span></span></summary>" + siteTable(s) + "</details>";
    }).join("");
  }

  /* ---------------------------- adding an item ----------------------------
     New items get a temporary id while they are being typed. It is turned into
     a readable one from the name at save time — safe to do then, and only then,
     because a brand-new item is the one case where nothing else points at the
     id yet. Any quantity typed against the temp id is remapped with it. */
  var NEW_ITEMS = [];
  var tempSeq = 0;

  function blankItem() {
    tempSeq += 1;
    return { id: "new-" + tempSeq, name: "", size: "", unit: "pcs", min: "", remark: "", isNew: true };
  }

  function slug(name, taken) {
    var base = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
                 .replace(/^-|-$/g, "").slice(0, 40) || "item";
    var id = base, n = 2;
    while (taken[id]) { id = base + "-" + n; n += 1; }
    taken[id] = 1;
    return id;
  }

  // Two different buttons, because the two views add two different things: All
  // rows adds a KIND OF THING WE BUY, By site adds A SITE ASKING FOR SOME.
  function addBar() {
    if (!CAN_SAVE) return "";
    if (F.mode === "site") {
      return '<p class="tool-edit-actions">' +
               '<button type="button" id="cons-req-add" class="btn"' + (F.site ? "" : " disabled") +
                 ">+ Add request</button>" +
               '<span class="muted">' + (F.site
                 ? "What " + escHtml(F.site) + " is asking for. Whatever is typed here comes off the " +
                   "store's count in All rows."
                 : "Pick a site above first — a request belongs to somebody.") +
               "</span></p>";
    }
    return '<p class="tool-edit-actions">' +
             '<button type="button" id="cons-add" class="btn">+ Add item</button>' +
             '<span class="muted">Adds a new kind of thing we buy to the list. ' +
               "To say a site wants some, use By site.</span>" +
           "</p>";
  }

  /* ------------------------------- saving --------------------------------- */

  function pendingCount() {
    var n = NEW_ITEMS.length;
    Object.keys(EDIT_ITEM).forEach(function (id) { n += Object.keys(EDIT_ITEM[id]).length; });
    Object.keys(EDIT_STOCK).forEach(function (k) { n += Object.keys(EDIT_STOCK[k]).length; });
    // a draft only counts once it says something — an empty line pressed by
    // accident is not a change anybody made
    Object.keys(REQ_DRAFTS).forEach(function (site) {
      REQ_DRAFTS[site].forEach(function (d) {
        if (d.item && (String(d.qty).trim() || String(d.remark).trim())) n += 1;
      });
    });
    return n;
  }

  // the whole document, edits folded in — the endpoint writes the file as-is
  function merged() {
    var taken = {};
    D.items.forEach(function (it) { taken[it.id] = 1; });

    var items = D.items.map(function (it) {
      return { id: it.id, name: itemVal(it, "name"), size: itemVal(it, "size"),
               unit: itemVal(it, "unit"), qty: itemVal(it, "qty"),
               min: itemVal(it, "min"), remark: itemVal(it, "remark") };
    });

    // temp id -> the readable one it is saved under
    var idMap = {};
    NEW_ITEMS.forEach(function (it) {
      var name = itemVal(it, "name");
      if (!String(name).trim()) return;               // an empty line is not an item
      var id = slug(name, taken);
      idMap[it.id] = id;
      items.push({ id: id, name: name, size: itemVal(it, "size"), unit: itemVal(it, "unit"),
                   qty: itemVal(it, "qty"), min: itemVal(it, "min"), remark: itemVal(it, "remark") });
    });

    var seen = {}, stock = [];
    function put(itemId, site) {
      var k = key(itemId, site);
      if (seen[k]) return;
      seen[k] = 1;
      var qty = stockVal(itemId, site, "qty"), remark = stockVal(itemId, site, "remark");
      if (String(qty).trim() === "" && String(remark).trim() === "") return;   // nothing to keep
      var id = idMap[itemId] || itemId;
      if (/^new-\d+$/.test(id)) return;               // its item was left unnamed
      stock.push({ item: id, site: site, qty: String(qty).trim(), remark: String(remark).trim() });
    }
    D.stock.forEach(function (s) { put(s.item, s.site); });
    Object.keys(EDIT_STOCK).forEach(function (k) { var p = k.split("|"); put(p[0], p[1]); });

    // drafts last: a draft against an item the site already has a line for is
    // the same request twice, so it replaces rather than doubles it
    Object.keys(REQ_DRAFTS).forEach(function (site) {
      REQ_DRAFTS[site].forEach(function (d) {
        var id = idMap[d.item] || d.item;
        if (!id || /^new-\d+$/.test(id)) return;
        var qty = String(d.qty).trim(), remark = String(d.remark).trim();
        if (qty === "" && remark === "") return;
        var k = key(id, site), i;
        if (seen[k]) {
          for (i = 0; i < stock.length; i += 1) {
            if (stock[i].item === id && stock[i].site === site) {
              stock[i].qty = qty; stock[i].remark = remark;
            }
          }
          return;
        }
        seen[k] = 1;
        stock.push({ item: id, site: site, qty: qty, remark: remark });
      });
    });

    return { items: items, stock: stock };
  }

  function bar() {
    var n = pendingCount();
    if (!CAN_SAVE) {
      return '<div class="banner banner-info">Editing is off: the save endpoint is not running. ' +
             "Start it with <code>python3 tools/tooling-api.py</code>, then reload.</div>";
    }
    if (!n) return "";
    return '<div class="banner banner-info" id="cons-bar"><strong>' + n + " unsaved change" +
             (n === 1 ? "" : "s") + "</strong> — nothing has been written yet. " +
             '<button type="button" id="cons-save" class="btn btn-primary">Save</button> ' +
             '<button type="button" id="cons-discard" class="btn">Discard</button></div>';
  }

  function save() {
    var btn = document.getElementById("cons-save");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    fetch("http://127.0.0.1:8125/consumables", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged())
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok || !r.j.ok) throw new Error(r.j.error || "the save endpoint refused it");
        UI.saveScroll();
        window.location.reload();
      })
      .catch(function (e) {
        var host = document.getElementById("cons-bar");
        if (host) {
          host.className = "banner banner-red";
          host.innerHTML = "Could not save: " + escHtml(e.message || e) +
            '<br><span class="muted">Nothing was written. Is tools/tooling-api.py still running?</span>';
        }
      });
  }

  /* ------------------------------- wiring --------------------------------- */

  function paint() {
    // No caption here: tooling.html already writes one above the cards, and two
    // sentences saying the same thing is what made this page look crooked.
    HOST.innerHTML =
      stats() + controls() + bar() +
      '<div id="cons-body">' + (F.mode === "site" ? bySite() : listTable()) + "</div>" +
      addBar();
  }

  function wire() {
    HOST.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;
      if (b.getAttribute("data-cmode")) { F.mode = b.getAttribute("data-cmode"); return paint(); }
      if (b.id === "cons-add") {
        NEW_ITEMS.push(blankItem());
        F.mode = "list";                              // the new line lives in All rows
        return paint();
      }
      if (b.id === "cons-req-add") {
        if (!F.site) return;                          // the button is disabled, but belt and braces
        drafts(F.site).push({ item: "", qty: "", remark: "" });
        return paint();
      }
      // Taking a request off is emptying its line: the record keeps no entry for
      // a site that is not asking for anything, and All rows gets its stock back.
      var clear = b.getAttribute("data-req-clear");
      if (clear) {
        var pc = clear.split("|");
        EDIT_STOCK[key(pc[0], pc[1])] = { qty: "", remark: "" };
        return paint();
      }
      var drop = b.getAttribute("data-req-drop");
      if (drop) {
        var pd = drop.split("|");
        (REQ_DRAFTS[pd[0]] || []).splice(Number(pd[1]), 1);
        return paint();
      }
      if (b.id === "cons-save") return save();
      if (b.id === "cons-discard") {
        EDIT_ITEM = {}; EDIT_STOCK = {}; NEW_ITEMS = []; REQ_DRAFTS = {};
        return paint();
      }
    });

    HOST.addEventListener("change", function (ev) {
      if (ev.target.id === "cons-site") { F.site = ev.target.value; return paint(); }
      if (ev.target.classList.contains("cons-req")) return noteDraft(ev.target);
    });

    // typing repaints only the pending bar, never the inputs — repainting the
    // table under a caret is how you lose what you were typing
    HOST.addEventListener("input", function (ev) {
      var t = ev.target;
      if (t.id === "cons-text") { F.text = t.value.trim(); return paint(); }

      if (t.classList.contains("cons-edit")) {
        var id = t.getAttribute("data-item"), f = t.getAttribute("data-field");
        (EDIT_ITEM[id] = EDIT_ITEM[id] || {})[f] = t.value;
        return refreshBar();
      }
      if (t.classList.contains("cons-stock")) {
        var k = key(t.getAttribute("data-item"), t.getAttribute("data-site"));
        (EDIT_STOCK[k] = EDIT_STOCK[k] || {})[t.getAttribute("data-field")] = t.value;
        return refreshBar();
      }
      if (t.classList.contains("cons-req")) return noteDraft(t);
    });
  }

  // A draft line being typed. Picking the item repaints (size and unit follow
  // it); typing a number does not, because repainting under a caret is how you
  // lose what you were typing.
  function noteDraft(t) {
    var list = REQ_DRAFTS[t.getAttribute("data-site")];
    var d = list && list[Number(t.getAttribute("data-i"))];
    if (!d) return;
    var field = t.getAttribute("data-field");
    d[field] = t.value;
    if (field === "item") return paint();
    return refreshBar();
  }

  function refreshBar() {
    var old = document.getElementById("cons-bar");
    var html = bar();
    if (old) {
      if (!html) { old.remove(); return; }
      var tmp = document.createElement("div");
      tmp.innerHTML = html;
      old.replaceWith(tmp.firstChild);
      return;
    }
    if (html) {
      var box = document.createElement("div");
      box.innerHTML = html;
      HOST.insertBefore(box.firstChild, document.getElementById("cons-body"));
    }
  }

  window.Consumables = {
    // the tooling page asks this before it lets the dev server reload the page
    // out from under somebody who is halfway through counting
    pending: pendingCount,
    init: function (host, canSave) {
      HOST = host;
      CAN_SAVE = !!canSave;
      wire();
    },
    render: function (canSave) {
      CAN_SAVE = !!canSave;
      paint();
    }
  };
})();
