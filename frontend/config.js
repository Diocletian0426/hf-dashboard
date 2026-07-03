// -----------------------------------------------------------------------------
// HF Dashboard — connection details
//
// SAFE TO BE PUBLIC. This "publishable key" on its own can read NOTHING once the
// database lockdown migration (hf-database 0020) is applied: every dashboard
// query only works with a signed-in office account on top of it. Security comes
// from the database's grants + Row Level Security, not from hiding this key.
// (Same key and same reasoning as hf-punch-system/frontend/config.js.)
// -----------------------------------------------------------------------------
window.DASH_CONFIG = {
  SUPABASE_URL: "https://fwuftjunybbxlhwauxta.supabase.co",
  SUPABASE_KEY: "sb_publishable_mkW7DcSITuXpOGtZHTGFjQ_ZNczYv1t"
};
