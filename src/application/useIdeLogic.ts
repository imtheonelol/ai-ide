import { useState, useEffect } from "react";
import { FileEntry, ChatMessage, AIModel, AppSettings } from "../domain/types";
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
  const [settings, setSettings] = useState<AppSettings>({ autoSaveAI: true, theme: "dark", useWsl: false });

  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{ role: "system", content: "AI IDE is online." }]);

  useEffect(() => { readProjectFiles(currentDir).then(setFiles); }, [currentDir]);
  useEffect(() => { 
    getLocalModels().then(models => { setAvailableModels(models); if (models.length > 0) setSelectedModel(models[0].id); });
  }, []);

  const handleOpenFolder = async () => {
    const newPath = await openNativeFolderPicker();
    if (newPath) {
      setCurrentDir(newPath); setActiveFile(null); setCode("// Opened new workspace."); setTerminalOutput(`Workspace: ${newPath}\n`);
    }
  };

  const handleFileClick = async (file: FileEntry) => {
    if (!file.is_dir) {
      const content = await readFileContent(file.path); setActiveFile(file); setCode(content); setActiveTab("editor");
    }
  };

  const handleDelete = async (file: FileEntry) => {
    if (confirm(`Delete ${file.name}?`)) {
      await deleteProjectFile(file.path, file.is_dir);
      if (activeFile?.path === file.path) { setActiveFile(null); setCode(""); }
      readProjectFiles(currentDir).then(setFiles);
    }
  };

  const handleSaveFile = async () => { if (activeFile) await saveFileContent(activeFile.path, code); };

  const handleNewFile = async (targetDir: string = currentDir) => {
    const fileName = prompt("File name (e.g. index.html):");
    if (fileName) { await saveFileContent(`${targetDir}/${fileName}`, ""); readProjectFiles(currentDir).then(setFiles); }
  };

  // --- NEW: Git Commands ---
  const handleGitCommand = async (action: "status" | "add" | "commit" | "pull" | "push") => {
    let args: string[] = [];
    if (action === "status") args = ["status"];
    if (action === "add") args = ["add", "."];
    if (action === "commit") {
      const msg = prompt("Commit message:");
      if (!msg) return;
      args = ["commit", "-m", msg];
    }
    if (action === "pull") args = ["pull"];
    if (action === "push") args = ["push"];
    
    setTerminalOutput(prev => prev + `\n> git ${args.join(" ")}\n`);
    const out = await runTerminalCommand("git", args, currentDir);
    setTerminalOutput(prev => prev + out + "\n");
  };

  // --- NEW: Real Live Server ---
  const startLiveServer = async () => {
    setTerminalOutput(prev => prev + "\n> Starting localhost on port 3000...\n");
    try {
      await spawnLiveServer(currentDir, 3000);
      await openInBrowser("http://localhost:3000");
      setTerminalOutput(prev => prev + "Live server running at http://localhost:3000\n");
    } catch (e: any) {
      setTerminalOutput(prev => prev + `Error starting server: ${e}. Ensure 'npx' is installed.\n`);
    }
  };

  // --- UPGRADED: Multi-Language & WSL Execution ---
  const runCode = async () => {
    if (!activeFile) return;
    setTerminalOutput(prev => prev + `\n> Running ${activeFile.name}...\n`);
    
    let cmd = "";
    let args = [activeFile.name];

    if (activeFile.name.endsWith(".js")) cmd = "node";
    else if (activeFile.name.endsWith(".py")) cmd = "python";
    else if (activeFile.name.endsWith(".php")) cmd = "php";
    else if (activeFile.name.endsWith(".ts")) cmd = "ts-node";
    else if (activeFile.name.endsWith(".rs")) cmd = "rustc";
    else if (activeFile.name.endsWith(".cpp")) cmd = "g++";
    else if (activeFile.name.endsWith(".sh")) cmd = "bash";
    else {
      setTerminalOutput(prev => prev + "❌ Unsupported format. Use Go Live for HTML.\n");
      return;
    }

    if (settings.useWsl) {
      args = [cmd, activeFile.name];
      cmd = "wsl";
    }

    const out = await runTerminalCommand(cmd, args, currentDir);
    setTerminalOutput(prev => prev + out + "\n");
  };

  // --- FIXED: Dynamic File Extension Saving ---
  const handleAskAi = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput(""); setChatHistory(prev => [...prev, { role: "user", content: userMsg }]); setIsAiThinking(true);

    try {
      const result = await generateAIResponse(selectedModel, `File: ${activeFile?.name || 'None'}\nCode:\n\`\`\`\n${code}\n\`\`\`\nRequest: ${userMsg}`, "Provide code wrapped in markdown blocks. Indicate the language like ```html or ```javascript");
      setChatHistory(prev => [...prev, { role: "ai", content: result }]);
      
      const match = result.match(/```([a-zA-Z]*)\n([\s\S]*?)```/);
      if (match && match[2]) {
        const lang = match[1].toLowerCase();
        const newCode = match[2].trim();
        setCode(newCode);

        if (settings.autoSaveAI) {
          await createProjectFolder(`${currentDir}/ai_generated`);
          
          // Map AI language format to real file extensions!
          const extMap: Record<string, string> = { javascript: "js", html: "html", css: "css", python: "py", typescript: "ts", rust: "rs", php: "php", bash: "sh" };
          const ext = extMap[lang] || (newCode.startsWith("<!DOCTYPE") || newCode.startsWith("<html") ? "html" : "txt");

          const aiFileName = `ai_${Date.now()}.${ext}`;
          await saveFileContent(`${currentDir}/ai_generated/${aiFileName}`, newCode);
          readProjectFiles(currentDir).then(setFiles);
          setChatHistory(prev => [...prev, { role: "system", content: `Saved cleanly to ai_generated/${aiFileName}` }]);
        }
      }
    } catch (err: any) { setChatHistory(prev => [...prev, { role: "error", content: err.message }]); } 
    finally { setIsAiThinking(false); }
  };

  return {
    currentDir, setCurrentDir, files, activeFile, code, setCode,
    activeTab, setActiveTab, terminalOutput, setTerminalOutput, runCode, startLiveServer,
    showSettings, setShowSettings, settings, setSettings,
    chatInput, setChatInput, chatHistory, isAiThinking, availableModels, selectedModel, setSelectedModel,
    handleFileClick, handleSaveFile, handleNewFile, handleAskAi, handleOpenFolder, handleDelete, handleGitCommand
  };
};