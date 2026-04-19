import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { search, openSearchPanel } from "@codemirror/search"; 
import { ReactFlow, Controls, Background, useNodesState, useEdgesState, addEdge, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';

import { useIdeLogic } from "./application/useIdeLogic";
import { pullNewModel } from "./infrastructure/aiService";
import { FileEntry } from "./domain/types";
import { readProjectFiles, createProjectFolder } from "./infrastructure/fileSystem";
import "./App.css";

const FileTreeNode = ({ file, ide, paddingLeft, onContextMenu }: { file: FileEntry, ide: any, paddingLeft: number, onContextMenu: (e: React.MouseEvent, f: FileEntry) => void }) => {
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
      <div 
        className={`file-item ${ide.activeFile?.path === file.path ? "active" : ""}`} 
        style={{ paddingLeft: `${paddingLeft}px` }}
        onContextMenu={(e) => onContextMenu(e, file)}
      >
        <span className="file-icon" onClick={toggleOpen}>{file.is_dir ? (isOpen ? "v" : ">") : "≡"}</span> 
        <span className="file-name" onClick={toggleOpen}>{file.name}</span>
        <span className="file-delete" onClick={(e) => { e.stopPropagation(); ide.handleDelete(file); }}>✕</span>
      </div>
      {isOpen && children.map((child, i) => <FileTreeNode key={i} file={child} ide={ide} paddingLeft={paddingLeft + 15} onContextMenu={onContextMenu} />)}
    </div>
  );
};

const DependencyGraph = ({ files }: { files: FileEntry[] }) => {
  const graphRef = useRef<HTMLDivElement>(null);
  const initialNodes = files.filter(f => !f.is_dir).map((f, i) => ({
    id: f.name, position: { x: Math.random() * 400, y: Math.random() * 400 }, data: { label: f.name },
    style: { background: '#1e1e1e', color: '#fff', border: `2px solid ${f.name.endsWith('.html') ? '#e34c26' : f.name.endsWith('.css') ? '#264de4' : '#f0db4f'}`, borderRadius: '5px', padding: '10px' }
  }));
  const initialEdges = [];
  const htmlFiles = files.filter(f => f.name.endsWith('.html'));
  for (const h of htmlFiles) {
    files.forEach(f => {
      if (f.name.endsWith('.css') || f.name.endsWith('.js')) {
        initialEdges.push({ id: `e-${h.name}-${f.name}`, source: h.name, target: f.name, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#007acc', strokeWidth: 2 }});
      }
    });
  }
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges as any);
  const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const downloadImage = useCallback(() => {
    if (graphRef.current === null) return;
    toPng(graphRef.current, { backgroundColor: '#121212' }).then((dataUrl) => { const link = document.createElement('a'); link.download = 'architecture.png'; link.href = dataUrl; link.click(); });
  }, [graphRef]);

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px', background: '#1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Interactive Workspace Flow</span>
        <button className="text-btn primary" onClick={downloadImage}>⬇ Download Image</button>
      </div>
      <div style={{ flexGrow: 1 }} ref={graphRef}>
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} colorMode="dark"><Background color="#333" gap={16} /><Controls /></ReactFlow>
      </div>
    </div>
  );
};

function App() {
  const ide = useIdeLogic();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null); 
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const [fileFilter, setFileFilter] = useState("");
  const [termInput, setTermInput] = useState("");
  
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, file: FileEntry} | null>(null);

  const [taskName, setTaskName] = useState("DailyBackup");
  const [taskScript, setTaskScript] = useState("git add .\ngit commit -m \"Automated backup\"\ngit push origin main");
  const [scheduleType, setScheduleType] = useState("time");
  const [scheduleValue, setScheduleValue] = useState("17:00");

  useEffect(() => { const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50); }, [ide.chatHistory, ide.isAiThinking]);

  const editorExtensions = useMemo(() => {
    const exts = [search({ top: true })]; 
    if (ide.activeFile?.name.endsWith(".html")) exts.push(html());
    else if (ide.activeFile?.name.endsWith(".css")) exts.push(css());
    else exts.push(javascript({ jsx: true, typescript: true }));
    return exts;
  }, [ide.activeFile?.name]);

  const installModel = async (m: string) => {
    ide.setTerminalOutput(prev => prev + `\n> Downloading ${m}...\n`); ide.addToast(`Downloading ${m}...`, "info");
    try { await pullNewModel(m); ide.setTerminalOutput(prev => prev + `✅ ${m} installed!\n`); await ide.refreshModels(); ide.addToast(`${m} installed!`, "success"); } 
    catch(e) { ide.addToast(`Download failed`, "error"); }
  };

  const executeMenuCommand = (command: string) => {
    if (command === 'copy') document.execCommand('copy');
    if (command === 'paste') navigator.clipboard.readText().then(text => document.execCommand('insertText', false, text));
    if (command === 'undo') document.execCommand('undo');
    if (command === 'redo') document.execCommand('redo');
    if (command === 'find' && editorRef.current) openSearchPanel(editorRef.current.view); 
    ide.addToast(`Action: ${command}`, "info");
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.pageX, y: e.pageY, file });
  };

  if (ide.isBooting) {
    return (
      <div className="boot-screen">
        <div className="boot-logo-container"><div className="boot-spinner"></div><img src="/tauri.svg" className="boot-logo-image" /></div>
        <h1 className="boot-title">GODLY IDE</h1><p className="boot-status">Loading Workspace...</p>
      </div>
    );
  }

  return (
    <div className={`ide-wrapper theme-${ide.settings.theme}`} onClick={() => setContextMenu(null)}>
      <div className="toast-container">{ide.toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}</div>

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <div onClick={() => { ide.handleDelete(contextMenu.file); setContextMenu(null); }}>🗑️ Delete {contextMenu.file.name}</div>
          <div onClick={() => setContextMenu(null)} style={{color: '#888'}}>❌ Cancel</div>
        </div>
      )}

      {/* FULL VS CODE MENU */}
      <div className="top-menu-bar">
        <div className="menu-group">
          <img src="/tauri.svg" alt="logo" className="menu-logo" />
          <div className="menu-item has-dropdown">File
            <div className="dropdown"><div onClick={() => ide.handleNewFile(ide.currentDir)}>New File</div><div onClick={ide.handleOpenFolder}>Open Folder...</div><div onClick={ide.handleSaveFile}>Save (Ctrl+S)</div></div>
          </div>
          <div className="menu-item has-dropdown">Edit
            <div className="dropdown"><div onClick={() => executeMenuCommand('undo')}>Undo (Ctrl+Z)</div><div onClick={() => executeMenuCommand('redo')}>Redo (Ctrl+Y)</div><hr/><div onClick={() => executeMenuCommand('copy')}>Copy (Ctrl+C)</div><div onClick={() => executeMenuCommand('paste')}>Paste (Ctrl+V)</div><hr/><div onClick={() => executeMenuCommand('find')}>Find & Replace (Ctrl+Alt+F)</div></div>
          </div>
          <div className="menu-item has-dropdown">Selection
            <div className="dropdown"><div onClick={() => document.execCommand('selectAll')}>Select All (Ctrl+A)</div></div>
          </div>
          <div className="menu-item has-dropdown">View
            <div className="dropdown">
              <div onClick={() => ide.toggleView("showSidebar")}>{ide.settings.showSidebar ? "✓" : ""} Sidebar</div>
              <div onClick={() => ide.toggleView("showTerminal")}>{ide.settings.showTerminal ? "✓" : ""} Terminal</div>
              <div onClick={() => ide.toggleView("showAiPanel")}>{ide.settings.showAiPanel ? "✓" : ""} AI Chatbot</div>
              <hr/><div onClick={() => ide.setActiveTab('graph')}>Model Dependency Graph</div><div onClick={() => ide.setShowSettings(true)}>Settings</div>
            </div>
          </div>
          <div className="menu-item has-dropdown">Run
            <div className="dropdown"><div onClick={ide.runCode}>Run Active File</div><div onClick={ide.startLiveServer}>Go Live (Localhost)</div></div>
          </div>
          <div className="menu-item has-dropdown">Terminal
            <div className="dropdown"><div onClick={() => ide.setTerminalOutput("Console cleared.\n")}>Clear Terminal</div><div onClick={() => ide.setShowTaskModal(true)}>Background Task Scheduler</div></div>
          </div>
          <div className="menu-item has-dropdown">Help
            <div className="dropdown"><div onClick={() => ide.setShowLicenseModal(true)}>Activation & License</div><div onClick={() => alert("Godly IDE v6.0 - Ultimate Edition.")}>About</div></div>
          </div>
        </div>
        <div className="menu-title">{ide.currentDir.split('\\').pop() || ide.currentDir} - Godly IDE</div><div className="menu-spacer"></div>
      </div>

      <div className="ide-container">
        
        {ide.showLicenseModal && (
          <div className="modal-overlay" onClick={() => ide.setShowLicenseModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2>Product Activation</h2>
              <p style={{fontSize: '12px', color: '#aaa', marginBottom: '15px'}}>Godly IDE is currently {ide.settings.isActivated ? <span style={{color: '#89d185'}}>Activated ✅</span> : <span style={{color: '#f14c4c'}}>Unlicensed ❌</span>}</p>
              {!ide.settings.isActivated && (
                <div className="settings-section">
                  <input type="text" placeholder="Enter Product Key (e.g. GODLY-1234)" />
                  <button className="text-btn primary" onClick={() => {ide.setSettings({...ide.settings, isActivated: true}); ide.addToast("Product Activated!", "success");}}>Activate</button>
                </div>
              )}
              <hr style={{margin: '20px 0'}}/>
              <h3>Legal Documents</h3>
              <p style={{fontSize: '11px', color: '#888', marginBottom: '10px'}}>Generate standard legal boilerplate for your workspace.</p>
              <button className="text-btn outline" onClick={ide.generateLegalFiles}>Generate LICENSE & PRIVACY.md</button>
              <br/><button className="close-btn" onClick={() => ide.setShowLicenseModal(false)}>Close</button>
            </div>
          </div>
        )}

        {ide.showTaskModal && (
          <div className="modal-overlay" onClick={() => ide.setShowTaskModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2>OS Background Task Scheduler</h2>
              <p style={{fontSize: '11px', color: '#888', marginBottom: '15px'}}>Schedules a multi-line script to run seamlessly in the OS background, even when the IDE is closed.</p>
              <div className="settings-section">
                <input type="text" placeholder="Task Name (no spaces)" value={taskName} onChange={e => setTaskName(e.target.value)} />
                <textarea rows={4} placeholder="Multi-line Script (e.g., git add .\ngit commit -m '...')" value={taskScript} onChange={e => setTaskScript(e.target.value)} style={{width: '100%', background: '#111', color: 'white', padding: '10px', fontFamily: 'monospace', marginBottom: '10px'}} />
                
                <div style={{display: 'flex', gap: '10px', marginBottom: '10px'}}>
                  <select value={scheduleType} onChange={e => setScheduleType(e.target.value)} style={{padding: '5px', background: '#222', color: 'white', border: '1px solid #444'}}>
                    <option value="time">Exact Time (Daily)</option>
                    <option value="interval">Interval (Minutes)</option>
                  </select>
                  {scheduleType === "time" ? (
                    <input type="time" value={scheduleValue} onChange={e => setScheduleValue(e.target.value)} style={{ padding: '5px', flexGrow: 1 }} />
                  ) : (
                    <input type="number" placeholder="e.g. 5" value={scheduleValue} onChange={e => setScheduleValue(e.target.value)} style={{ padding: '5px', flexGrow: 1 }} />
                  )}
                </div>
              </div>
              <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
                <button className="text-btn primary" onClick={() => ide.scheduleTask(taskName, taskScript, scheduleType, scheduleValue)}>Schedule Task</button>
                <button className="text-btn outline" onClick={() => ide.setShowTaskModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

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
                <input type="password" placeholder="OpenAI Key" value={ide.settings.openAiKey} onChange={e => ide.setSettings({...ide.settings, openAiKey: e.target.value})} />
                <input type="password" placeholder="Gemini Key" value={ide.settings.geminiKey} onChange={e => ide.setSettings({...ide.settings, geminiKey: e.target.value})} />
              </div>
              <div className="settings-section">
                {/* UPGRADED: Expert Coder Models */}
                <h3>1-Click Local Models</h3>
                <div style={{display: 'flex', gap: '5px', flexWrap: 'wrap'}}>
                  <button className="text-btn outline" onClick={() => installModel('deepseek-coder-v2')}>DeepSeek Coder v2</button>
                  <button className="text-btn outline" onClick={() => installModel('qwen2.5-coder:7b')}>Qwen2.5 Coder 7B</button>
                  <button className="text-btn outline" onClick={() => installModel('codestral')}>Codestral</button>
                </div>
              </div>
              <button className="close-btn" onClick={() => ide.setShowSettings(false)}>Close</button>
            </div>
          </div>
        )}

        <div className="activity-bar">
          <div className={`activity-icon ${ide.activeSidebar === 'files' ? 'active' : ''}`} onClick={() => ide.setActiveSidebar('files')}>Files</div>
          <div className={`activity-icon ${ide.activeSidebar === 'git' ? 'active' : ''}`} onClick={() => ide.setActiveSidebar('git')}>GitHub</div>
          <div className="activity-icon" onClick={() => ide.setShowSettings(true)}>Settings</div>
        </div>

        {ide.settings.showSidebar && (
          <nav className="sidebar">
            {ide.activeSidebar === 'files' ? (
              <>
                <div className="sidebar-header"><span>Explorer</span>
                  <div className="sidebar-actions">
                    <button onClick={() => ide.handleNewFile(ide.currentDir)}>+</button>
                    <button onClick={() => ide.handleNewFolder(ide.currentDir)}>📁</button>
                  </div>
                </div>
                <div style={{padding: "5px 10px"}}><input type="text" placeholder="Search..." value={fileFilter} onChange={e => setFileFilter(e.target.value)} style={{width: "100%", background: "#1e1e1e", border: "1px solid #333", color: "white", padding: "4px", fontSize: "11px"}}/></div>
                <div className="file-list">{ide.files.filter(f => f.name.toLowerCase().includes(fileFilter.toLowerCase())).map((f, i) => <FileTreeNode key={i} file={f} ide={ide} paddingLeft={15} onContextMenu={handleContextMenu} />)}</div>
              </>
            ) : (
              <div className="git-sidebar">
                <div className="sidebar-header"><span>Source Control</span></div>
                <div style={{padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
                  <button className="text-btn outline" onClick={() => ide.handleTerminalCommand("git init")}>Initialize Repo</button>
                  <button className="text-btn outline" onClick={() => ide.handleTerminalCommand("git add .")}>Stage All Changes</button>
                  <input type="text" placeholder="Commit message..." style={{padding: '6px', background: '#111', color: 'white', border: '1px solid #444'}} onKeyDown={e => { if(e.key === "Enter") ide.handleTerminalCommand(`git commit -m "${e.currentTarget.value}"`) }}/>
                  <button className="text-btn primary" onClick={() => ide.handleTerminalCommand("git push origin main")}>Push to Origin</button>
                  <button className="text-btn outline" onClick={() => ide.handleTerminalCommand("git pull origin main")}>Pull from Origin</button>
                  <button className="text-btn outline" onClick={() => ide.handleTerminalCommand("gh pr create")}>Create Pull Request (GH)</button>
                </div>
              </div>
            )}
          </nav>
        )}

        <main className="main-content">
          <header className="editor-header">
            <div className="tabs">
              <div className={`tab ${ide.activeTab === "editor" ? "active" : ""}`} onClick={() => ide.setActiveTab("editor")}>{ide.activeFile?.name || "Code"}</div>
              <div className={`tab ${ide.activeTab === "preview" ? "active" : ""}`} onClick={() => ide.setActiveTab("preview")}>Live Preview</div>
              <div className={`tab ${ide.activeTab === "graph" ? "active" : ""}`} onClick={() => ide.setActiveTab("graph")}>Model Graph</div>
            </div>
            <div className="editor-actions"><button className="text-btn outline" onClick={ide.runCode}>▶ Run Code</button></div>
          </header>

          <div className="editor-workspace">
            {ide.activeTab === "editor" && <CodeMirror ref={editorRef} value={ide.code} theme={ide.settings.theme === "light" ? "light" : "dark"} extensions={editorExtensions} onChange={(val) => ide.setCode(val)} onKeyDown={(e) => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); ide.handleSaveFile(); }}} /> }
            {ide.activeTab === "preview" && <iframe className="preview-frame" srcDoc={ide.code} sandbox="allow-scripts allow-same-origin" /> }
            {ide.activeTab === "graph" && <DependencyGraph files={ide.files} /> }
          </div>

          {ide.settings.showTerminal && (
            <div className="terminal-panel">
              <div className="terminal-header">Terminal Output</div>
              <pre className="terminal-output">{ide.terminalOutput}</pre>
              <div className="terminal-input-box">
                <span style={{color: "#00ff00", marginRight: "5px"}}>$</span>
                <input type="text" value={termInput} onChange={(e) => setTermInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { ide.handleTerminalCommand(termInput); setTermInput(""); } }} placeholder="Type command here and press Enter (e.g. npm install)" />
              </div>
            </div>
          )}
        </main>

        {ide.settings.showAiPanel && (
          <aside className="ai-panel">
            <div className="panel-header"><span>Agent AI</span>
              <select className="model-selector" value={ide.selectedModel?.id || ""} onChange={(e) => ide.setSelectedModel(ide.availableModels.find(m => m.id === e.target.value)!)}>
                {ide.availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="chat-history">
              {ide.chatHistory.map((msg, idx) => <div key={idx} className={`chat-message ${msg.role}`}>{msg.content}</div>)}
              {ide.isAiThinking && <div className="chat-message system">Analyzing Workspace...</div>}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input-area">
              <textarea placeholder="Tell AI to code..." value={ide.chatInput} onChange={(e) => ide.setChatInput(e.target.value)} onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); ide.handleAskAi(); } }} />
              <p className="ai-disclaimer">⚠️ AI is for R&D purposes. Verify all generated code.</p>
              <button onClick={ide.handleAskAi} disabled={ide.isAiThinking || !ide.chatInput.trim()}>Send Command</button>
            </div>
          </aside>
        )}
      </div>
      <footer className="status-bar">
        <div className="status-group"><div className="status-item go-live-btn" onClick={ide.startLiveServer}>📡 Go Live (Port 3000)</div></div>
        <div className="status-group"><div className="status-item">{ide.settings.useWsl ? "WSL Active" : "Windows"}</div><div className="status-item">{time}</div></div>
      </footer>
    </div>
  );
}
export default App;