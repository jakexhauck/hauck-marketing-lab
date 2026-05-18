use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// Emitted whenever the watcher sees a meaningful change under the configured
/// root. Frontend hooks subscribe to `vault://changed` and refetch when the
/// `kind` matches what they read from disk.
#[derive(Debug, Clone, Serialize)]
pub struct VaultChanged {
    pub kind: String,
    pub path: String,
    pub client_slug: Option<String>,
}

/// Holds the active debouncer so the watcher survives the lifetime of the app.
pub struct WatcherState {
    pub root: Mutex<Option<PathBuf>>,
    _keep_alive: Mutex<Option<Box<dyn std::any::Any + Send>>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            root: Mutex::new(None),
            _keep_alive: Mutex::new(None),
        }
    }
}

fn classify(path: &Path) -> Option<(&'static str, Option<String>)> {
    let s = path.to_string_lossy().replace('\\', "/");
    let lower = s.to_lowercase();

    // Skip noisy files.
    if lower.ends_with(".tmp") || lower.ends_with("~") || lower.contains("/.git/") {
        return None;
    }

    let slug_from = |segment: &str| -> Option<String> {
        let needle = format!("/{}/", segment);
        let idx = lower.find(&needle)?;
        let tail = &s[idx + needle.len()..];
        let next_slash = tail.find('/').unwrap_or(tail.len());
        Some(tail[..next_slash].to_string())
    };

    if lower.contains("/vault/clients/") {
        return Some(("client", slug_from("Clients")));
    }
    if lower.contains("/vault/about/") {
        return Some(("about", None));
    }
    if lower.contains("/vault/ops/tasks.json") || lower.contains("/vault/ops/") {
        return Some(("ops", None));
    }
    if lower.contains("/vault/knowledge/") {
        return Some(("knowledge", None));
    }
    if lower.contains("/vault/playbooks/") {
        return Some(("playbooks", None));
    }
    if lower.contains("/recordings/") || lower.contains("/fathom/") {
        return Some(("recordings", None));
    }
    if lower.contains("/clients.yaml") {
        return Some(("clients", None));
    }
    None
}

/// Spawn (or replace) the watcher for the given root directory. Idempotent —
/// calling with a new root tears down the previous watcher.
pub fn install_for_root(app: &AppHandle, root: &Path) -> Result<(), String> {
    let state: tauri::State<WatcherState> = app.state();
    {
        let mut current = state.root.lock().unwrap();
        if current.as_ref().map(|p| p.as_path()) == Some(root) {
            return Ok(());
        }
        *current = Some(root.to_path_buf());
    }

    let app_handle = app.clone();
    let mut debouncer = new_debouncer(Duration::from_millis(150), move |res: notify_debouncer_mini::DebounceEventResult| {
        let events = match res {
            Ok(evts) => evts,
            Err(_) => return,
        };
        for evt in events {
            if !matches!(evt.kind, DebouncedEventKind::Any) {
                continue;
            }
            if let Some((kind, slug)) = classify(&evt.path) {
                let payload = VaultChanged {
                    kind: kind.to_string(),
                    path: evt.path.to_string_lossy().to_string(),
                    client_slug: slug,
                };
                let _ = app_handle.emit("vault://changed", payload);
            }
        }
    })
    .map_err(|e| e.to_string())?;

    // Watch the whole root recursively — classification filters out noise.
    debouncer
        .watcher()
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let mut keep = state._keep_alive.lock().unwrap();
    *keep = Some(Box::new(debouncer));
    Ok(())
}

#[tauri::command]
pub fn watch_root(app: AppHandle, root: String) -> Result<(), String> {
    install_for_root(&app, Path::new(&root))
}
