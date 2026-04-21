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
    let result = if is_dir { fs::remove_dir_all(&path) } else { fs::remove_file(&path) };
    match result {
        Ok(_) => Ok(()),
        Err(e) => {
            #[cfg(target_os = "windows")]
            {
                let cmd = if is_dir { format!("rmdir /S /Q \"{}\"", path) } else { format!("del /F /Q \"{}\"", path) };
                let fallback = Command::new("cmd").args(["/C", &cmd]).creation_flags(0x08000000).output();
                if let Ok(out) = fallback { if out.status.success() { return Ok(()); } }
            }
            #[cfg(not(target_os = "windows"))]
            {
                let cmd = format!("rm -rf \"{}\"", path);
                let fallback = Command::new("sh").args(["-c", &cmd]).output();
                if let Ok(out) = fallback { if out.status.success() { return Ok(()); } }
            }
            Err(format!("File locked by OS. Please click 'Stop Server & Unlock' to free it. ({})", e))
        }
    }
}

#[tauri::command]
fn stop_processes() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill").args(["/IM", "node.exe", "/F"]).creation_flags(0x08000000).output();
        let _ = Command::new("taskkill").args(["/IM", "python.exe", "/F"]).creation_flags(0x08000000).output();
        Ok("Forcefully stopped all background servers and unlocked files.".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("killall").arg("node").output();
        let _ = Command::new("killall").arg("python").output();
        Ok("Forcefully stopped all background servers and unlocked files.".to_string())
    }
}

#[tauri::command]
fn run_command(cmd: String, args: Vec<String>, dir: String) -> Result<String, String> {
    let (shell, shell_arg) = if cfg!(target_os = "windows") { ("cmd", "/C") } else { ("sh", "-c") };
    let full_cmd = format!("{} {}", cmd, args.join(" "));
    let mut command = Command::new(shell);
    command.args([shell_arg, &full_cmd]).current_dir(dir);
    #[cfg(target_os = "windows")] command.creation_flags(0x08000000); 
    
    let output = command.output().map_err(|e| format!("Execution failed: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !stderr.is_empty() && stdout.is_empty() { Ok(format!("Error:\n{}", stderr)) } else { Ok(format!("{}{}", stdout, stderr)) }
}

#[tauri::command]
fn schedule_task(name: String, script: String, dir: String, schedule_type: String, schedule_value: String) -> Result<String, String> {
    let script_ext = if cfg!(target_os = "windows") { "bat" } else { "sh" };
    let script_path = format!("{}/.godly_task_{}.{}", dir, name, script_ext);
    fs::write(&script_path, &script).map_err(|e| format!("Failed to save script: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        let task_cmd = format!("cmd.exe /c \"{}\"", script_path);
        let mut command = Command::new("schtasks");
        command.args(["/create", "/tn", &format!("GodlyIDE_{}", name), "/tr", &task_cmd, "/f"]);
        if schedule_type == "interval" { command.args(["/sc", "MINUTE", "/mo", &schedule_value]); } else { command.args(["/sc", "DAILY", "/st", &schedule_value]); }
        command.creation_flags(0x08000000);
        let output = command.output().map_err(|e| e.to_string())?;
        if output.status.success() { Ok(format!("Multi-line Task '{}' scheduled successfully!", name)) } else { Err(String::from_utf8_lossy(&output.stderr).to_string()) }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let cron_time = if schedule_type == "interval" { format!("*/{} * * * *", schedule_value) } else { format!("{} {} * * *", schedule_value.split(':').nth(1).unwrap(), schedule_value.split(':').nth(0).unwrap()) };
        let cron_cmd = format!("(crontab -l 2>/dev/null; echo \"{} cd {} && sh {}\") | crontab -", cron_time, dir, script_path);
        Command::new("sh").args(["-c", &cron_cmd]).output().map_err(|e| e.to_string())?;
        Ok(format!("Multi-line Task '{}' scheduled via crontab", name))
    }
}

#[tauri::command]
fn spawn_server(dir: String, port: u16) -> Result<String, String> {
    let shell = if cfg!(target_os = "windows") { "cmd" } else { "sh" };
    let shell_arg = if cfg!(target_os = "windows") { "/C" } else { "-c" };
    let node_cmd = format!("npx serve -p {}", port);
    let mut command = Command::new(shell);
    command.args([shell_arg, &node_cmd]).current_dir(&dir);
    #[cfg(target_os = "windows")] command.creation_flags(0x08000000);
    if command.spawn().is_ok() { return Ok(format!("Live Server started on port {} (Node.js)", port)); }

    let py_cmd = format!("python -m http.server {}", port);
    let mut py_command = Command::new(shell);
    py_command.args([shell_arg, &py_cmd]).current_dir(&dir);
    #[cfg(target_os = "windows")] py_command.creation_flags(0x08000000);
    py_command.spawn().map_err(|e| format!("Failed to start server. Error: {}", e))?;
    Ok(format!("Live Server started on port {} (Python)", port))
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

// --- UPGRADED: Memory & Context Integration ---
#[tauri::command]
async fn generate_ai_proxy(provider: String, model: String, messages: Vec<serde_json::Value>, api_key: String) -> Result<String, String> {
    // 5 Minute timeout to allow complex, high-accuracy generation
    let client = reqwest::Client::builder().timeout(Duration::from_secs(300)).build().unwrap();

    if provider == "openai" {
        let res = client.post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&serde_json::json!({ "model": model, "messages": messages, "temperature": 0.1 }))
            .send().await.map_err(|e| e.to_string())?;
        let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        if let Some(content) = json["choices"][0]["message"]["content"].as_str() { return Ok(content.to_string()); }
        return Err(format!("OpenAI Error: {}", json));
    } else if provider == "gemini" {
        let mut system_text = String::new();
        let mut gemini_contents = Vec::new();
        for msg in &messages {
            let role = msg["role"].as_str().unwrap_or("user");
            let content = msg["content"].as_str().unwrap_or("");
            if role == "system" { system_text = content.to_string(); } 
            else {
                let gemini_role = if role == "assistant" { "model" } else { "user" };
                gemini_contents.push(serde_json::json!({ "role": gemini_role, "parts": [{"text": content}] }));
            }
        }
        let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", model, api_key);
        let res = client.post(&url).json(&serde_json::json!({ "system_instruction": { "parts": { "text": system_text } }, "contents": gemini_contents, "generationConfig": { "temperature": 0.1 } }))
            .send().await.map_err(|e| e.to_string())?;
        let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        if let Some(content) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() { return Ok(content.to_string()); }
        return Err(format!("Gemini Error: {}", json));
    } else {
        // Ollama Local Chat API (Massive Memory context)
        let res = client.post("http://localhost:11434/api/chat")
            .json(&serde_json::json!({ 
                "model": model, 
                "messages": messages, 
                "stream": false,
                "options": {
                    "temperature": 0.1,  // High Accuracy
                    "num_ctx": 16384     // Massive memory context window
                }
            })).send().await.map_err(|e| format!("Network Error: ({})", e))?;
        
        if !res.status().is_success() { return Err(format!("Ollama Error: {}", res.text().await.unwrap_or_default())); }
        let text = res.text().await.unwrap();
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) { 
            if let Some(resp) = json["message"]["content"].as_str() { return Ok(resp.to_string()); } 
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
            list_files, read_file, write_file, create_folder, delete_path, stop_processes,
            run_command, schedule_task, spawn_server, get_local_models, pull_model, generate_ai_proxy
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}