import { useRef, useEffect, useState, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";

import { useIdeLogic } from "./application/useIdeLogic";
import { SUPPORTED_MODELS, FileEntry } from "./domain/types";
import { readProjectFiles } from "./infrastructure/fileSystem";
import "./App.css";

// Recursive Tree Component for Nested Folders
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
      <div 
        className={`file-item ${ide.activeFile?.path === file.path ? "active" : ""}`} 
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={toggleOpen}
      >
        <span className="file-icon">{file.is_dir ? (isOpen ? "📂" : "📁") : "📄"}</span> 
        {file.name}
      </div>
      {isOpen && children.map((child, i) => (
        <FileTreeNode key={i} file={child} ide={ide} paddingLeft={paddingLeft + 15} />
      ))}
    </div>
  );
};

function App() {
  const ide = useIdeLogic();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // BUG FIX: Auto-scroll now watches the thinking state and forces DOM to update first
  useEffect(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
  }, [ide.chatHistory, ide.isAiThinking]);

  // CRITICAL FIX: useMemo prevents CodeMirror from resetting on save!
  const editorExtensions = useMemo(() => {
    if (ide.activeFile?.name.endsWith(".html")) return [html()];
    if (ide.activeFile?.name.endsWith(".css")) return [css()];
    return [javascript({ jsx: true, typescript: true })];
  }, [ide.activeFile?.name]);

  return (
    <div className="ide-container">
      {/* ACTIVITY BAR */}
      <div className="activity-bar">
        <div className="activity-icon active" title="Explorer">📄</div>
        <div className="activity-icon" title="Search">🔍</div>
        <div className="activity-icon" title="Settings">⚙️</div>
      </div>

      {/* SIDEBAR EXPLORER */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <span>EXPLORER</span>
          <div className="sidebar-actions">
            <button onClick={() => ide.handleNewFile(ide.currentDir)} title="New File">📄</button>
            <button onClick={() => ide.handleNewFolder(ide.currentDir)} title="New Folder">📁</button>
            <button onClick={() => ide.setCurrentDir(".")} title="Root">🏠</button>
          </div>
        </div>
        <div className="current-path">ROOT ▾</div>
        <div className="file-list">
          {ide.files.map((f, i) => (
            <FileTreeNode key={i} file={f} ide={ide} paddingLeft={15} />
          ))}
        </div>
      </nav>

      {/* EDITOR AREA */}
      <main className="editor-area">
        <header className="editor-header">
          <div className="editor-tab">{ide.activeFile ? ide.activeFile.name : "Welcome"}</div>
          <div className="editor-actions">
            <button className="save-btn" onClick={ide.handleSaveFile} disabled={!ide.activeFile}>
              💾 Save
            </button>
          </div>
        </header>
        
        <CodeMirror
          value={ide.code}
          theme="dark"
          extensions={editorExtensions}
          onChange={(val) => ide.setCode(val)}
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key === 's') {
              e.preventDefault();
              ide.handleSaveFile();
            }
          }}
        />
      </main>

      {/* AI PANEL */}
      <aside className="ai-panel">
        <div className="panel-header">
          <span>⚡ Bolt AI</span>
          <select className="model-selector" value={ide.selectedModel} onChange={(e) => ide.setSelectedModel(e.target.value)}>
            {SUPPORTED_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="chat-history">
          {ide.chatHistory.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role}`}>{msg.content}</div>
          ))}
          {ide.isAiThinking && <div className="chat-message ai">Generating... ⏳</div>}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-input-area">
          <textarea 
            placeholder="Ask AI to write code... (Ctrl+Enter to send)" 
            value={ide.chatInput}
            onChange={(e) => ide.setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); ide.handleAskAi(); } }}
          />
          <button onClick={ide.handleAskAi} disabled={ide.isAiThinking || !ide.chatInput.trim()}>Submit</button>
        </div>
      </aside>

      {/* STATUS BAR */}
      <footer className="status-bar">
        <div className="status-item">Godly IDE v1.0</div>
        <div className="status-item">Ollama: Auto-Managed</div>
        <div className="status-item">{ide.activeFile ? `Editing: ${ide.activeFile.name}` : "Idle"}</div>
      </footer>
    </div>
  );
}

export default App;