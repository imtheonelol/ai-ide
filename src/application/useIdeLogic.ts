import { useState, useEffect } from "react";
import { FileEntry, ChatMessage, AIModel, AppSettings, CLOUD_MODELS, Toast } from "../domain/types";
import { readProjectFiles, readFileContent, saveFileContent, createProjectFolder, deleteProjectFile, openNativeFolderPicker, runTerminalCommand, spawnLiveServer, openInBrowser } from "../infrastructure/fileSystem";
import { generateAIResponse, getLocalModels } from "../infrastructure/aiService";

export const useIdeLogic = () => {
  const [isBooting, setIsBooting] = useState(true);
  const [currentDir, setCurrentDir] = useState(() => localStorage.getItem("ide_workspace") || "./");
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("ide_settings");
    return saved ? JSON.parse(saved) : { theme: "dark", useWsl: false, openAiKey: "", geminiKey: "" };
  });

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [code, setCode] = useState("// Welcome. Select a file.");
  
  const [activeTab, setActiveTab] = useState<"editor" | "preview" | "graph">("editor");
  const [terminalOutput, setTerminalOutput] = useState("Godly IDE Console Ready.\nType commands below (e.g., 'cd myfolder', 'npm install', 'git clone').\n");
  const [showSettings, setShowSettings] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [availableModels, setAvailableModels] = useState<AIModel[]>(CLOUD_MODELS);
  const [selectedModel, setSelectedModel] = useState<AIModel>(CLOUD_MODELS[0]);
  const [chatInput, setChatInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{ role: "system", content: "⚡ Autonomous Agent Online. I can write files, delete files, and run terminal commands for you." }]);

  const addToast = (msg: string, type: "info" | "success" | "error" = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message: msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  useEffect(() => { 
    setTimeout(() => setIsBooting(false), 2000); // 2 second boot screen
    localStorage.setItem("ide_workspace", currentDir);
    readProjectFiles(currentDir).then(setFiles); 
  }, [currentDir]);

  useEffect(() => { localStorage.setItem("ide_settings", JSON.stringify(settings)); }, [settings]);

  const refreshModels = async () => {
    const models = await getLocalModels();
    setAvailableModels([...models, ...CLOUD_MODELS]);
    if (models.length > 0 && selectedModel.provider !== "ollama") setSelectedModel(models[0]);
  };
  useEffect(() => { refreshModels(); }, []);

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

  // --- NEW: Interactive Terminal Executor ---
  const handleTerminalCommand = async (input: string) => {
    if (!input.trim()) return;
    setTerminalOutput(prev => prev + `\n$ ${input}\n`);
    
    // Intercept 'cd' commands to update workspace path in frontend
    if (input.trim().startsWith("cd ")) {
      const target = input.trim().substring(3).trim();
      const newPath = target === ".." ? currentDir.split('\\').slice(0, -1).join('\\') || "C:\\" : `${currentDir}\\${target}`;
      setCurrentDir(newPath);
      setTerminalOutput(prev => prev + `Directory changed to ${newPath}\n`);
      return;
    }

    const cmdParts = input.trim().split(" ");
    const baseCmd = cmdParts[0];
    const args = cmdParts.slice(1);
    
    const out = await runTerminalCommand(baseCmd, args, currentDir);
    setTerminalOutput(prev => prev + out);
  };

  const getWorkspaceContext = async () => {
    let context = ""; let count = 0;
    for (const f of files) {
      if (!f.is_dir && !f.name.match(/\.(png|svg|ico|exe|jpg|mp4)$/i) && count < 10) {
        const content = await readFileContent(f.path);
        context += `\n--- ${f.name} ---\n${content.substring(0, 2000)}\n`;
        count++;
      }
    }
    return context;
  };

  // --- UPGRADED: Flawless XML Parsing Engine ---
  const handleAskAi = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput(""); setChatHistory(prev => [...prev, { role: "user", content: userMsg }]); setIsAiThinking(true);

    try {
      const workspaceContext = await getWorkspaceContext();
      const apiKey = selectedModel.provider === "openai" ? settings.openAiKey : settings.geminiKey;
      
      const systemPrompt = `You are a God-Tier Autonomous IDE Agent. You control the user's workspace.
      DO NOT use markdown format (***) in your text responses.
      
      To CREATE or OVERWRITE files, you MUST use EXACTLY this XML format:
      <file action="write" path="filename.ext">
      file content goes here
      </file>
      
      To DELETE files:
      <file action="delete" path="filename.ext"></file>
      
      To RUN TERMINAL COMMANDS (like git clone, npm init):
      <cmd>npm install axios</cmd>
      
      Keep your text explanations brief. Just output the tags to do the work.`;

      const result = await generateAIResponse(
        selectedModel.provider, selectedModel.id, 
        `WORKSPACE:\n${workspaceContext}\n\nACTIVE FILE: ${activeFile?.name}\n${code}\n\nREQUEST: ${userMsg}`, 
        systemPrompt, apiKey
      );
      
      let displayMessage = result;
      let actionCount = 0;

      // 1. Terminal Commands
      const cmdRegex = /<cmd>([\s\S]*?)<\/cmd>/g;
      let cmdMatch;
      while ((cmdMatch = cmdRegex.exec(result)) !== null) {
        handleTerminalCommand(cmdMatch[1].trim());
        displayMessage = displayMessage.replace(cmdMatch[0], "");
        actionCount++;
      }

      // 2. File Deletions
      const deleteRegex = /<file[^>]*action="delete"[^>]*path="([^"]+)"[^>]*>[\s\S]*?<\/file>/g;
      let delMatch;
      while ((delMatch = deleteRegex.exec(result)) !== null) {
        await deleteProjectFile(`${currentDir}/${delMatch[1].trim()}`, false).catch(()=>null);
        displayMessage = displayMessage.replace(delMatch[0], "");
        actionCount++;
      }

      // 3. File Writes
      const writeRegex = /<file[^>]*action="write"[^>]*path="([^"]+)"[^>]*>([\s\S]*?)<\/file>/g;
      let writeMatch;
      while ((writeMatch = writeRegex.exec(result)) !== null) {
        const filePath = writeMatch[1].trim();
        const fileContent = writeMatch[2].trim();
        
        const parts = filePath.split("/");
        if (parts.length > 1) {
          const dirPath = parts.slice(0, -1).join("/");
          await createProjectFolder(`${currentDir}/${dirPath}`);
        }

        await saveFileContent(`${currentDir}/${filePath}`, fileContent);
        if (activeFile && filePath.endsWith(activeFile.name)) setCode(fileContent);
        displayMessage = displayMessage.replace(writeMatch[0], "");
        actionCount++;
      }

      displayMessage = displayMessage.replace(/\*\*/g, "").replace(/```[\s\S]*?```/g, "[Code Extracted & Applied]").trim();
      if (displayMessage.length === 0 && actionCount > 0) displayMessage = `Done! Executed ${actionCount} tasks perfectly.`;

      setChatHistory(prev => [...prev, { role: "ai", content: displayMessage }]);
      if (actionCount > 0) { readProjectFiles(currentDir).then(setFiles); addToast(`AI executed ${actionCount} tasks!`, "success"); }

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
    else if (activeFile.name.endsWith(".ts")) cmd = "npx ts-node";
    else if (activeFile.name.endsWith(".rs")) cmd = "rustc";
    else if (activeFile.name.endsWith(".cpp")) cmd = "g++";
    else if (activeFile.name.endsWith(".sh")) cmd = "bash";
    else { addToast("Unsupported file type", "error"); return; }

    if (settings.useWsl) { args = [cmd, activeFile.name]; cmd = "wsl"; }
    const out = await runTerminalCommand(cmd, args, currentDir);
    setTerminalOutput(prev => prev + `\n> ${cmd} ${args.join(" ")}\n` + out);
  };

  return {
    isBooting, currentDir, setCurrentDir, files, activeFile, code, setCode,
    activeTab, setActiveTab, terminalOutput, setTerminalOutput, handleTerminalCommand, runCode, startLiveServer,
    showSettings, setShowSettings, settings, setSettings, toasts, addToast, refreshModels, 
    chatInput, setChatInput, chatHistory, isAiThinking, availableModels, selectedModel, setSelectedModel,
    handleFileClick, handleSaveFile, handleNewFile, handleAskAi, handleOpenFolder, handleDelete
  };
};