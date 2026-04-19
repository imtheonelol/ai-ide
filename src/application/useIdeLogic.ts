import { useState, useEffect } from "react";
import { FileEntry, ChatMessage, SUPPORTED_MODELS } from "../domain/types";
import { readProjectFiles, readFileContent, saveFileContent, createProjectFolder } from "../infrastructure/fileSystem";
import { generateAIResponse } from "../infrastructure/aiService";

export const useIdeLogic = () => {
  const [currentDir, setCurrentDir] = useState("./");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [code, setCode] = useState("// Welcome to your Godly IDE.\n// Select a file to start.");

  const [selectedModel, setSelectedModel] = useState(SUPPORTED_MODELS[0].id);
  const [chatInput, setChatInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { role: "ai", content: "⚡ Bolt IDE is online. Ollama should be running in the background automatically." }
  ]);

  useEffect(() => {
    readProjectFiles(currentDir).then(setFiles);
  }, [currentDir]);

  const handleFileClick = async (file: FileEntry) => {
    if (!file.is_dir) {
      const content = await readFileContent(file.path);
      setActiveFile(file);
      setCode(content);
    }
  };

  const handleSaveFile = async () => {
    if (activeFile) {
      await saveFileContent(activeFile.path, code);
      // We DO NOT reload the file here, which preserves Ctrl+Z and cursor position!
    }
  };

  const handleNewFile = async (targetDir: string = currentDir) => {
    const fileName = prompt("Enter new file name (e.g., style.css):");
    if (fileName) {
      await saveFileContent(`${targetDir}/${fileName}`, "");
      readProjectFiles(currentDir).then(setFiles);
    }
  };

  const handleNewFolder = async (targetDir: string = currentDir) => {
    const folderName = prompt("Enter new folder name:");
    if (folderName) {
      await createProjectFolder(`${targetDir}/${folderName}`);
      readProjectFiles(currentDir).then(setFiles);
    }
  };

  const handleAskAi = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput("");
    setChatHistory(prev => [...prev, { role: "user", content: userMsg }]);
    setIsAiThinking(true);

    try {
      const result = await generateAIResponse(
        selectedModel,
        `File: ${activeFile?.name || 'None'}\nCode:\n\`\`\`\n${code}\n\`\`\`\nRequest: ${userMsg}`,
        "You are an expert developer AI. Provide clean code. Wrap modifications in markdown code blocks."
      );
      setChatHistory(prev => [...prev, { role: "ai", content: result }]);
      
      const match = result.match(/```[a-z]*\n([\s\S]*?)```/);
      if (match && match[1]) {
        setCode(match[1].trim());
        setChatHistory(prev => [...prev, { role: "ai", content: "✨ Code applied to editor." }]);
      }
    } catch (err: any) {
      // This will display the exact 404 message from Rust
      setChatHistory(prev => [...prev, { role: "error", content: err.message }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  return {
    currentDir, setCurrentDir, files, activeFile, code, setCode,
    chatInput, setChatInput, chatHistory, isAiThinking, selectedModel, setSelectedModel,
    handleFileClick, handleSaveFile, handleNewFile, handleNewFolder, handleAskAi
  };
};