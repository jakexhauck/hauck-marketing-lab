use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct SyncResult {
    pub ok: bool,
    pub summary: String,
    pub detail: String,
    pub committed: bool,
    pub pulled: bool,
    pub pushed: bool,
}

fn run_git(repo: &Path, args: &[&str]) -> Result<(String, String, bool), String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| format!("failed to spawn git: {e}. Is git installed and on PATH?"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    Ok((stdout, stderr, out.status.success()))
}

fn find_git_root(start: &Path) -> Result<PathBuf, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(start)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .map_err(|e| format!("failed to spawn git: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "not a git repository at {}: {}",
            start.display(),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        return Err("git rev-parse returned empty path".into());
    }
    Ok(PathBuf::from(path))
}

fn hostname() -> String {
    if let Ok(h) = std::env::var("COMPUTERNAME") {
        if !h.is_empty() {
            return h;
        }
    }
    if let Ok(h) = std::env::var("HOSTNAME") {
        if !h.is_empty() {
            return h;
        }
    }
    "unknown-host".to_string()
}

#[tauri::command]
pub fn git_sync(root: String) -> Result<SyncResult, String> {
    let start = PathBuf::from(&root);
    if !start.exists() {
        return Err(format!("path does not exist: {root}"));
    }
    let repo = find_git_root(&start)?;
    let mut detail = String::new();
    detail.push_str(&format!("Repo: {}\n", repo.display()));

    // 1. detect local changes
    let (status_out, status_err, status_ok) = run_git(&repo, &["status", "--porcelain"])?;
    if !status_ok {
        return Err(format!("git status failed: {}", status_err.trim()));
    }
    let dirty = !status_out.trim().is_empty();
    let mut committed = false;

    if dirty {
        let changed_lines = status_out.lines().count();
        detail.push_str(&format!("Local changes: {changed_lines} file(s)\n"));
        let (_, add_err, add_ok) = run_git(&repo, &["add", "-A"])?;
        if !add_ok {
            return Err(format!("git add failed: {}", add_err.trim()));
        }
        let ts = chrono::Utc::now().format("%Y-%m-%d %H:%M UTC").to_string();
        let host = hostname();
        let msg = format!("Sync from {host} ({ts})");
        let (commit_out, commit_err, commit_ok) =
            run_git(&repo, &["commit", "-m", &msg])?;
        if !commit_ok {
            return Err(format!(
                "git commit failed: {}\n{}",
                commit_err.trim(),
                commit_out.trim()
            ));
        }
        committed = true;
        detail.push_str(&format!("Committed: {msg}\n"));
    } else {
        detail.push_str("Local changes: none\n");
    }

    // 2. pull --rebase --autostash
    let (pull_out, pull_err, pull_ok) =
        run_git(&repo, &["pull", "--rebase", "--autostash", "origin"])?;
    if !pull_ok {
        return Err(format!(
            "git pull failed: {}\n{}\n\nResolve manually in the repo, then sync again.",
            pull_err.trim(),
            pull_out.trim()
        ));
    }
    let pulled = !pull_out.contains("Already up to date") && !pull_out.contains("up to date");
    detail.push_str(&format!("Pull: {}\n", pull_out.trim()));

    // 3. push
    let (push_out, push_err, push_ok) = run_git(&repo, &["push", "origin", "HEAD"])?;
    if !push_ok {
        let combined = format!("{}\n{}", push_err.trim(), push_out.trim());
        return Err(format!("git push failed: {}", combined.trim()));
    }
    let push_combined = format!("{}{}", push_out, push_err);
    let pushed = !push_combined.contains("Everything up-to-date");
    detail.push_str(&format!("Push: {}\n", push_combined.trim()));

    let summary = match (committed, pulled, pushed) {
        (false, false, false) => "Already in sync.".to_string(),
        (true, false, true) => "Local changes pushed.".to_string(),
        (false, true, false) => "Pulled remote changes.".to_string(),
        (true, true, true) => "Synced (commit + pull + push).".to_string(),
        (true, false, false) => "Committed locally (nothing to push).".to_string(),
        (false, true, true) => "Pulled and pushed.".to_string(),
        (true, true, false) => "Committed and pulled.".to_string(),
        (false, false, true) => "Pushed.".to_string(),
    };

    Ok(SyncResult {
        ok: true,
        summary,
        detail,
        committed,
        pulled,
        pushed,
    })
}
