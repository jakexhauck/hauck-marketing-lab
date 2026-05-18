// Provisions a new tenant in the client-dashboard Supabase project.
//
// Called from the desktop app's onboarding checklist when finishing the
// "Provision mobile app" step. Performs three actions against Supabase
// using the service-role key:
//   1. Invite the client's email (creates auth.users row + sends magic link).
//      If the user already exists, look up their ID instead — idempotent.
//   2. Upsert a row in public.tenants keyed by `slug` (so re-runs update
//      brand/GHL details rather than failing).
//   3. Insert a row in public.tenant_users linking the user to the tenant
//      with role = 'owner'. Idempotent via Prefer: resolution=ignore-duplicates.
//
// The service-role key bypasses RLS, so this never goes through the renderer.
// Returns the tenant_id + user_id + whether an invite email was sent.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::supabase_secrets::{SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvisionInput {
    pub client_email: String,
    pub slug: String,
    pub name: String,
    pub niche: String,
    pub brand_color: String,
    pub brand_initials: String,
    pub app_name: String,
    pub won_label: String,
    pub value_label: String,
    pub ghl_location_id: String,
    pub ghl_token: String,
    pub monthly_spend: f64,
    /// When true, send a Supabase invite email (magic link). When false,
    /// create the user silently — the client must request a sign-in link
    /// from the mobile app login page.
    #[serde(default = "default_true")]
    pub send_invite: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvisionResult {
    pub tenant_id: String,
    pub user_id: String,
    pub user_email: String,
    pub invited: bool,
    pub already_existed: bool,
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .expect("reqwest client build")
}

fn check_secrets() -> Result<(), String> {
    if SUPABASE_URL.is_empty() || SUPABASE_SERVICE_ROLE_KEY.is_empty() {
        return Err(
            "Supabase secrets not configured. Paste values into app/src-tauri/src/supabase_secrets.rs."
                .to_string(),
        );
    }
    Ok(())
}

/// Look up a user by email via the auth admin API. Returns the user ID if found.
async fn find_user_by_email(email: &str) -> Result<Option<String>, String> {
    let url = format!(
        "{}/auth/v1/admin/users?email={}",
        SUPABASE_URL,
        urlencoding::encode(email)
    );
    let resp = client()
        .get(&url)
        .bearer_auth(SUPABASE_SERVICE_ROLE_KEY)
        .header("apikey", SUPABASE_SERVICE_ROLE_KEY)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("find user: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("find user ({status}): {text}"));
    }
    let body: Value = serde_json::from_str(&text)
        .map_err(|e| format!("parse find user response: {e} — body: {text}"))?;
    // The admin/users endpoint returns either { users: [...] } or a paginated shape.
    let users = body.get("users").cloned().unwrap_or(body);
    let arr = users.as_array().cloned().unwrap_or_default();
    let target = email.to_ascii_lowercase();
    for u in arr {
        let candidate = u
            .get("email")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if candidate == target {
            if let Some(id) = u.get("id").and_then(|v| v.as_str()) {
                return Ok(Some(id.to_string()));
            }
        }
    }
    Ok(None)
}

/// Send an invite email via the auth invite endpoint. Creates the user if
/// missing and sends a magic-link email to set up their account.
async fn invite_user(email: &str) -> Result<String, String> {
    let url = format!("{}/auth/v1/invite", SUPABASE_URL);
    let resp = client()
        .post(&url)
        .bearer_auth(SUPABASE_SERVICE_ROLE_KEY)
        .header("apikey", SUPABASE_SERVICE_ROLE_KEY)
        .header("Content-Type", "application/json")
        .json(&json!({ "email": email }))
        .send()
        .await
        .map_err(|e| format!("invite user: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("invite user ({status}): {text}"));
    }
    let body: Value = serde_json::from_str(&text)
        .map_err(|e| format!("parse invite response: {e} — body: {text}"))?;
    body.get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("invite response missing id: {text}"))
}

/// Create the user silently without sending an email.
async fn create_user_silent(email: &str) -> Result<String, String> {
    let url = format!("{}/auth/v1/admin/users", SUPABASE_URL);
    let resp = client()
        .post(&url)
        .bearer_auth(SUPABASE_SERVICE_ROLE_KEY)
        .header("apikey", SUPABASE_SERVICE_ROLE_KEY)
        .header("Content-Type", "application/json")
        .json(&json!({ "email": email, "email_confirm": true }))
        .send()
        .await
        .map_err(|e| format!("create user: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("create user ({status}): {text}"));
    }
    let body: Value = serde_json::from_str(&text)
        .map_err(|e| format!("parse create user response: {e} — body: {text}"))?;
    body.get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("create user response missing id: {text}"))
}

/// Upsert into public.tenants keyed by slug. Returns the tenant ID.
async fn upsert_tenant(input: &ProvisionInput) -> Result<String, String> {
    let url = format!("{}/rest/v1/tenants?on_conflict=slug", SUPABASE_URL);
    let resp = client()
        .post(&url)
        .bearer_auth(SUPABASE_SERVICE_ROLE_KEY)
        .header("apikey", SUPABASE_SERVICE_ROLE_KEY)
        .header("Content-Type", "application/json")
        .header("Prefer", "resolution=merge-duplicates,return=representation")
        .json(&json!({
            "slug": input.slug,
            "name": input.name,
            "niche": input.niche,
            "brand_color": input.brand_color,
            "brand_initials": input.brand_initials,
            "app_name": input.app_name,
            "won_label": input.won_label,
            "value_label": input.value_label,
            "ghl_location_id": input.ghl_location_id,
            "ghl_token": input.ghl_token,
            "monthly_spend": input.monthly_spend,
        }))
        .send()
        .await
        .map_err(|e| format!("upsert tenant: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("upsert tenant ({status}): {text}"));
    }
    let body: Value = serde_json::from_str(&text)
        .map_err(|e| format!("parse tenant response: {e} — body: {text}"))?;
    let arr = body.as_array().cloned().unwrap_or_default();
    let first = arr
        .first()
        .ok_or_else(|| format!("tenant response empty: {text}"))?;
    first
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("tenant response missing id: {text}"))
}

/// Insert a tenant_users row. Ignores duplicates so reruns don't error.
async fn link_tenant_user(tenant_id: &str, user_id: &str) -> Result<(), String> {
    let url = format!("{}/rest/v1/tenant_users", SUPABASE_URL);
    let resp = client()
        .post(&url)
        .bearer_auth(SUPABASE_SERVICE_ROLE_KEY)
        .header("apikey", SUPABASE_SERVICE_ROLE_KEY)
        .header("Content-Type", "application/json")
        .header("Prefer", "resolution=ignore-duplicates")
        .json(&json!({
            "tenant_id": tenant_id,
            "user_id": user_id,
            "role": "owner",
        }))
        .send()
        .await
        .map_err(|e| format!("link tenant_user: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("link tenant_user ({status}): {text}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn provision_mobile_tenant(
    input: ProvisionInput,
) -> Result<ProvisionResult, String> {
    check_secrets()?;

    let email = input.client_email.trim().to_string();
    if email.is_empty() {
        return Err("client_email is required".to_string());
    }

    let existing = find_user_by_email(&email).await?;
    let (user_id, invited, already_existed) = match existing {
        Some(id) => (id, false, true),
        None => {
            if input.send_invite {
                (invite_user(&email).await?, true, false)
            } else {
                (create_user_silent(&email).await?, false, false)
            }
        }
    };

    let tenant_id = upsert_tenant(&input).await?;
    link_tenant_user(&tenant_id, &user_id).await?;

    Ok(ProvisionResult {
        tenant_id,
        user_id,
        user_email: email,
        invited,
        already_existed,
    })
}
