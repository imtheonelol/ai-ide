use std::fs;
use std::path::Path;

#[tauri::command]
fn list_files(path: String) -> Vec<serde_json::Value> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let meta = entry.metadata().unwrap();
            files.push(serde_json::json!({
                "name": entry.file_name().to_string_lossy(),
                "path": entry.path().to_string_lossy(),
                "is_dir": meta.is_dir()
            }));
        }
    }
    files
}

#[tauri::command]
fn read_file(path: String) -> String {
    fs::read_to_string(path).unwrap_or_else(|_| "Error reading file".to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_files, read_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}