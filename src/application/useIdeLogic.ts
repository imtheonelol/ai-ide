import { useState, useEffect } from "react";
import { FileEntry, ChatMessage, AIModel, AppSettings, CLOUD_MODELS, Toast } from "../domain/types";
import { readProjectFiles, readFileContent, saveFileContent, createProjectFolder, deleteProjectFile, openNativeFolderPicker, runTerminalCommand, spawnLiveServer, openInBrowser, scheduleBackgroundTask, killAllBackgroundProcesses } from "../infrastructure/fileSystem";
import { generateAIResponse, getLocalModels } from "../infrastructure/aiService";

export const useIdeLogic = () => {
  const [isBooting, setIsBooting] = useState(true);
  const [currentDir, setCurrentDir] = useState(() => localStorage.getItem("ide_workspace") || "./");
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("ide_settings");
    return saved ? JSON.parse(saved) : { theme: "dark", useWsl: false, openAiKey: "", geminiKey: "", showSidebar: true, showTerminal: true, showAiPanel: true, isActivated: false };
  });

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [code, setCode] = useState("// Welcome. Select a file.");
  
  const [activeTab, setActiveTab] = useState<"editor" | "preview" | "graph">("editor");
  const [activeSidebar, setActiveSidebar] = useState<"files" | "git">("files");
  
  const [terminalOutput, setTerminalOutput] = useState("Godly IDE Console Ready.\n");
  const [showSettings, setShowSettings] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [availableModels, setAvailableModels] = useState<AIModel[]>(CLOUD_MODELS);
  const [selectedModel, setSelectedModel] = useState<AIModel>(CLOUD_MODELS[0]);
  const [chatInput, setChatInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{ role: "system", content: "⚡ Autonomous Agent Online. Memory & High Accuracy Active." }]);

  const addToast = (msg: string, type: "info" | "success" | "error" = "info") => {
    const id = Date.now(); setToasts(prev => [...prev, { id, message: msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  useEffect(() => { setTimeout(() => setIsBooting(false), 2000); localStorage.setItem("ide_workspace", currentDir); readProjectFiles(currentDir).then(setFiles); }, [currentDir]);
  useEffect(() => { localStorage.setItem("ide_settings", JSON.stringify(settings)); }, [settings]);

  const refreshModels = async () => {
    const models = await getLocalModels(); setAvailableModels([...models, ...CLOUD_MODELS]);
    if (models.length > 0 && selectedModel.provider !== "ollama") setSelectedModel(models[0]);
  };
  useEffect(() => { refreshModels(); }, []);

  const toggleView = (key: "showSidebar" | "showTerminal" | "showAiPanel") => setSettings({ ...settings, [key]: !settings[key] });

  const handleOpenFolder = async () => { const newPath = await openNativeFolderPicker(); if (newPath) { setCurrentDir(newPath); setActiveFile(null); setCode(""); addToast("Workspace loaded", "success"); } };
  const handleFileClick = async (file: FileEntry) => { if (!file.is_dir) { const content = await readFileContent(file.path); setActiveFile(file); setCode(content); setActiveTab("editor"); } };
  
  const handleDelete = async (file: FileEntry) => { 
    if (confirm(`Are you sure you want to permanently delete ${file.name}?`)) { 
      try { await deleteProjectFile(file.path, file.is_dir); if (activeFile?.path === file.path) { setActiveFile(null); setCode(""); } readProjectFiles(currentDir).then(setFiles); addToast(`Deleted ${file.name}`, "success"); } 
      catch (err: any) { addToast(`Failed to delete: ${err}`, "error"); }
    } 
  };
  
  const handleSaveFile = async () => { if (activeFile) { await saveFileContent(activeFile.path, code); addToast("File saved", "success"); } };
  const handleNewFile = async (targetDir: string = currentDir) => { const fileName = prompt("File name:"); if (fileName) { await saveFileContent(`${targetDir}/${fileName}`, ""); readProjectFiles(currentDir).then(setFiles); } };
  const handleNewFolder = async (targetDir: string = currentDir) => { const folderName = prompt("Folder name:"); if (folderName) { await createProjectFolder(`${targetDir}/${folderName}`); readProjectFiles(currentDir).then(setFiles); } };

  const handleTerminalCommand = async (input: string) => {
    if (!input.trim()) return;
    setTerminalOutput(prev => prev + `\n$ ${input}\n`);
    if (input.trim().startsWith("cd ")) {
      const target = input.trim().substring(3).trim();
      const newPath = target === ".." ? currentDir.split('\\').slice(0, -1).join('\\') || "C:\\" : `${currentDir}\\${target}`;
      setCurrentDir(newPath); setTerminalOutput(prev => prev + `Directory changed to ${newPath}\n`); return;
    }
    const cmdParts = input.trim().split(" ");
    const out = await runTerminalCommand(cmdParts[0], cmdParts.slice(1), currentDir);
    setTerminalOutput(prev => prev + out);
  };

  const getWorkspaceContext = async () => {
    let context = ""; let count = 0;
    for (const f of files) {
      if (!f.is_dir && !f.name.match(/\.(png|svg|ico|exe|jpg|mp4)$/i) && count < 10) {
        const content = await readFileContent(f.path); context += `\n--- ${f.name} ---\n${content.substring(0, 2000)}\n`; count++;
      }
    }
    return context;
  };

  // --- FIXED: Memory System and Ironclad Markdown Parsing ---
  const handleAskAi = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput; setChatInput(""); setChatHistory(prev => [...prev, { role: "user", content: userMsg }]); setIsAiThinking(true);

    try {
      const workspaceContext = await getWorkspaceContext();
      const apiKey = selectedModel.provider === "openai" ? settings.openAiKey : settings.geminiKey;
      
      const systemPrompt = `You are a God-Tier Autonomous IDE Agent and Expert Senior UI/UX Developer. You have full memory of previous chats.
      DO NOT use markdown format (***) in your standard text explanations. Keep your chatting brief.
      
      CRITICAL DESIGN & CODING RULES:
      1. ABSOLUTELY NO BASIC DESIGNS. You must produce breathtaking, modern, premium tech-startup level UI.
      2. RESPONSIVENESS IS MANDATORY. You MUST heavily utilize TailwindCSS via CDN (<script src="https://cdn.tailwindcss.com"></script>), along with FontAwesome and modern typography.
      
      To WRITE files, use exactly this format (do not use XML):
      ### FILE: path/filename.ext
      \`\`\`html
      // Code goes here
      \`\`\`
      
      To DELETE files:
      ### DELETE: path/filename.ext
      
      To RUN TERMINAL COMMANDS:
      ### CMD: npm install axios`;

      // Construct memory array
      const messageHistory = [
        { role: "system", content: systemPrompt },
        ...chatHistory.filter(m => m.role === "user" || m.role === "ai").map(m => ({
          role: m.role === "ai" ? "assistant" : "user",
          content: m.content
        })),
        { role: "user", content: `WORKSPACE CONTEXT:\n${workspaceContext}\n\nACTIVE FILE: ${activeFile?.name || "None"}\n${code}\n\nNEW REQUEST: ${userMsg}` }
      ];

      const result = await generateAIResponse(selectedModel.provider, selectedModel.id, messageHistory, apiKey);
      let displayMessage = result; let actionCount = 0;

      // 1. Commands
      const cmdRegex = /###\s*CMD:\s*([^\n]+)/g; let cmdMatch;
      while ((cmdMatch = cmdRegex.exec(result)) !== null) { handleTerminalCommand(cmdMatch[1].trim()); displayMessage = displayMessage.replace(cmdMatch[0], ""); actionCount++; }

      // 2. Deletes
      const deleteRegex = /###\s*DELETE:\s*([^\n]+)/g; let delMatch;
      while ((delMatch = deleteRegex.exec(result)) !== null) { await deleteProjectFile(`${currentDir}/${delMatch[1].trim()}`, false).catch(()=>null); displayMessage = displayMessage.replace(delMatch[0], ""); actionCount++; }

      // 3. Explicit Files (### FILE: filename \n ```language \n code ```)
      const writeRegex = /###\s*FILE:\s*([^\n]+)\n```[a-zA-Z]*\n([\s\S]*?)```/gi; let writeMatch;
      while ((writeMatch = writeRegex.exec(result)) !== null) {
        const filePath = writeMatch[1].trim(); const fileContent = writeMatch[2].trim();
        const parts = filePath.split("/");
        if (parts.length > 1) { await createProjectFolder(`${currentDir}/${parts.slice(0, -1).join("/")}`); }
        await saveFileContent(`${currentDir}/${filePath}`, fileContent);
        if (activeFile && filePath.endsWith(activeFile.name)) setCode(fileContent);
        displayMessage = displayMessage.replace(writeMatch[0], `[Successfully saved ${filePath}]`); actionCount++;
      }

      // 4. Fallback Markdown Extractor (If the AI forgets ### FILE:)
      const fallbackRegex = /```([a-zA-Z]*)\n([\s\S]*?)```/gi; let fallbackMatch;
      while ((fallbackMatch = fallbackRegex.exec(displayMessage)) !== null) {
        const lang = fallbackMatch[1].toLowerCase();
        const extMap: Record<string, string> = { javascript: "js", html: "html", css: "css", python: "py", typescript: "ts", rust: "rs", json: "json" };
        const ext = extMap[lang] || "txt";
        const fallbackName = `generated_${Date.now()}.${ext}`;
        await saveFileContent(`${currentDir}/${fallbackName}`, fallbackMatch[2].trim());
        displayMessage = displayMessage.replace(fallbackMatch[0], `[Successfully saved raw block to ${fallbackName}]`); actionCount++;
      }

      displayMessage = displayMessage.trim();
      if (displayMessage.length === 0 && actionCount > 0) displayMessage = `Executed ${actionCount} tasks perfectly based on my memory.`;

      setChatHistory(prev => [...prev, { role: "ai", content: displayMessage }]);
      if (actionCount > 0) { readProjectFiles(currentDir).then(setFiles); addToast(`AI executed ${actionCount} tasks!`, "success"); }

    } catch (err: any) { setChatHistory(prev => [...prev, { role: "error", content: err.message }]); addToast("AI Failed", "error"); } finally { setIsAiThinking(false); }
  };

  const scheduleTask = async (name: string, script: string, scheduleType: string, scheduleValue: string) => {
    try { const res = await scheduleBackgroundTask(name, script, currentDir, scheduleType, scheduleValue); addToast(res, "success"); setShowTaskModal(false); } 
    catch (e: any) { addToast(`Failed to schedule: ${e}`, "error"); }
  };

  const startLiveServer = async () => { try { await spawnLiveServer(currentDir, 3000); await openInBrowser("http://localhost:3000"); addToast("Live Server Started", "success"); } catch (e) { addToast("Failed to start server", "error"); } };
  
  const stopLiveServer = async () => {
    try { const res = await killAllBackgroundProcesses(); addToast(res, "success"); } 
    catch (e) { addToast("Failed to kill processes.", "error"); }
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

  const generateLegalFiles = async () => {
    const license = `MIT License\n\nCopyright (c) ${new Date().getFullYear()}\n\nPermission is hereby granted, free of charge...`;
    const privacy = `# Privacy Policy\n\nThis application respects your privacy and does not collect telemetry data.`;
    await saveFileContent(`${currentDir}/LICENSE`, license);
    await saveFileContent(`${currentDir}/PRIVACY.md`, privacy);
    readProjectFiles(currentDir).then(setFiles);
    addToast("Legal files generated!", "success");
    setShowLicenseModal(false);
  };

  return {
    isBooting, currentDir, setCurrentDir, files, activeFile, code, setCode,
    activeTab, setActiveTab, activeSidebar, setActiveSidebar, terminalOutput, setTerminalOutput, handleTerminalCommand, runCode, startLiveServer, stopLiveServer,
    showSettings, setShowSettings, showTaskModal, setShowTaskModal, showLicenseModal, setShowLicenseModal, scheduleTask, settings, setSettings, toggleView, toasts, addToast, refreshModels, generateLegalFiles,
    chatInput, setChatInput, chatHistory, isAiThinking, availableModels, selectedModel, setSelectedModel,
    handleFileClick, handleSaveFile, handleNewFile, handleNewFolder, handleAskAi, handleOpenFolder, handleDelete
  };
};