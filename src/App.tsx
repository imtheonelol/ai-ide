import { useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { useIdeLogic } from "../application/useIdeLogic";
import { SUPPORTED_MODELS } from "../domain/types";
import "./App.css";

function App() {
  const ide = useIdeLogic();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => ide.chatEndRef?.current?.scrollIntoView({ behavior: "smooth" }), [ide.chatHistory]);
  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), [ide.chatHistory]);

  // Dynamically choose syntax highlighting based on file extension
  const getExtensions = () => {
    if (ide.activeFile?.name.endsWith(".html")) return [html()];
    if (ide.activeFile?.name.endsWith(".css")) return [css()];
    return [javascript({ jsx: true, typescript: true })]; // Default to JS/TS/React
  };

  return (
    <div className="ide-container">
      {/* SIDEBAR */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <span>EXPLORER</span>
          <div className="sidebar-actions">
            <button onClick={ide.handleNewFile} title="New File">📄+</button>
            <button onClick={() => ide.setCurrentDir(".")} title="Root">🏠</button>
          </div>
        </div>
        <div className="current-path">{ide.currentDir}</div>
        <div className="file-list">
          {ide.files.map((f, i) => (
            <div key={i} className={`file-item ${ide.activeFile?.path === f.path ? "active" : ""}`} onClick={() => ide.handleFileClick(f)}>
              <span style={{ fontSize: '16px' }}>{f.is_dir ? "📁" : "📄"}</span> {f.name}
            </div>
          ))}
        </div>
      </nav>

      {/* EDITOR */}
      <main className="editor-area">
        <header className="editor-header">
          <div className="editor-tab">{ide.activeFile ? ide.activeFile.name : "Welcome"}</div>
          <button className="save-btn" onClick={ide.handleSaveFile} disabled={!ide.activeFile}>💾 Save</button>
        </header>
        <CodeMirror
          value={ide.code}
          theme="dark"
          extensions={getExtensions()}
          onChange={(val) => ide.setCode(val)}
        />
      </main>

      {/* AI PANEL */}
      <aside className="ai-panel">
        <div className="panel-header">
          <span>AI Assistant</span>
          <select 
            className="model-selector" 
            value={ide.selectedModel} 
            onChange={(e) => ide.setSelectedModel(e.target.value)}
          >
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
            placeholder="Ask AI to write React, HTML, or CSS..." 
            value={ide.chatInput}
            onChange={(e) => ide.setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ide.handleAskAi(); } }}
          />
          <button onClick={ide.handleAskAi} disabled={ide.isAiThinking || !ide.chatInput.trim()}>Submit</button>
        </div>
      </aside>
    </div>
  );
}

export default App;