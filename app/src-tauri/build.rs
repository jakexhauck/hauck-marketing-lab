use std::path::Path;

fn main() {
    // `src/google_oauth_secrets.rs` is gitignored (GitHub push protection
    // flags desktop-app OAuth client IDs even though they aren't really
    // secrets). On a fresh checkout, materialise a stub so the crate
    // compiles — the Google Calendar flow will refuse to connect until
    // real values are pasted in.
    let secrets = Path::new("src/google_oauth_secrets.rs");
    if !secrets.exists() {
        let stub = "// Auto-generated stub. Replace with real Desktop OAuth\n\
                    // values from Google Cloud Console to enable calendar sync.\n\
                    #[allow(dead_code)]\n\
                    pub const CLIENT_ID: &str = \"\";\n\
                    #[allow(dead_code)]\n\
                    pub const CLIENT_SECRET: &str = \"\";\n";
        std::fs::write(secrets, stub).expect("write google_oauth_secrets.rs stub");
    }

    tauri_build::build()
}
