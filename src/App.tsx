import { useState, useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { generateAIResponse } from "./infrastructure/aiService";
import "./App.css";

interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

function App() {
  const [code, setCode] = useState("// Welcome to your Godly Local AI IDE\n// Start coding here...\n");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { role: "ai", content: "Hello! I am your local AI assistant. How can I help you build today?" }
  ]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat when new messages appear
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleAskAi = async () => {
    if (!chatInput.trim()) return;

    const userMessage = chatInput;
    setChatInput("");
    setErrorMsg("");
    setChatHistory(prev => [...prev, { role: "user", content: userMessage }]);
    setIsAiThinking(true);

    try {
      const result = await generateAIResponse({
        model: "qwen2.5-coder:1.5b", // Make sure you ran: ollama run qwen2.5-coder:1.5b
        prompt: `Here is the current code:\n\`\`\`javascript\n${code}\n\`\`\`\n\nUser Request: ${userMessage}`,
        system: "You are an expert 10x developer AI. Answer the user's questions clearly. If you provide code, wrap it in standard markdown code blocks (e.g. ```javascript )."
      });

      setChatHistory(prev => [...prev, { role: "ai", content: result }]);

      // AI Auto-apply code logic: If the AI returns a code block, apply it to the editor
      if (result.includes("```javascript")) {
        const extractedCode = result.split("```javascript")[1].split("```")[0].trim();
        setCode(extractedCode);
        setChatHistory(prev => [...prev, { role: "ai", content: "✨ I have automatically applied the updated code to your editor." }]);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to connect to AI. Ensure Ollama is running and CORS is configured.");
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskAi();
    }
  };

  return (
    <div className="ide-container">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-header">Explorer</div>
        <div className="file-list">
          <div className="file-item active">📄 main.js</div>
          <div className="file-item">📄 index.html</div>
          <div className="file-item">🎨 styles.css</div>
        </div>
      </nav>

      {/* Editor Area */}
      <main className="editor-area">
        <header className="editor-header">
          <div className="editor-tab">main.js</div>
        </header>
        <CodeMirror
          value={code}
          theme="dark"
          extensions={[javascript({ jsx: true, typescript: true })]}
          onChange={(val) => setCode(val)}
        />
      </main>

      {/* AI Chat Right Panel */}
      <aside className="ai-panel">
        <div className="panel-header">Bolt.ai Assistant</div>
        <div className="chat-history">
          {chatHistory.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role}`}>
              {msg.content}
            </div>
          ))}
          {isAiThinking && (
            <div className="chat-message ai">AI is thinking...</div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-input-area">
          <textarea 
            placeholder="Ask AI to fix or generate code... (Press Enter to send)" 
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAiThinking}
          />
          {errorMsg && <div className="error-text">{errorMsg}</div>}
          <button onClick={handleAskAi} disabled={isAiThinking || !chatInput.trim()}>
            {isAiThinking ? "Generating..." : "Send"}
          </button>
        </div>
      </aside>
    </div>
  );
}

export default App;