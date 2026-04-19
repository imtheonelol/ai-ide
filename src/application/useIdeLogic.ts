import { useState, useEffect } from "react";
import { FileEntry, ChatMessage, AIModel, AppSettings, CLOUD_MODELS, Toast } from "../domain/types";
import { readProjectFiles, readFileContent, saveFileContent, createProjectFolder, deleteProjectFile, openNativeFolderPicker, runTerminalCommand, spawnLiveServer, openInBrowser } from "../infrastructure/fileSystem";
import { generateAIResponse, getLocalModels } from "../infrastructure/aiService";

export const useIdeLogic = () => {
  const [currentDir, setCurrentDir] = useState("./");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [code, setCode] = useState("// Welcome. Select a file.");
  
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [terminalOutput, setTerminalOutput] = useState("Console ready...\n");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ theme: "dark", useWsl: false, openAiKey: "", geminiKey: "" });
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [availableModels, setAvailableModels] = useState<AIModel[]>(CLOUD_MODELS);
  const [selectedModel, setSelectedModel] = useState<AIModel>(CLOUD_MODELS[0]);
  const [chatInput, setChatInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{ role: "system", content: "AI IDE is online. Ready to read workspace." }]);

  const addToast = (msg: string, type: "info" | "success" | "error" = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message: msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  useEffect(() => { readProjectFiles(currentDir).then(setFiles); }, [currentDir]);
  useEffect(() => { 
    getLocalModels().then(models => { setAvailableModels([...models, ...CLOUD_MODELS]); if (models.length > 0) setSelectedModel(models[0]); });
  }, []);

  const handleOpenFolder = async () => {
    const newPath = await openNativeFolderPicker();
    if (newPath) { setCurrentDir(newPath); setActiveFile(null); setCode(""); addToast("Workspace loaded", "success"); }
  };

  const handleFileClick = async (file: FileEntry) => {
    if (!file.is_dir) { const content = await readFileContent(file.path); setActiveFile(file); setCode(content); setActiveTab("editor"); }
  };

  const handleDelete = async (file: FileEntry) => {
    if (confirm(`Delete ${file.name}?`)) {
      await deleteProjectFile(file.path, file.is_dir);
      if (activeFile?.path === file.path) { setActiveFile(null); setCode(""); }
      readProjectFiles(currentDir).then(setFiles); addToast(`Deleted ${file.name}`);
    }
  };

  const handleSaveFile = async () => { if (activeFile) { await saveFileContent(activeFile.path, code); addToast("File saved", "success"); } };

  const handleNewFile = async (targetDir: string = currentDir) => {
    const fileName = prompt("File name (e.g. index.html):");
    if (fileName) { await saveFileContent(`${targetDir}/${fileName}`, ""); readProjectFiles(currentDir).then(setFiles); }
  };

  const getWorkspaceContext = async () => {
    let context = ""; let count = 0;
    for (const f of files) {
      if (!f.is_dir && !f.name.match(/\.(png|svg|ico|exe|jpg)$/i) && count < 8) {
        const content = await readFileContent(f.path);
        context += `\n--- ${f.name} ---\n${content.substring(0, 2000)}\n`;
        count++;
      }
    }
    return context;
  };

  // --- UPGRADED: Multi-File AI Execution ---
  const handleAskAi = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput(""); setChatHistory(prev => [...prev, { role: "user", content: userMsg }]); setIsAiThinking(true);

    try {
      const workspaceContext = await getWorkspaceContext();
      const apiKey = selectedModel.provider === "openai" ? settings.openAiKey : settings.geminiKey;
      
      const systemPrompt = `You are a God-Tier Developer AI. 
      If you create or modify files, output using this EXACT format for EACH file so the IDE can auto-save them:
      ###FILE: filename.ext
      \`\`\`language
      code
      \`\`\`
      `;

      const result = await generateAIResponse(
        selectedModel.provider, selectedModel.id, 
        `WORKSPACE:\n${workspaceContext}\n\nACTIVE FILE: ${activeFile?.name}\n${code}\n\nREQUEST: ${userMsg}`, 
        systemPrompt, apiKey
      );
      
      setChatHistory(prev => [...prev, { role: "ai", content: result }]);
      
      // Auto-slice and save multiple files
      const fileRegex = /###FILE:\s*([^\n]+)\n```[a-zA-Z]*\n([\s\S]*?)```/g;
      let match; let savedCount = 0;

      while ((match = fileRegex.exec(result)) !== null) {
        const fileName = match[1].trim();
        const fileCode = match[2].trim();
        await saveFileContent(`${currentDir}/${fileName}`, fileCode);
        savedCount++;
      }

      if (savedCount > 0) {
        readProjectFiles(currentDir).then(setFiles);
        addToast(`AI successfully generated ${savedCount} files!`, "success");
      }

    } catch (err: any) { 
      setChatHistory(prev => [...prev, { role: "error", content: err.message }]);
      addToast("AI Connection Failed", "error");
    } finally { setIsAiThinking(false); }
  };

  const startLiveServer = async () => {
    try { await spawnLiveServer(currentDir, 3000); await openInBrowser("http://localhost:3000"); addToast("Live Server Started", "success"); } 
    catch (e) { addToast("Failed to start server", "error"); }
  };

  const runCode = async () => {
    if (!activeFile) return;
    let cmd = ""; let args = [activeFile.name];
    if (activeFile.name.endsWith(".js")) cmd = "node";
    else if (activeFile.name.endsWith(".py")) cmd = "python";
    else if (activeFile.name.endsWith(".php")) cmd = "php";
    else if (activeFile.name.endsWith(".ts")) cmd = "npx ts-node";
    else if (activeFile.name.endsWith(".sh")) cmd = "bash";
    else { addToast("Unsupported file type", "error"); return; }

    if (settings.useWsl) { args = [cmd, activeFile.name]; cmd = "wsl"; }
    const out = await runTerminalCommand(cmd, args, currentDir);
    setTerminalOutput(prev => prev + `\n> ${cmd} ${args.join(" ")}\n` + out);
  };

  return {
    currentDir, setCurrentDir, files, activeFile, code, setCode,
    activeTab, setActiveTab, terminalOutput, setTerminalOutput, runCode, startLiveServer,
    showSettings, setShowSettings, settings, setSettings, toasts,
    chatInput, setChatInput, chatHistory, isAiThinking, availableModels, selectedModel, setSelectedModel,
    handleFileClick, handleSaveFile, handleNewFile, handleAskAi, handleOpenFolder, handleDelete
  };
};