import { useRef, useEffect, useState, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { search } from "@codemirror/search"; 
import { useIdeLogic } from "./application/useIdeLogic";
import { pullNewModel } from "./infrastructure/aiService";
import { FileEntry } from "./domain/types";
import { readProjectFiles, createProjectFolder } from "./infrastructure/fileSystem";
import "./App.css";

const FileTreeNode = ({ file, ide, paddingLeft }: { file: FileEntry, ide: any, paddingLeft: number }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const toggleOpen = async () => {
    if (file.is_dir) {
      if (!isOpen) { const subFiles = await readProjectFiles(file.path); setChildren(subFiles); }
      setIsOpen(!isOpen);
    } else ide.handleFileClick(file);
  };
  return (
    <div>
      <div className={`file-item ${ide.activeFile?.path === file.path ? "active" : ""}`} style={{ paddingLeft: `${paddingLeft}px` }}>
        <span className="file-icon" onClick={toggleOpen}>{file.is_dir ? (isOpen ? "v" : ">") : "≡"}</span> 
        <span className="file-name" onClick={toggleOpen}>{file.name}</span>
        <span className="file-delete" onClick={() => ide.handleDelete(file)}>✕</span>
      </div>
      {isOpen && children.map((child, i) => <FileTreeNode key={i} file={child} ide={ide} paddingLeft={paddingLeft + 15} />)}
    </div>
  );
};

function App() {
  const ide = useIdeLogic();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => { const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50); }, [ide.chatHistory, ide.isAiThinking]);

  // FIXED: Safely check if a file is active before reading its extension
  const editorExtensions = useMemo(() => {
    const exts = [search({ top: true })]; 
    const fileName = ide.activeFile?.name || "";
    
    if (fileName.endsWith(".html")) exts.push(html());
    else if (fileName.endsWith(".css")) exts.push(css());
    else exts.push(javascript({ jsx: true, typescript: true }));
    
    return exts;
  }, [ide.activeFile?.name]);

  const installModel = async (m: string) => {
    ide.setTerminalOutput(prev => prev + `\n> Downloading ${m} in background...\n`);
    try { await pullNewModel(m); ide.setTerminalOutput(prev => prev + `✅ ${m} installed! Restart IDE.\n`); } 
    catch(e) { ide.setTerminalOutput(prev => prev + `❌ Failed to install ${m}.\n`); }
  };

  return (
    <div className={`ide-wrapper theme-${ide.settings.theme}`}>
      <div className="toast-container">
        {ide.toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
      </div>

      <div className="top-menu-bar">
        <div className="menu-group">
          <img src="/tauri.svg" alt="logo" className="menu-logo" />
          <div className="menu-item has-dropdown">File
            <div className="dropdown"><div onClick={() => ide.handleNewFile(ide.currentDir)}>New File</div><div onClick={ide.handleOpenFolder}>Open Folder...</div><div onClick={ide.handleSaveFile}>Save (Ctrl+S)</div></div>
          </div>
          <div className="menu-item has-dropdown">Git
            <div className="dropdown">
              <div onClick={() => ide.handleGitCommand("status")}>Status</div>
              <div onClick={() => ide.handleGitCommand("add")}>Add All</div>
              <div onClick={() => ide.handleGitCommand("commit")}>Commit...</div>
              <div onClick={() => ide.handleGitCommand("pull")}>Pull</div>
              <div onClick={() => ide.handleGitCommand("push")}>Push</div>
            </div>
          </div>
          <div className="menu-item has-dropdown">Run
            <div className="dropdown">
              <div onClick={ide.runCode}>Execute Active File {ide.settings.useWsl ? "(WSL)" : ""}</div>
            </div>
          </div>
          <div className="menu-item has-dropdown">Terminal
            <div className="dropdown">
              <div onClick={() => ide.setTerminalOutput("Console cleared.\n")}>Clear Terminal</div>
            </div>
          </div>
        </div>
        <div className="menu-title">{ide.currentDir.split('\\').pop() || ide.currentDir} - Godly IDE</div><div className="menu-spacer"></div>
      </div>

      <div className="ide-container">
        {ide.showSettings && (
          <div className="modal-overlay" onClick={() => ide.setShowSettings(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2>IDE Settings</h2>
              <div className="settings-section">
                <label>Theme: <select value={ide.settings.theme} onChange={e => ide.setSettings({...ide.settings, theme: e.target.value as any})}><option value="dark">VS Dark</option><option value="light">VS Light</option></select></label><br/><br/>
                <label><input type="checkbox" checked={ide.settings.useWsl} onChange={e => ide.setSettings({...ide.settings, useWsl: e.target.checked})} /> Run code natively in WSL (Linux)</label>
              </div>
              <div className="settings-section">
                <h3>Cloud AI API Keys</h3>
                <input type="password" placeholder="OpenAI Key (sk-...)" value={ide.settings.openAiKey} onChange={e => ide.setSettings({...ide.settings, openAiKey: e.target.value})} />
                <input type="password" placeholder="Gemini Key (AIza...)" value={ide.settings.geminiKey} onChange={e => ide.setSettings({...ide.settings, geminiKey: e.target.value})} />
              </div>
              <div className="settings-section">
                <h3>1-Click Local Models</h3>
                <div style={{display: 'flex', gap: '5px', flexWrap: 'wrap'}}>
                  <button className="text-btn" onClick={() => installModel('llama3')}>Llama 3</button>
                  <button className="text-btn" onClick={() => installModel('mistral')}>Mistral</button>
                  <button className="text-btn" onClick={() => installModel('phi3')}>Phi-3</button>
                  <button className="text-btn" onClick={() => installModel('qwen2.5:7b')}>Qwen 7B</button>
                </div>
              </div>
              <button className="close-btn" onClick={() => ide.setShowSettings(false)}>Close</button>
            </div>
          </div>
        )}

        <div className="activity-bar">
          <div className="activity-icon active">Files</div>
          <div className="activity-icon" onClick={() => ide.setShowSettings(true)}>Settings</div>
        </div>

        <nav className="sidebar">
          <div className="sidebar-header"><span>Explorer</span>
            <div className="sidebar-actions">
              <button onClick={() => ide.handleNewFile(ide.currentDir)}>+</button>
              <button onClick={() => createProjectFolder(`${ide.currentDir}/NewFolder`).then(() => readProjectFiles(ide.currentDir).then(ide.setCurrentDir))}>📁</button>
            </div>
          </div>
          <div className="file-list">{ide.files.map((f, i) => <FileTreeNode key={i} file={f} ide={ide} paddingLeft={15} />)}</div>
        </nav>

        <main className="main-content">
          <header className="editor-header">
            <div className="tabs"><div className={`tab ${ide.activeTab === "editor" ? "active" : ""}`} onClick={() => ide.setActiveTab("editor")}>{ide.activeFile?.name || "Code"}</div><div className={`tab ${ide.activeTab === "preview" ? "active" : ""}`} onClick={() => ide.setActiveTab("preview")}>Iframe Preview</div></div>
            <div className="editor-actions"><button className="text-btn outline" onClick={ide.runCode}>▶ Run Code</button></div>
          </header>

          <div className="editor-workspace">
            {ide.activeTab === "editor" ? ( <CodeMirror value={ide.code} theme={ide.settings.theme === "light" ? "light" : "dark"} extensions={editorExtensions} onChange={(val) => ide.setCode(val)} onKeyDown={(e) => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); ide.handleSaveFile(); }}} /> ) : ( <iframe className="preview-frame" srcDoc={ide.code} sandbox="allow-scripts allow-same-origin" /> )}
          </div>
          <div className="terminal-panel"><div className="terminal-header">Terminal Output</div><pre className="terminal-output">{ide.terminalOutput}</pre></div>
        </main>

        <aside className="ai-panel">
          <div className="panel-header"><span>AI Chat</span>
            <select className="model-selector" value={ide.selectedModel?.id || ""} onChange={(e) => ide.setSelectedModel(ide.availableModels.find(m => m.id === e.target.value)!)}>
              {ide.availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="chat-history">
            {ide.chatHistory.map((msg, idx) => <div key={idx} className={`chat-message ${msg.role}`}>{msg.content}</div>)}
            {ide.isAiThinking && <div className="chat-message system">Generating...</div>}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-area">
            <textarea placeholder="Ask AI to read your workspace..." value={ide.chatInput} onChange={(e) => ide.setChatInput(e.target.value)} onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); ide.handleAskAi(); } }} />
            <button onClick={ide.handleAskAi} disabled={ide.isAiThinking || !ide.chatInput.trim()}>Submit</button>
          </div>
        </aside>
      </div>
      <footer className="status-bar">
        <div className="status-group"><div className="status-item go-live-btn" onClick={ide.startLiveServer}>📡 Go Live (Port 3000)</div></div>
        <div className="status-group"><div className="status-item">{ide.settings.useWsl ? "WSL Active" : "Windows"}</div><div className="status-item">{time}</div></div>
      </footer>
    </div>
  );
}
export default App;