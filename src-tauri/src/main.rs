#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::time::Duration;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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
fn read_file(path: String) -> Result<String, String> { fs::read_to_string(path).map_err(|e| e.to_string()) }

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> { fs::write(path, contents).map_err(|e| e.to_string()) }

#[tauri::command]
fn create_folder(path: String) -> Result<(), String> { fs::create_dir_all(path).map_err(|e| e.to_string()) }

#[tauri::command]
fn delete_path(path: String, is_dir: bool) -> Result<(), String> {
    if is_dir { fs::remove_dir_all(path).map_err(|e| e.to_string()) } else { fs::remove_file(path).map_err(|e| e.to_string()) }
}

#[tauri::command]
fn run_command(cmd: String, args: Vec<String>, dir: String) -> Result<String, String> {
    let mut command = Command::new(cmd);
    command.args(args).current_dir(dir);
    #[cfg(target_os = "windows")] command.creation_flags(0x08000000); 
    let output = command.output().map_err(|e| format!("Command failed: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !stderr.is_empty() { Ok(format!("{}\nError:\n{}", stdout, stderr)) } else { Ok(stdout) }
}

// --- NEW: SPAWN DETACHED SERVER ---
#[tauri::command]
fn spawn_server(dir: String, port: u16) -> Result<String, String> {
    // Uses Node's npx to serve the directory securely in the background
    let cmd = if cfg!(target_os = "windows") { "npx.cmd" } else { "npx" };
    let mut command = Command::new(cmd);
    command.args(["serve", "-p", &port.to_string()]).current_dir(dir);
    #[cfg(target_os = "windows")] command.creation_flags(0x08000000);
    command.spawn().map_err(|e| format!("Failed to start server: {}", e))?;
    Ok(format!("Server started on port {}", port))
}

#[tauri::command]
async fn get_local_models() -> Result<String, String> {
    let client = reqwest::Client::new();
    let res = client.get("http://localhost:11434/api/tags").send().await.map_err(|e| e.to_string())?;
    res.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn pull_model(model: String) -> Result<String, String> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(3600)).build().unwrap();
    let _res = client.post("http://localhost:11434/api/pull").json(&serde_json::json!({"name": model, "stream": false})).send().await.map_err(|e| e.to_string())?;
    Ok(format!("Successfully pulled {}", model))
}

#[tauri::command]
async fn generate_ai_proxy(model: String, prompt: String, system: String) -> Result<String, String> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(300)).build().unwrap();
    let res = client.post("http://localhost:11434/api/generate").json(&serde_json::json!({ "model": model, "prompt": prompt, "system": system, "stream": false })).send().await.map_err(|e| format!("Network Error: ({})", e))?;
    let status = res.status(); 
    if !status.is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("Ollama Error ({}): {}", status, error_text));
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(resp) = json.get("response").and_then(|v| v.as_str()) { return Ok(resp.to_string()); }
    }
    Ok(text)
}

fn main() {
    let mut cmd = Command::new("ollama");
    cmd.arg("serve");
    #[cfg(target_os = "windows")] cmd.creation_flags(0x08000000); 
    let _ = cmd.spawn(); 

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_files, read_file, write_file, create_folder, delete_path,
            run_command, spawn_server, get_local_models, pull_model, generate_ai_proxy
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}