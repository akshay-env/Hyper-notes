// Tauri entry point + command registration. Commands operate on vault-relative
// paths ("/Projects/Note.md") joined onto an absolute vault root, so the frontend
// keeps using the same identities it used with mock data.
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::llm::AskState::default())
        .manage(commands::search::SearchCache::default())
        .invoke_handler(tauri::generate_handler![
            commands::vault::read_vault,
            commands::vault::read_file,
            commands::vault::write_note,
            commands::vault::create_folder,
            commands::vault::create_note,
            commands::vault::rename_path,
            commands::bin::move_to_bin,
            commands::bin::list_bin,
            commands::bin::restore_bin,
            commands::bin::delete_bin,
            commands::bin::empty_bin,
            commands::llm::ask_stream,
            commands::llm::cancel_ask,
            commands::llm::list_models,
            commands::search::web_search_capability,
            commands::keys::set_api_key,
            commands::keys::has_api_key,
            commands::keys::clear_api_key,
            commands::keys::migrate_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
