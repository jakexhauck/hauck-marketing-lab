use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ScraperEvent {
    Started {
        id: String,
    },
    Line {
        id: String,
        text: String,
        stream: String,
    },
    Done {
        id: String,
        exit_code: i32,
        csv_path: Option<String>,
    },
    Error {
        id: String,
        message: String,
    },
}

#[derive(Debug, Serialize, Clone)]
pub struct ProspectFile {
    pub name: String,
    pub path: String,
    pub modified_unix: u64,
    pub size_bytes: u64,
}

fn scraper_dir(root: &str) -> Result<PathBuf, String> {
    let r = PathBuf::from(root);
    let parent = r
        .parent()
        .ok_or_else(|| "could not determine repo root from media-buying path".to_string())?;
    let dir = parent.join("lead-scraper");
    if !dir.exists() {
        return Err(format!(
            "lead-scraper directory not found at {}. Expected it next to the media-buying folder.",
            dir.display()
        ));
    }
    Ok(dir)
}

fn python_command() -> Command {
    #[cfg(windows)]
    {
        Command::new("python")
    }
    #[cfg(not(windows))]
    {
        Command::new("python3")
    }
}

fn latest_csv(dir: &PathBuf) -> Option<String> {
    let prospects = dir.join("prospects");
    let mut newest: Option<(SystemTime, PathBuf)> = None;
    let entries = std::fs::read_dir(&prospects).ok()?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("csv") {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let Ok(m) = meta.modified() else { continue };
        if newest.as_ref().map_or(true, |(t, _)| m > *t) {
            newest = Some((m, p));
        }
    }
    newest.map(|(_, p)| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn run_lead_scraper(
    app: AppHandle,
    id: String,
    root: String,
    niche: String,
    city: String,
) -> Result<(), String> {
    let dir = scraper_dir(&root)?;
    let script = dir.join("scrape.py");
    if !script.exists() {
        return Err(format!("scrape.py not found at {}", script.display()));
    }

    let _ = app.emit(
        "lead_scraper://stream",
        ScraperEvent::Started { id: id.clone() },
    );

    let mut cmd = python_command();
    cmd.current_dir(&dir)
        .arg("-u") // unbuffered stdout — emit lines as they happen
        .arg("scrape.py")
        .arg(&niche)
        .arg(&city)
        .env("PYTHONIOENCODING", "utf-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to spawn python: {e}. Is Python installed and on PATH? Try running `python --version` in a terminal."
        )
    })?;

    let stdout = child.stdout.take().ok_or("no stdout pipe")?;
    let stderr = child.stderr.take();

    let app_err = app.clone();
    let id_err = id.clone();
    if let Some(stderr) = stderr {
        tauri::async_runtime::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }
                let _ = app_err.emit(
                    "lead_scraper://stream",
                    ScraperEvent::Line {
                        id: id_err.clone(),
                        text: line,
                        stream: "stderr".to_string(),
                    },
                );
            }
        });
    }

    let mut reader = BufReader::new(stdout).lines();
    while let Some(line) = reader
        .next_line()
        .await
        .map_err(|e| format!("read stdout failed: {e}"))?
    {
        let _ = app.emit(
            "lead_scraper://stream",
            ScraperEvent::Line {
                id: id.clone(),
                text: line,
                stream: "stdout".to_string(),
            },
        );
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("wait on python failed: {e}"))?;
    let code = status.code().unwrap_or(-1);

    let csv_path = latest_csv(&dir);
    let _ = app.emit(
        "lead_scraper://stream",
        ScraperEvent::Done {
            id: id.clone(),
            exit_code: code,
            csv_path,
        },
    );

    if code != 0 {
        return Err(format!("scraper exited with code {code}"));
    }
    Ok(())
}

#[tauri::command]
pub fn list_prospect_files(root: String) -> Result<Vec<ProspectFile>, String> {
    let dir = scraper_dir(&root)?;
    let prospects = dir.join("prospects");
    let mut files = Vec::new();
    let Ok(entries) = std::fs::read_dir(&prospects) else {
        return Ok(files);
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("csv") {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        files.push(ProspectFile {
            name: p
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            path: p.to_string_lossy().into_owned(),
            modified_unix: modified,
            size_bytes: meta.len(),
        });
    }
    files.sort_by(|a, b| b.modified_unix.cmp(&a.modified_unix));
    Ok(files)
}

#[tauri::command]
pub fn lead_scraper_paths(root: String) -> Result<(String, String), String> {
    let dir = scraper_dir(&root)?;
    let prospects = dir.join("prospects");
    Ok((
        dir.to_string_lossy().into_owned(),
        prospects.to_string_lossy().into_owned(),
    ))
}
