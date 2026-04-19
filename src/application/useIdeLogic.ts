import { useState, useEffect } from "react";
import { FileEntry, ChatMessage, AIModel, AppSettings, CLOUD_MODELS, Toast } from "../domain/types";
import { readProjectFiles, readFileContent, saveFileContent, createProjectFolder, deleteProjectFile, openNativeFolderPicker, runTerminalCommand, spawnLiveServer, openInBrowser } from "../infrastructure/fileSystem";
import { generateAIResponse, getLocalModels } from "../infrastructure/aiService";

export const useIdeLogic = () => {
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
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{ role: "system", content: "⚡ Autonomous AI Agent Online. I can execute cross-file modifications." }]);

  const addToast = (msg: string, type: "info" | "success" | "error" = "info") => {
    const id = Date.now(); setToasts(prev => [...prev, { id, message: msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  useEffect(() => { localStorage.setItem("ide_workspace", currentDir); readProjectFiles(currentDir).then(setFiles); }, [currentDir]);
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

  // --- HIGHLY OPTIMIZED AGENT PARSER ---
  const handleAskAi = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput(""); setChatHistory(prev => [...prev, { role: "user", content: userMsg }]); setIsAiThinking(true);

    try {
      const workspaceContext = await getWorkspaceContext();
      const apiKey = selectedModel.provider === "openai" ? settings.openAiKey : settings.geminiKey;
      
      const systemPrompt = `You are a highly efficient Autonomous IDE Agent. Execute code changes directly.
      Rules:
      1. NEVER use markdown formatting like **bold** in your responses. Keep chat text plain.
      2. Minimize resource usage. Output ONLY the necessary changes. Do not YAP or over-explain.
      3. To create or overwrite a file, use EXACTLY this XML format:
         <file name="path/to/file.js">
         [CODE HERE]
         </file>
      4. To delete a file, use EXACTLY:
         <delete name="path/to/file.js"/>
      `;

      const result = await generateAIResponse(
        selectedModel.provider, selectedModel.id, 
        `WORKSPACE:\n${workspaceContext}\n\nACTIVE FILE: ${activeFile?.name}\n${code}\n\nREQUEST: ${userMsg}`, 
        systemPrompt, apiKey
      );
      
      let displayMessage = result;
      let actionCount = 0;

      // Parse Deletes
      const deleteRegex = /<delete name="([^"]+)"\s*\/>/gi;
      let delMatch;
      while ((delMatch = deleteRegex.exec(result)) !== null) {
        await deleteProjectFile(`${currentDir}/${delMatch[1].trim()}`, false).catch(()=>null);
        displayMessage = displayMessage.replace(delMatch[0], "");
        actionCount++;
      }

      // Parse Writes (XML Format)
      const writeRegex = /<file name="([^"]+)">([\s\S]*?)<\/file>/gi;
      let writeMatch;
      while ((writeMatch = writeRegex.exec(result)) !== null) {
        const filePath = writeMatch[1].trim();
        let fileContent = writeMatch[2].trim();
        
        // Strip nested markdown if the AI accidentally adds it inside the XML
        fileContent = fileContent.replace(/^```[a-zA-Z]*\n/, "").replace(/```$/, "").trim();

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

      displayMessage = displayMessage.replace(/\*\*/g, "").trim();
      if (displayMessage.length === 0 && actionCount > 0) displayMessage = `Executed ${actionCount} file operations successfully.`;

      setChatHistory(prev => [...prev, { role: "ai", content: displayMessage }]);
      if (actionCount > 0) { readProjectFiles(currentDir).then(setFiles); addToast(`AI executed ${actionCount} tasks!`, "success"); }

    } catch (err: any) { 
      setChatHistory(prev => [...prev, { role: "error", content: err.message }]);
      addToast("AI Connection Failed", "error");
    } finally { setIsAiThinking(false); }
  };

  const handleGitCommand = async (action: string) => { /* keeping git simple */ };
  
  const startLiveServer = async () => {
    setTerminalOutput(prev => prev + "\n> Starting localhost on port 3000...\n");
    try {
      await spawnLiveServer(currentDir, 3000);
      await openInBrowser("http://localhost:3000");
      addToast("Live Server Started", "success");
    } catch (e: any) {
      setTerminalOutput(prev => prev + `Error: ${e}\n`);
      addToast("Failed to start server", "error");
    }
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
    showSettings, setShowSettings, settings, setSettings, toasts, addToast, refreshModels,
    chatInput, setChatInput, chatHistory, isAiThinking, availableModels, selectedModel, setSelectedModel,
    handleFileClick, handleSaveFile, handleNewFile, handleAskAi, handleOpenFolder, handleDelete, handleGitCommand
  };
};