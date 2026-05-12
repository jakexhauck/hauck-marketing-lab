mod benchmarks;
mod chat;
mod claude;
mod clients;
mod config;
mod creatives;
mod credentials;
mod dashboard_state;
mod diagnosis;
mod drive_index;
mod events;
mod folder;
mod frontmatter;
mod generators;
mod knowledge;
mod kpi;
mod launch_checklist;
mod sync;
mod tracking;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            knowledge::read_knowledge_chunk,
            chat::create_chat,
            chat::read_chat,
            chat::append_turn,
            chat::replace_last_turn,
            claude::check_claude,
            claude::invoke_claude,
            launch_checklist::read_launch_checklist,
            launch_checklist::write_launch_checklist,
            launch_checklist::save_launch_readiness_verdict,
            clients::list_clients,
            clients::read_client_status,
            clients::set_client_status,
            clients::add_client,
            clients::rename_client,
            clients::delete_client,
            clients::set_client_benchmarks,
            clients::set_client_drive_folder,
            drive_index::read_drive_index,
            drive_index::refresh_drive_index,
            benchmarks::list_benchmark_sets,
            benchmarks::read_benchmarks_for_client,
            kpi::read_latest_kpis,
            kpi::read_kpi_history,
            kpi::write_kpi_entry,
            tracking::read_tracking_audit,
            tracking::write_tracking_audit,
            credentials::read_client_credentials,
            credentials::write_client_credentials,
            credentials::clear_client_credentials,
            creatives::read_creatives_manifest,
            creatives::write_creatives_manifest,
            diagnosis::save_diagnosis,
            diagnosis::read_latest_diagnosis,
            generators::save_generator_output,
            generators::list_generator_outputs,
            generators::read_latest_generator_output,
            sync::git_sync,
            dashboard_state::read_dashboard_state,
            dashboard_state::write_dashboard_state,
            vault::read_vault_note,
            vault::write_vault_note,
            vault::append_to_memory,
            vault::read_about_notes,
            vault::read_client_notes,
            vault::find_knowledge_notes,
            vault::list_vault_notes,
            vault::vault_root_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
