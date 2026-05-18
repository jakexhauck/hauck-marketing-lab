use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum DataKind {
    Diagnosis,
    Kpi,
    Tracking,
    Creatives,
    Onboarding,
    Chat,
    Client,
    Hooks,
    Briefs,
    Reports,
    ScaleChecks,
    Audits,
    Workflows,
    DashboardState,
    Vault,
    Activity,
}

#[derive(Debug, Serialize, Clone)]
pub struct DataChanged {
    pub kind: DataKind,
    pub client_slug: Option<String>,
    pub path: Option<String>,
}

pub fn emit_changed(
    app: &AppHandle,
    kind: DataKind,
    client_slug: Option<String>,
    path: Option<String>,
) {
    let _ = app.emit(
        "data://changed",
        DataChanged {
            kind,
            client_slug,
            path,
        },
    );
}
