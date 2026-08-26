// Delivery records — what went out, where it went, who drove it, and whether it
// has arrived. Written by tools/tooling-api.py when the page saves.
//
// WHY THIS IS A LOCAL FILE. Same reason as consumable-data.js: the office's
// spreadsheet has no delivery section, and there is no deliveries table in the
// database yet. This is the record until one of those exists. The shape below
// is deliberately flat — one line per delivery, exactly the columns a delivery
// order has — so moving it into a sheet or a table later is a copy, not a
// rebuild.
//
//   date      when it was sent (ISO, so it sorts)
//   item      what was on the lorry, in the office's own words
//   from/to   which site or store it left, and which one it is going to
//   qty       free text on purpose: "2", "2 sets", "1 lot" are all real answers
//   driver    who drove it — a name from the drivers list below
//   doNum     the delivery order number — the piece of paper this line matches
//   remark    anything the columns above cannot hold
//   received  ticked when the receiving end confirms it arrived
//
// NO DELIVERY IS SEEDED. An invented delivery in a delivery record is worse
// than an empty page: the office would have to work out which lines are real.
//
// THE DRIVERS LIST is kept here too, in the order the office reads it: loader
// first, then cargo, then the lorries. It is a list, not a fence — it is edited
// on the page (Driver: Edit list), and taking a driver off it does not touch the
// deliveries they have already driven.
window.DELIVERY_DATA = {
  updated: "2026-08-26",
  drivers: [
    {"name": "Syamizie", "vehicle": "Loader"},
    {"name": "Sudin", "vehicle": "Cargo"},
    {"name": "Zul", "vehicle": "Lorry"},
    {"name": "Wan", "vehicle": "Lorry"},
    {"name": "Din", "vehicle": "Lorry"}
  ],
  rows: [

  ]
};
