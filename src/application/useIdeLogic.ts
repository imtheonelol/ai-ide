import { useState, useEffect } from "react";
import { FileEntry, ChatMessage, AIModel, AppSettings, CLOUD_MODELS, Toast } from "../domain/types";
import { readProjectFiles, readFileContent, saveFileContent, createProjectFolder, deleteProjectFile, openNativeFolderPicker, runTerminalCommand, spawnLiveServer, openInBrowser } from "../infrastructure/fileSystem";
import { generateAIResponse, getLocalModels } from "../infrastructure/aiService";

export const useIdeLogic = () => {
  const [isBooting, setIsBooting] = useState(true);
  const [bootStatus, setBootStatus] = useState("Initializing System Engine...");

  const [currentDir, setCurrentDir] = useState("./");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [code, setCode] = useState("// Workspace Ready.\n// Select a file to begin.");
  
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [terminalOutput, setTerminalOutput] = useState("Console ready...\n");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ theme: "dark", useWsl: false, openAiKey: "", geminiKey: "" });
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [availableModels, setAvailableModels] = useState<AIModel[]>(CLOUD_MODELS);
  const [selectedModel, setSelectedModel] = useState<AIModel>(CLOUD_MODELS[0]);
  const [chatInput, setChatInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{ role: "system", content: "AI is connected. Analyzing workspace." }]);

  const addToast = (msg: string, type: "info" | "success" | "error" = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message: msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // THE BOOT SEQUENCE
  useEffect(() => {
    const runBootSequence = async () => {
      try {
        setBootStatus("Scanning File System...");
        await readProjectFiles(currentDir).then(setFiles);
        await new Promise(r => setTimeout(r, 600));

        setBootStatus("Connecting to Local AI Daemon (Ollama)...");
        const models = await getLocalModels();
        setAvailableModels([...models, ...CLOUD_MODELS]);
        
        if (models.length > 0) {
          setSelectedModel(models[0]);
          setBootStatus(`Found ${models.length} Local AI Models...`);
        } else {
          setBootStatus("No Local Models found. Defaulting to Cloud AI...");
          setSelectedModel(CLOUD_MODELS[0]);
        }
        await new Promise(r => setTimeout(r, 800));

        setBootStatus("Loading UI Dependencies...");
        await new Promise(r => setTimeout(r, 400));
        
        setIsBooting(false); // Hide loader and show IDE
      } catch (e) {
        setBootStatus("Boot Warning: Some services offline. Starting anyway...");
        setTimeout(() => setIsBooting(false), 2000);
      }
    };
    runBootSequence();
  }, []);

  const handleOpenFolder = async () => {
    const newPath = await openNativeFolderPicker();
    if (newPath) { setCurrentDir(newPath); setActiveFile(null); setCode(""); addToast("Workspace loaded", "success"); readProjectFiles(newPath).then(setFiles); }
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
        context += `\n--- ${f.name} ---\n${content.substring(0, 2000)}\n`; count++;
      }
    }
    return context;
  };

  const handleAskAi = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput(""); setChatHistory(prev => [...prev, { role: "user", content: userMsg }]); setIsAiThinking(true);

    try {
      const workspaceContext = await getWorkspaceContext();
      const apiKey = selectedModel.provider === "openai" ? settings.openAiKey : settings.geminiKey;
      const systemPrompt = `You are a God-Tier Developer AI. If modifying files, output using this EXACT format:
      ###FILE: filename.ext
      \`\`\`language
      code
      \`\`\``;

      const result = await generateAIResponse(selectedModel.provider, selectedModel.id, `WORKSPACE:\n${workspaceContext}\n\nACTIVE FILE: ${activeFile?.name}\n${code}\n\nREQUEST: ${userMsg}`, systemPrompt, apiKey);
      setChatHistory(prev => [...prev, { role: "ai", content: result }]);
      
      const fileRegex = /###FILE:\s*([^\n]+)\n```[a-zA-Z]*\n([\s\S]*?)```/g;
      let match; let savedCount = 0;
      while ((match = fileRegex.exec(result)) !== null) {
        const fileName = match[1].trim(); const fileCode = match[2].trim();
        await saveFileContent(`${currentDir}/${fileName}`, fileCode); savedCount++;
      }
      if (savedCount > 0) { readProjectFiles(currentDir).then(setFiles); addToast(`AI auto-generated ${savedCount} files!`, "success"); }
    } catch (err: any) { 
      setChatHistory(prev => [...prev, { role: "error", content: err.message }]); addToast("AI Failed", "error");
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
    else { addToast("Unsupported execution format", "error"); return; }
    if (settings.useWsl) { args = [cmd, activeFile.name]; cmd = "wsl"; }
    const out = await runTerminalCommand(cmd, args, currentDir);
    setTerminalOutput(prev => prev + `\n> ${cmd} ${args.join(" ")}\n` + out);
  };

  const handleGitCommand = async (action: "status" | "add" | "commit" | "pull" | "push") => {
    let args: string[] = [];
    if (action === "status") args = ["status"];
    if (action === "add") args = ["add", "."];
    if (action === "commit") { const msg = prompt("Commit msg:"); if (!msg) return; args = ["commit", "-m", msg]; }
    if (action === "pull") args = ["pull"];
    if (action === "push") args = ["push"];
    setTerminalOutput(prev => prev + `\n> git ${args.join(" ")}\n`);
    const out = await runTerminalCommand("git", args, currentDir);
    setTerminalOutput(prev => prev + out + "\n");
  };

  return {
    isBooting, bootStatus, currentDir, setCurrentDir, files, activeFile, code, setCode,
    activeTab, setActiveTab, terminalOutput, setTerminalOutput, runCode, startLiveServer,
    showSettings, setShowSettings, settings, setSettings, toasts,
    chatInput, setChatInput, chatHistory, isAiThinking, availableModels, selectedModel, setSelectedModel,
    handleFileClick, handleSaveFile, handleNewFile, handleAskAi, handleOpenFolder, handleDelete, handleGitCommand
  };
};