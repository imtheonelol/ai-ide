import { useState, useEffect } from "react";
import { FileEntry, ChatMessage, AIModel, AppSettings } from "../domain/types";
import { readProjectFiles, readFileContent, saveFileContent, createProjectFolder, deleteProjectFile, openNativeFolderPicker, runTerminalCommand } from "../infrastructure/fileSystem";
import { generateAIResponse, getLocalModels } from "../infrastructure/aiService";

export const useIdeLogic = () => {
  const [currentDir, setCurrentDir] = useState("./");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [code, setCode] = useState("// Welcome. Select a file.");
  
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [terminalOutput, setTerminalOutput] = useState("Console ready...\n");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ autoSaveAI: true, theme: "dark" });

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
      setCurrentDir(newPath);
      setActiveFile(null);
      setCode("// Opened new workspace.");
      setTerminalOutput(`Workspace switched to: ${newPath}\n`);
    }
  };

  const handleFileClick = async (file: FileEntry) => {
    if (!file.is_dir) {
      const content = await readFileContent(file.path);
      setActiveFile(file);
      setCode(content);
      setActiveTab("editor");
    }
  };

  const handleDelete = async (file: FileEntry) => {
    if (confirm(`Are you sure you want to delete ${file.name}?`)) {
      await deleteProjectFile(file.path, file.is_dir);
      if (activeFile?.path === file.path) { setActiveFile(null); setCode(""); }
      readProjectFiles(currentDir).then(setFiles);
    }
  };

  const handleSaveFile = async () => { if (activeFile) await saveFileContent(activeFile.path, code); };

  const handleNewFile = async (targetDir: string = currentDir) => {
    const fileName = prompt("File name:");
    if (fileName) {
      await saveFileContent(`${targetDir}/${fileName}`, "");
      readProjectFiles(currentDir).then(setFiles);
    }
  };

  const runCode = async () => {
    if (!activeFile) return;
    setTerminalOutput(`Running ${activeFile.name}...\n`);
    
    let cmd = "";
    if (activeFile.name.endsWith(".js")) cmd = "node";
    else if (activeFile.name.endsWith(".py")) cmd = "python"; // Use python3 if on mac/linux
    else if (activeFile.name.endsWith(".php")) cmd = "php";
    else {
      setTerminalOutput(prev => prev + "❌ Unsupported execution format. Supported: .js, .py, .php. Use 'Go Live' for HTML.\n");
      return;
    }

    const out = await runTerminalCommand(cmd, [activeFile.path], currentDir);
    setTerminalOutput(prev => prev + out);
  };

  const handleAskAi = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput("");
    setChatHistory(prev => [...prev, { role: "user", content: userMsg }]);
    setIsAiThinking(true);

    try {
      const result = await generateAIResponse(selectedModel, `File: ${activeFile?.name || 'None'}\nCode:\n\`\`\`\n${code}\n\`\`\`\nRequest: ${userMsg}`, "Provide code wrapped in markdown blocks.");
      setChatHistory(prev => [...prev, { role: "ai", content: result }]);
      
      const match = result.match(/```[a-z]*\n([\s\S]*?)```/);
      if (match && match[1]) {
        const newCode = match[1].trim();
        setCode(newCode);
        if (settings.autoSaveAI) {
          await createProjectFolder(`${currentDir}/ai_generated`);
          const aiFileName = `ai_${Date.now()}.js`;
          await saveFileContent(`${currentDir}/ai_generated/${aiFileName}`, newCode);
          readProjectFiles(currentDir).then(setFiles);
        }
      }
    } catch (err: any) {
      setChatHistory(prev => [...prev, { role: "error", content: err.message }]);
    } finally { setIsAiThinking(false); }
  };

  return {
    currentDir, setCurrentDir, files, activeFile, code, setCode,
    activeTab, setActiveTab, terminalOutput, setTerminalOutput, runCode,
    showSettings, setShowSettings, settings, setSettings,
    chatInput, setChatInput, chatHistory, isAiThinking, availableModels, selectedModel, setSelectedModel,
    handleFileClick, handleSaveFile, handleNewFile, handleAskAi, handleOpenFolder, handleDelete
  };
};