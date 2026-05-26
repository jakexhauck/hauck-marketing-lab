mod ads_log;
mod benchmarks;
mod chat;
mod claude;
mod client_docs;
mod clients;
mod config;
mod copywriter;
mod creatives;
mod credentials;
mod dashboard_state;
mod diagnosis;
mod drive_api;
mod drive_index;
mod drive_upload;
mod events;
mod fathom;
mod folder;
mod frontmatter;
mod gemini_image;
mod generators;
mod ghl;
mod google_calendar;
mod google_oauth_secrets;
mod knowledge;
mod kpi;
mod lead_scraper;
mod meta_actions;
mod meta_ads;
mod meta_oauth_secrets;
mod mobile_app_provision;
mod onboarding;
mod supabase_secrets;
mod ops;
mod ops_activity;
mod personal;
mod pitch_decks;
mod playbooks;
mod prospects;
mod replicate;
mod sops;
mod sync;
mod tracking;
mod vault;
mod watcher;
mod web_designer;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(watcher::WatcherState::new())
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
            onboarding::read_onboarding_state,
            onboarding::write_onboarding_state,
            clients::list_clients,
            clients::read_client_status,
            clients::set_client_status,
            clients::add_client,
            clients::rename_client,
            clients::delete_client,
            clients::set_client_benchmarks,
            clients::set_client_drive_folder,
            clients::set_client_doc_folder_default,
            clients::set_client_sequence_folder_default,
            clients::set_client_optimizer,
            ads_log::write_ads_log_snapshot,
            ads_log::read_ads_log,
            client_docs::list_client_docs,
            client_docs::list_all_docs,
            client_docs::read_client_doc,
            client_docs::create_client_doc,
            client_docs::update_client_doc_body,
            client_docs::rename_client_doc,
            client_docs::set_client_doc_target_folder,
            client_docs::delete_client_doc,
            drive_index::read_drive_index,
            drive_index::refresh_drive_index,
            drive_upload::upload_output_to_drive,
            drive_upload::push_client_doc_to_drive,
            drive_upload::pull_client_doc_from_drive,
            drive_upload::push_sequence_step_to_drive,
            drive_upload::push_ad_variation_to_drive,
            drive_api::drive_delete_file,
            drive_api::sweep_drive_deleted_docs,
            drive_api::upload_local_file_to_drive,
            drive_api::upload_bytes_to_drive,
            drive_api::list_drive_subfolders,
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
            generators::delete_generator_output,
            generators::rename_generator_output,
            pitch_decks::save_pitch_deck,
            pitch_decks::list_pitch_decks,
            pitch_decks::open_pitch_deck,
            gemini_image::generate_nano_banana_image,
            gemini_image::generate_creative_set,
            replicate::search_replicate_models,
            replicate::get_replicate_model,
            replicate::run_replicate_prediction,
            replicate::save_replicate_output,
            replicate::file_to_data_uri,
            replicate::import_local_creative,
            sync::git_sync,
            lead_scraper::run_lead_scraper,
            lead_scraper::list_prospect_files,
            lead_scraper::lead_scraper_paths,
            prospects::list_prospects,
            prospects::read_prospect,
            prospects::promote_lead_to_prospect,
            prospects::add_prospect,
            prospects::delete_prospect,
            prospects::update_prospect_status,
            dashboard_state::read_dashboard_state,
            dashboard_state::write_dashboard_state,
            ops::read_ops_clients,
            ops::write_ops_clients,
            ops::read_ops_tasks,
            ops::write_ops_tasks,
            ops::read_ops_revenue,
            ops::write_ops_revenue,
            ops::read_ops_appointments,
            ops::write_ops_appointments,
            ops_activity::append_activity,
            ops_activity::tail_activity,
            ops_activity::read_activity_state,
            ops_activity::mark_activity_seen,
            personal::read_personal_hub,
            personal::write_personal_hub,
            vault::read_vault_note,
            vault::write_vault_note,
            vault::delete_vault_note,
            vault::append_to_memory,
            vault::append_facts_to_memory,
            vault::commit_memory_changes,
            vault::save_transcript,
            fathom::fetch_fathom_transcript,
            vault::read_about_notes,
            vault::read_client_notes,
            vault::find_knowledge_notes,
            vault::list_vault_notes,
            vault::vault_root_path,
            sops::list_sops,
            sops::read_sop,
            sops::refresh_sops_index,
            sops::fetch_sop,
            sops::clear_sop_cache,
            web_designer::run_web_designer,
            web_designer::edit_web_designer,
            web_designer::list_web_designer_files,
            web_designer::read_web_designer_file,
            web_designer::web_designer_dir,
            copywriter::run_copywriter,
            copywriter::list_dm_files,
            copywriter::read_dm_file,
            copywriter::read_copywriter_skill,
            google_calendar::google_calendar_connect,
            google_calendar::google_calendar_disconnect,
            google_calendar::google_calendar_is_connected,
            google_calendar::google_calendar_create_event,
            google_calendar::google_calendar_update_event,
            google_calendar::google_calendar_delete_event,
            ghl::ghl_is_configured,
            ghl::ghl_get_location_id,
            ghl::ghl_get_config_status,
            ghl::ghl_set_credentials,
            ghl::ghl_set_pipeline_choice,
            ghl::ghl_set_booking_calendar,
            ghl::ghl_clear_credentials,
            ghl::ghl_list_pipelines,
            ghl::ghl_list_opportunities,
            ghl::ghl_list_calendars,
            ghl::ghl_list_appointments,
            ghl::ghl_get_contact,
            ghl::ghl_advance_opportunity,
            meta_ads::meta_list_ads_insights,
            meta_ads::meta_clear_ads_cache,
            meta_ads::meta_backfill_kpis,
            meta_ads::meta_backfill_if_needed,
            meta_actions::meta_pause_campaign,
            meta_actions::meta_resume_campaign,
            meta_actions::meta_pause_ad,
            meta_actions::meta_resume_ad,
            meta_actions::meta_pause_ad_set,
            meta_actions::meta_resume_ad_set,
            meta_actions::meta_update_campaign_budget,
            meta_actions::meta_update_ad_set_budget,
            meta_actions::meta_duplicate_campaign,
            meta_actions::meta_duplicate_ad_set,
            meta_actions::meta_duplicate_ad,
            mobile_app_provision::provision_mobile_tenant,
            watcher::watch_root,
            playbooks::list_playbooks,
            playbooks::read_playbook,
            playbooks::read_playbook_field,
            playbooks::save_playbook,
            playbooks::delete_playbook,
            playbooks::validate_playbooks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
