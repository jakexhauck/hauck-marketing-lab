mod chat;
mod claude;
mod config;
mod folder;
mod frontmatter;

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
            folder::list_skills,
            folder::list_knowledge_titles,
            chat::create_chat,
            chat::read_chat,
            chat::append_turn,
            chat::replace_last_turn,
            claude::check_claude,
            claude::invoke_claude,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
