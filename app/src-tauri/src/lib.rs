mod chat;
mod claude;
mod config;
mod creatives;
mod diagnosis;
mod events;
mod folder;
mod frontmatter;
mod knowledge;
mod kpi;
mod launch_checklist;
mod tracking;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            config::load_config,
            config::save_config,
            config::suggest_folder_candidates,
            folder::parse_folder,
            folder::read_agent_body,
            folder::load_skill,
            folder::list_skills,
            folder::list_knowledge_titles,
            knowledge::parse_skill_router,
            knowledge::match_knowledge_chunks,
            chat::create_chat,
            chat::read_chat,
            chat::append_turn,
            chat::replace_last_turn,
            claude::check_claude,
            claude::invoke_claude,
            launch_checklist::read_launch_checklist,
            launch_checklist::write_launch_checklist,
            launch_checklist::list_clients,
            launch_checklist::read_client_status,
            launch_checklist::set_client_status,
            launch_checklist::save_launch_readiness_verdict,
            kpi::read_latest_kpis,
            kpi::read_kpi_history,
            kpi::write_kpi_entry,
            tracking::read_tracking_audit,
            tracking::write_tracking_audit,
            creatives::read_creatives_manifest,
            creatives::write_creatives_manifest,
            diagnosis::save_diagnosis,
            diagnosis::read_latest_diagnosis,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
