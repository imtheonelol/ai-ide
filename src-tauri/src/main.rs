#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::time::Duration;
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
fn list_files(path: String) -> Result<Vec<serde_json::Value>, String> {
    let mut files = Vec::new();
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let meta = entry.metadata().unwrap();
        files.push(serde_json::json!({
            "name": entry.file_name().to_string_lossy(), "path": entry.path().to_string_lossy(), "is_dir": meta.is_dir()
        }));
    }
    files.sort_by(|a, b| {
        let a_is_dir = a["is_dir"].as_bool().unwrap_or(false); let b_is_dir = b["is_dir"].as_bool().unwrap_or(false);
        if a_is_dir && !b_is_dir { std::cmp::Ordering::Less } else if !a_is_dir && b_is_dir { std::cmp::Ordering::Greater } else { a["name"].as_str().cmp(&b["name"].as_str()) }
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
    let mut command = Command::new(cmd); command.args(args).current_dir(dir);
    #[cfg(target_os = "windows")] command.creation_flags(0x08000000); 
    let output = command.output().map_err(|e| format!("Command failed: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string(); let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !stderr.is_empty() { Ok(format!("{}\nError:\n{}", stdout, stderr)) } else { Ok(stdout) }
}

// --- FIXED: Windows Native Live Server Execution ---
#[tauri::command]
fn spawn_server(dir: String, port: u16) -> Result<String, String> {
    let mut command = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(["/C", &format!("npx --yes serve -p {}", port)]);
        c
    } else {
        let mut c = Command::new("npx");
        c.args(["--yes", "serve", "-p", &port.to_string()]);
        c
    };
    
    command.current_dir(dir);
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
async fn generate_ai_proxy(provider: String, model: String, prompt: String, system: String, api_key: String) -> Result<String, String> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(300)).build().unwrap();

    if provider == "openai" {
        let res = client.post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&serde_json::json!({ "model": model, "messages": [ {"role": "system", "content": system}, {"role": "user", "content": prompt} ] }))
            .send().await.map_err(|e| e.to_string())?;
        let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        if let Some(content) = json["choices"][0]["message"]["content"].as_str() { return Ok(content.to_string()); }
        return Err(format!("OpenAI Error: {}", json));
    } else if provider == "gemini" {
        let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", model, api_key);
        let res = client.post(&url)
            .json(&serde_json::json!({ "system_instruction": { "parts": { "text": system } }, "contents": [{ "parts": [{"text": prompt}] }] }))
            .send().await.map_err(|e| e.to_string())?;
        let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        if let Some(content) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() { return Ok(content.to_string()); }
        return Err(format!("Gemini Error: {}", json));
    } else {
        let res = client.post("http://localhost:11434/api/generate")
            .json(&serde_json::json!({ "model": model, "prompt": prompt, "system": system, "stream": false }))
            .send().await.map_err(|e| format!("Network Error: ({})", e))?;
        if !res.status().is_success() { return Err(format!("Ollama Error: {}", res.text().await.unwrap_or_default())); }
        let text = res.text().await.unwrap();
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(resp) = json.get("response").and_then(|v| v.as_str()) { return Ok(resp.to_string()); }
        }
        Ok(text)
    }
}

fn main() {
    let mut cmd = Command::new("ollama");
    cmd.arg("serve").stdout(Stdio::null()).stderr(Stdio::null());
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