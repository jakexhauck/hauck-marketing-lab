use std::path::Path;

fn main() {
    // `src/google_oauth_secrets.rs` is gitignored (GitHub push protection
    // flags desktop-app OAuth client IDs even though they aren't really
    // secrets). On a fresh checkout, materialise a stub so the crate
    // compiles — the Google Calendar flow will refuse to connect until
    // real values are pasted in.
    let google_secrets = Path::new("src/google_oauth_secrets.rs");
    if !google_secrets.exists() {
        let stub = "// Auto-generated stub. Replace with real Desktop OAuth\n\
                    // values from Google Cloud Console to enable calendar sync.\n\
                    #[allow(dead_code)]\n\
                    pub const CLIENT_ID: &str = \"\";\n\
                    #[allow(dead_code)]\n\
                    pub const CLIENT_SECRET: &str = \"\";\n";
        std::fs::write(google_secrets, stub).expect("write google_oauth_secrets.rs stub");
    }

    // Same trick for the Meta Marketing API credentials. The System User
    // token is a true secret (full ads_read on the business portfolio),
    // so the file is gitignored and a fresh checkout gets a blank stub.
    // meta_ads.rs returns an empty-account error if the token is missing.
    let meta_secrets = Path::new("src/meta_oauth_secrets.rs");
    if !meta_secrets.exists() {
        let stub = "// Auto-generated stub. Paste real values from the Meta\n\
                    // App dashboard + System User to enable the Ads Manager.\n\
                    #[allow(dead_code)]\n\
                    pub const META_APP_ID: &str = \"\";\n\
                    #[allow(dead_code)]\n\
                    pub const META_APP_SECRET: &str = \"\";\n\
                    pub const META_SYSTEM_USER_TOKEN: &str = \"\";\n";
        std::fs::write(meta_secrets, stub).expect("write meta_oauth_secrets.rs stub");
    }

    // Supabase service-role key for the client-dashboard project. Used to
    // provision tenants + tenant_users when onboarding a new client. The
    // service role bypasses RLS, so the file is gitignored.
    // mobile_app_provision.rs returns an error if either value is missing.
    let supabase_secrets = Path::new("src/supabase_secrets.rs");
    if !supabase_secrets.exists() {
        let stub = "// Auto-generated stub. Paste the Supabase URL + service role\n\
                    // key from the client-dashboard project (Supabase dashboard ->\n\
                    // Project Settings -> API) to enable mobile app provisioning.\n\
                    #[allow(dead_code)]\n\
                    pub const SUPABASE_URL: &str = \"\";\n\
                    #[allow(dead_code)]\n\
                    pub const SUPABASE_SERVICE_ROLE_KEY: &str = \"\";\n";
        std::fs::write(supabase_secrets, stub).expect("write supabase_secrets.rs stub");
    }

    tauri_build::build()
}
