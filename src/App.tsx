import { useRef, useEffect, useState, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { useIdeLogic } from "./application/useIdeLogic";
import { pullNewModel } from "./infrastructure/aiService";
import { FileEntry } from "./domain/types";
import { readProjectFiles } from "./infrastructure/fileSystem";
import "./App.css";

const FileTreeNode = ({ file, ide, paddingLeft }: { file: FileEntry, ide: any, paddingLeft: number }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);

  const toggleOpen = async () => {
    if (file.is_dir) {
      if (!isOpen) {
        const subFiles = await readProjectFiles(file.path);
        setChildren(subFiles);
      }
      setIsOpen(!isOpen);
    } else {
      ide.handleFileClick(file);
    }
  };

  return (
    <div>
      <div className={`file-item ${ide.activeFile?.path === file.path ? "active" : ""}`} style={{ paddingLeft: `${paddingLeft}px` }} onClick={toggleOpen}>
        <span className="file-icon">{file.is_dir ? (isOpen ? "v" : ">") : "≡"}</span> {file.name}
      </div>
      {isOpen && children.map((child, i) => <FileTreeNode key={i} file={child} ide={ide} paddingLeft={paddingLeft + 15} />)}
    </div>
  );
};

function App() {
  const ide = useIdeLogic();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [newModelName, setNewModelName] = useState("");

  useEffect(() => { setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50); }, [ide.chatHistory, ide.isAiThinking]);

  const editorExtensions = useMemo(() => {
    if (ide.activeFile?.name.endsWith(".html")) return [html()];
    if (ide.activeFile?.name.endsWith(".css")) return [css()];
    return [javascript({ jsx: true, typescript: true })];
  }, [ide.activeFile?.name]);

  const handlePullModel = async () => {
    if(!newModelName) return;
    alert(`Pulling ${newModelName} in background. This will take a few minutes.`);
    try { await pullNewModel(newModelName); alert(`${newModelName} installed! Restart IDE to see it.`); } 
    catch(e) { alert("Failed to pull model."); }
  };

  return (
    <div className="ide-container">
      {/* Settings Modal */}
      {ide.showSettings && (
        <div className="modal-overlay" onClick={() => ide.setShowSettings(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>IDE Settings</h2>
            <div className="settings-section">
              <label><input type="checkbox" checked={ide.settings.autoSaveAI} onChange={e => ide.setSettings({...ide.settings, autoSaveAI: e.target.checked})} /> Auto-save AI files to /ai_generated</label>
            </div>
            <div className="settings-section">
              <h3>Download New Model</h3>
              <input type="text" placeholder="e.g. llama3, phi3" value={newModelName} onChange={e => setNewModelName(e.target.value)} />
              <button onClick={handlePullModel}>Download</button>
            </div>
            <button className="close-btn" onClick={() => ide.setShowSettings(false)}>Close</button>
          </div>
        </div>
      )}

      {/* ACTIVITY BAR */}
      <div className="activity-bar">
        <div className="activity-icon active" title="Explorer">Files</div>
        <div className="activity-icon" title="Settings" onClick={() => ide.setShowSettings(true)}>Settings</div>
      </div>

      {/* SIDEBAR EXPLORER */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <span>Explorer</span>
          <div className="sidebar-actions">
            <button onClick={() => ide.handleNewFile(ide.currentDir)}>+</button>
          </div>
        </div>
        <div className="file-list">
          {ide.files.map((f, i) => <FileTreeNode key={i} file={f} ide={ide} paddingLeft={15} />)}
        </div>
      </nav>

      {/* MAIN EDITOR & TERMINAL */}
      <main className="main-content">
        <header className="editor-header">
          <div className="tabs">
            <div className={`tab ${ide.activeTab === "editor" ? "active" : ""}`} onClick={() => ide.setActiveTab("editor")}>Code</div>
            <div className={`tab ${ide.activeTab === "preview" ? "active" : ""}`} onClick={() => ide.setActiveTab("preview")}>Live Preview</div>
          </div>
          <div className="editor-actions">
            <button className="text-btn" onClick={ide.runCode}>Run Node</button>
            <button className="text-btn primary" onClick={ide.handleSaveFile}>Save</button>
          </div>
        </header>

        <div className="editor-workspace">
          {ide.activeTab === "editor" ? (
            <CodeMirror value={ide.code} theme="dark" extensions={editorExtensions} onChange={(val) => ide.setCode(val)} onKeyDown={(e) => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); ide.handleSaveFile(); }}} />
          ) : (
            <iframe className="preview-frame" srcDoc={ide.code} title="Live Preview" sandbox="allow-scripts allow-same-origin" />
          )}
        </div>

        {/* TERMINAL PANEL */}
        <div className="terminal-panel">
          <div className="terminal-header">Terminal Output</div>
          <pre className="terminal-output">{ide.terminalOutput}</pre>
        </div>
      </main>

      {/* AI PANEL */}
      <aside className="ai-panel">
        <div className="panel-header">
          <span>AI Config</span>
          <select className="model-selector" value={ide.selectedModel} onChange={(e) => ide.setSelectedModel(e.target.value)}>
            {ide.availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="chat-history">
          {ide.chatHistory.map((msg, idx) => <div key={idx} className={`chat-message ${msg.role}`}>{msg.content}</div>)}
          {ide.isAiThinking && <div className="chat-message system">Generating...</div>}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-input-area">
          <textarea placeholder="Ask AI..." value={ide.chatInput} onChange={(e) => ide.setChatInput(e.target.value)} onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); ide.handleAskAi(); } }} />
          <button onClick={ide.handleAskAi} disabled={ide.isAiThinking || !ide.chatInput.trim()}>Submit</button>
        </div>
      </aside>
    </div>
  );
}
export default App;