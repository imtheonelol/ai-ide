import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { generateAIResponse } from "./infrastructure/aiService";
import "./App.css";

function App() {
  const [code, setCode] = useState("// Select a file or start coding...");
  const [chatInput, setChatInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);

  const handleAskAi = async () => {
    setIsAiThinking(true);
    const result = await generateAIResponse({
      model: "qwen2.5-coder:1.5b",
      prompt: `In this code: ${code}\n\nUser Question: ${chatInput}`,
      system: "You are a godly web dev assistant. Provide code fixes and explanations."
    });
    // This simple logic replaces code if the AI provides a full snippet
    if (result.includes("```")) {
      const extractedCode = result.split("```")[1].split("```")[0].replace("javascript", "").trim();
      setCode(extractedCode);
    }
    setChatInput("");
    setIsAiThinking(false);
  };

  return (
    <div className="ide-container">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-header">FILES</div>
        <div className="file-item">index.html</div>
        <div className="file-item">App.tsx</div>
        <div className="file-item active">main.ts</div>
      </nav>

      {/* Editor Area */}
      <main className="editor-area">
        <header className="editor-header">
          <span>main.ts</span>
          <button className="run-btn">Run Project</button>
        </header>
        <CodeMirror
          value={code}
          height="100%"
          theme="dark"
          extensions={[javascript({ jsx: true, typescript: true })]}
          onChange={(val) => setCode(val)}
        />
      </main>

      {/* AI Chat Right Panel */}
      <aside className="ai-panel">
        <div className="panel-header">AI ASSISTANT</div>
        <div className="chat-history">
          <p className="ai-bubble">How can I help you build today?</p>
        </div>
        <div className="chat-input-area">
          <textarea 
            placeholder="Ask AI to fix or generate code..." 
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button onClick={handleAskAi} disabled={isAiThinking}>
            {isAiThinking ? "..." : "Send"}
          </button>
        </div>
      </aside>
    </div>
  );
}

export default App;