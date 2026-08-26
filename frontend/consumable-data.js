// Consumable items — the things that get used up, as opposed to the tools,
// which get moved. Written by tools/tooling-api.py when the page saves.
//
// WHERE THIS LIVES, AND WHY IT IS NOT IN THE GOOGLE SHEET (yet): the tooling
// half reads the office's own spreadsheet, but that sheet has no consumables
// section, and this machine cannot create one in a file it does not own. So
// this is a local record for now. Moving it into the sheet later is a copy job,
// not a rebuild — the shape below is deliberately the same idea as the sheet's:
// a catalogue of items, and one line per request against it.
//
//   items  the catalogue — what we buy, HOW MANY THE STORE HOLDS (qty), and how
//          low it may get before reordering (min)
//   stock  one line per (item, site): how many that site has asked for and
//          taken. Every one of these comes OFF the store's count — All rows
//          shows what is left, not what was bought.
//
// A BLANK qty IS NOT A ZERO. Blank means nobody has counted; zero means somebody
// looked and there were none. Roller Bit is a real zero — we are out of them.
window.CONSUMABLE_DATA = {
  updated: "2026-08-26",
  items: [
    { id: "kelly-pin-38",     name: "Kelly pin OD 38mm",     size: "OD 38mm", unit: "pcs",  qty: "5",    min: "", remark: "" },
    { id: "kelly-pin-55",     name: "Kelly pin OD 55mm",     size: "OD 55mm", unit: "pcs",  qty: "10",   min: "", remark: "" },
    { id: "kelly-pin-60",     name: "Kelly pin OD 60mm",     size: "OD 60mm", unit: "pcs",  qty: "14",   min: "", remark: "" },
    { id: "m8-r-pin",         name: "M8 R-pin",              size: "M8",      unit: "pcs",  qty: "65",   min: "", remark: "" },
    { id: "bullet-teeth",     name: "Bullet Teeth",          size: "",        unit: "pcs",  qty: "1113", min: "", remark: "55 box x 20 pcs + 1 box x 13 pcs" },
    { id: "bullet-holder",    name: "Bullet Teeth Holder",   size: "",        unit: "pcs",  qty: "30",   min: "", remark: "" },
    { id: "roller-bit",       name: "Roller Bit",            size: "",        unit: "pcs",  qty: "0",    min: "", remark: "" },
    { id: "sonic-50",         name: "Sonic Logging OD 50mm", size: "OD 50mm", unit: "L",    qty: "7",    min: "", remark: "" },
    { id: "sonic-60",         name: "Sonic Logging OD 60mm", size: "OD 60mm", unit: "L",    qty: "111",  min: "", remark: "" },
    { id: "soda",             name: "Soda",                  size: "",        unit: "bag",  qty: "16",   min: "", remark: "" },
    { id: "polymer",          name: "Polymer",               size: "",        unit: "bag",  qty: "5",    min: "", remark: "" },
    { id: "t25-bucket-teeth", name: "T25 Bucket Teeth",      size: "",        unit: "pcs",  qty: "29",   min: "", remark: "" },
    { id: "t25-holder",       name: "T25 Holder",            size: "",        unit: "pcs",  qty: "9",    min: "", remark: "" },
    { id: "t25-lock-pin",     name: "T25 Lock & Pin",        size: "",        unit: "set",  qty: "9",    min: "", remark: "" },
    { id: "million-tape-50",  name: "Million Tape 50m",      size: "50m",     unit: "pcs",  qty: "3",    min: "", remark: "" }
  ],
  stock: []
};
