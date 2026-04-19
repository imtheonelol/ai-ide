#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::time::Duration;

#[tauri::command]
fn list_files(path: String) -> Result<Vec<serde_json::Value>, String> {
    let mut files = Vec::new();
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    
    for entry in entries.flatten() {
        let meta = entry.metadata().unwrap();
        files.push(serde_json::json!({
            "name": entry.file_name().to_string_lossy(),
            "path": entry.path().to_string_lossy(),
            "is_dir": meta.is_dir()
        }));
    }
    
    // Sort Folders first, then files
    files.sort_by(|a, b| {
        let a_is_dir = a["is_dir"].as_bool().unwrap_or(false);
        let b_is_dir = b["is_dir"].as_bool().unwrap_or(false);
        if a_is_dir && !b_is_dir { std::cmp::Ordering::Less }
        else if !a_is_dir && b_is_dir { std::cmp::Ordering::Greater }
        else { a["name"].as_str().cmp(&b["name"].as_str()) }
    });
    
    Ok(files)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| e.to_string())
}

// Fixed the AI Proxy to use localhost and increased the timeout threshold
#[tauri::command]
async fn generate_ai_proxy(model: String, prompt: String, system: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300)) // Give the AI up to 5 minutes to generate long code
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    let res = client.post("http://localhost:11434/api/generate")
        .json(&serde_json::json!({
            "model": model,
            "prompt": prompt,
            "system": system,
            "stream": false
        }))
        .send()
        .await
        .map_err(|e| format!("Network Connection Error: Ensure Ollama is running. ({})", e))?;

    if !res.status().is_success() {
        return Err(format!("Ollama returned an error code: {}", res.status()));
    }

    let text = res.text().await.map_err(|e| e.to_string())?;
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(resp) = json.get("response").and_then(|v| v.as_str()) {
            return Ok(resp.to_string());
        }
    }
    Ok(text)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_files, read_file, write_file, generate_ai_proxy
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}