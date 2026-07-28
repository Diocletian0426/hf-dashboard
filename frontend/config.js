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
  SUPABASE_KEY: "sb_publishable_mkW7DcSITuXpOGtZHTGFjQ_ZNczYv1t",

  // ---------------------------------------------------------------------------
  // Which "Continue with …" buttons the sign-in page shows.
  //
  // DELIBERATELY EMPTY. A button that is not backed by a configured provider
  // just throws an error when tapped, which looks broken and teaches people to
  // distrust the login page — so we never show one. The page falls back to
  // email + password, which works today.
  //
  // TO TURN ONE ON, do the Supabase side FIRST, then add the code here:
  //
  //   "google"  Supabase dashboard -> Authentication -> Providers -> Google.
  //             Needs a Google Cloud OAuth client (free).
  //             Authorised redirect URI to paste into Google Cloud:
  //             https://fwuftjunybbxlhwauxta.supabase.co/auth/v1/callback
  //
  //   "azure"   Same page -> Azure. Needs an app registration in Microsoft
  //             Entra ID (free tier is enough). Same callback URL as above.
  //             NOTE the code is "azure", not "microsoft".
  //
  // Also required in Supabase -> Authentication -> URL Configuration, or the
  // sign-in will bounce back to the wrong place:
  //   Site URL              https://diocletian0426.github.io/hf-dashboard/
  //   Additional redirect   http://localhost:8123/**   (for local testing)
  //
  // Apple is deliberately not supported: it needs a paid Apple Developer
  // account (~USD 99/year), which is not worth it for an internal dashboard.
  //
  // To preview the buttons before configuring anything, set this to
  // ["google", "azure"] — they will render, but tapping one will error.
  // ---------------------------------------------------------------------------
  AUTH_PROVIDERS: [],

  // ---------------------------------------------------------------------------
  // Whether the sign-in page offers a "Create account" tab.
  //
  // FALSE because self sign-up is currently switched OFF in Supabase (verified:
  // the server answers "signup_disabled"). Showing a tab that always fails is
  // the same mistake as showing a social button with no provider behind it.
  //
  // TO TURN IT ON, BOTH of these must be done, in this order:
  //   1. Supabase dashboard -> Authentication -> Sign In / Providers ->
  //      turn ON "Allow new users to sign up".
  //   2. Apply hf-database migration 0069, which adds request_account(). Without
  //      it a new sign-up creates a login that no office screen can see, so
  //      nobody would know to approve it.
  //
  // Signing up never grants access on its own: the new user has no row in
  // user_accounts, so every database gate refuses them until an administrator
  // approves them and assigns an access profile.
  //
  // Set to true to preview the Create account tab before either step is done.
  // ---------------------------------------------------------------------------
  ALLOW_SIGNUP: false
};
