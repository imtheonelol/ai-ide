import { useState, useEffect } from "react";
import { FileEntry, ChatMessage, AIModel, AppSettings, CLOUD_MODELS, Toast } from "../domain/types";
import { readProjectFiles, readFileContent, saveFileContent, createProjectFolder, deleteProjectFile, openNativeFolderPicker, runTerminalCommand, spawnLiveServer, openInBrowser } from "../infrastructure/fileSystem";
import { generateAIResponse, getLocalModels } from "../infrastructure/aiService";

export const useIdeLogic = () => {
  // --- NEW: Persistent Database Memory ---
  const [currentDir, setCurrentDir] = useState(() => localStorage.getItem("ide_workspace") || "./");
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("ide_settings");
    return saved ? JSON.parse(saved) : { theme: "dark", useWsl: false, openAiKey: "", geminiKey: "" };
  });

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [code, setCode] = useState("// Welcome. Select a file.");
  
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [terminalOutput, setTerminalOutput] = useState("Console ready...\n");
  const [showSettings, setShowSettings] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [availableModels, setAvailableModels] = useState<AIModel[]>(CLOUD_MODELS);
  const [selectedModel, setSelectedModel] = useState<AIModel>(CLOUD_MODELS[0]);
  const [chatInput, setChatInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{ role: "system", content: "⚡ Autonomous AI Agent Online. I can now directly alter and delete your files." }]);

  const addToast = (msg: string, type: "info" | "success" | "error" = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message: msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Save workspace & settings automatically when they change
  useEffect(() => { 
    localStorage.setItem("ide_workspace", currentDir);
    readProjectFiles(currentDir).then(setFiles); 
  }, [currentDir]);

  useEffect(() => { localStorage.setItem("ide_settings", JSON.stringify(settings)); }, [settings]);

  // --- NEW: Seamless Model Refresh ---
  const refreshModels = async () => {
    const models = await getLocalModels();
    setAvailableModels([...models, ...CLOUD_MODELS]);
    // Automatically select the first local model if it exists
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

  // --- UPGRADED: Autonomous Agent Action Parser ---
  const handleAskAi = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput(""); setChatHistory(prev => [...prev, { role: "user", content: userMsg }]); setIsAiThinking(true);

    try {
      const workspaceContext = await getWorkspaceContext();
      const apiKey = selectedModel.provider === "openai" ? settings.openAiKey : settings.geminiKey;
      
      // Strict Instructions to act as an Agent, not a Chatbot
      const systemPrompt = `You are an Autonomous IDE Agent. You have full control over the user's files.
      NEVER use markdown asterisks (**) in your chat responses. Keep your chat text plain, brief, and professional.
      
      To CREATE or OVERWRITE a file, you MUST output this exact block:
      @@@FILE-WRITE: path/to/filename.ext
      [file content here without markdown code blocks]
      @@@END-FILE
      
      To DELETE a file, output this exact line:
      @@@FILE-DELETE: path/to/filename.ext
      
      You can output multiple actions at once. Act intelligently to fix the user's codebase.`;

      const result = await generateAIResponse(
        selectedModel.provider, selectedModel.id, 
        `WORKSPACE CONTEXT:\n${workspaceContext}\n\nACTIVE FILE: ${activeFile?.name}\n${code}\n\nUSER REQUEST: ${userMsg}`, 
        systemPrompt, apiKey
      );
      
      let displayMessage = result;
      let actionCount = 0;

      // 1. Parse Deletions
      const deleteRegex = /@@@FILE-DELETE:\s*([^\n]+)/g;
      let delMatch;
      while ((delMatch = deleteRegex.exec(result)) !== null) {
        await deleteProjectFile(`${currentDir}/${delMatch[1].trim()}`, false).catch(()=>null);
        displayMessage = displayMessage.replace(delMatch[0], "");
        actionCount++;
      }

      // 2. Parse Writes/Creations
      const writeRegex = /@@@FILE-WRITE:\s*([^\n]+)\n([\s\S]*?)@@@END-FILE/g;
      let writeMatch;
      while ((writeMatch = writeRegex.exec(result)) !== null) {
        const filePath = writeMatch[1].trim();
        const fileContent = writeMatch[2].trim();
        
        // Auto-create directories if the AI specifies a deep path
        const parts = filePath.split("/");
        if (parts.length > 1) {
          const dirPath = parts.slice(0, -1).join("/");
          await createProjectFolder(`${currentDir}/${dirPath}`);
        }

        await saveFileContent(`${currentDir}/${filePath}`, fileContent);
        
        // If the AI overwrote the file you are currently looking at, update the editor!
        if (activeFile && filePath.endsWith(activeFile.name)) setCode(fileContent);

        displayMessage = displayMessage.replace(writeMatch[0], "");
        actionCount++;
      }

      // 3. Strip annoying Markdown (**) from the remaining message
      displayMessage = displayMessage.replace(/\*\*/g, "").trim();
      
      if (displayMessage.length === 0 && actionCount > 0) displayMessage = `Done! I executed ${actionCount} file actions.`;

      setChatHistory(prev => [...prev, { role: "ai", content: displayMessage }]);
      if (actionCount > 0) { readProjectFiles(currentDir).then(setFiles); addToast(`AI executed ${actionCount} tasks!`, "success"); }

    } catch (err: any) { 
      setChatHistory(prev => [...prev, { role: "error", content: err.message }]);
      addToast("AI Connection Failed", "error");
    } finally { setIsAiThinking(false); }
  };

  // ... (Keep startLiveServer, runCode, handleGitCommand from previous)
  const handleGitCommand = async (action: string) => { /* omitted for brevity, keep previous */ };
  const startLiveServer = async () => { /* omitted for brevity, keep previous */ };
  const runCode = async () => { /* omitted for brevity, keep previous */ };

  return {
    currentDir, setCurrentDir, files, activeFile, code, setCode,
    activeTab, setActiveTab, terminalOutput, setTerminalOutput, runCode, startLiveServer,
    showSettings, setShowSettings, settings, setSettings, toasts, addToast, refreshModels, // Exported refreshModels!
    chatInput, setChatInput, chatHistory, isAiThinking, availableModels, selectedModel, setSelectedModel,
    handleFileClick, handleSaveFile, handleNewFile, handleAskAi, handleOpenFolder, handleDelete, handleGitCommand
  };
};