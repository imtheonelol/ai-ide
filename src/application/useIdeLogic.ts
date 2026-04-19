import { useState, useEffect } from "react";
import { FileEntry, ChatMessage, SUPPORTED_MODELS } from "../domain/types";
import { readProjectFiles, readFileContent, saveFileContent } from "../infrastructure/fileSystem";
import { generateAIResponse } from "../infrastructure/aiService";

export const useIdeLogic = () => {
  // File System State
  const [currentDir, setCurrentDir] = useState("./src");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [code, setCode] = useState("// Welcome to your Godly Web IDE.\n// Select a file to start.");

  // AI & Chat State
  const [selectedModel, setSelectedModel] = useState(SUPPORTED_MODELS[0].id);
  const [chatInput, setChatInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { role: "ai", content: "⚡ Bolt Local is online. What web app are we building today?" }
  ]);

  // Load files automatically
  useEffect(() => {
    readProjectFiles(currentDir).then(setFiles);
  }, [currentDir]);

  const handleFileClick = async (file: FileEntry) => {
    if (file.is_dir) {
      setCurrentDir(file.path);
    } else {
      const content = await readFileContent(file.path);
      setActiveFile(file);
      setCode(content);
    }
  };

  const handleSaveFile = async () => {
    if (activeFile) {
      await saveFileContent(activeFile.path, code);
    }
  };

  const handleNewFile = async () => {
    const fileName = prompt("Enter new file name (e.g., index.html, App.tsx):");
    if (fileName) {
      const newPath = `${currentDir}/${fileName}`;
      await saveFileContent(newPath, "// New file\n");
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
        "You are an expert Web Developer AI. Write clean code. Wrap modifications in standard markdown code blocks."
      );

      setChatHistory(prev => [...prev, { role: "ai", content: result }]);
      
      // Auto-apply code if the AI generated a code block
      const match = result.match(/```[a-z]*\n([\s\S]*?)```/);
      if (match && match[1]) {
        setCode(match[1].trim());
        setChatHistory(prev => [...prev, { role: "ai", content: "✨ I've applied the updated code to your editor." }]);
      }
    } catch (err: any) {
      setChatHistory(prev => [...prev, { role: "error", content: err.message }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  return {
    currentDir, setCurrentDir, files, activeFile, code, setCode,
    chatInput, setChatInput, chatHistory, isAiThinking, selectedModel, setSelectedModel,
    handleFileClick, handleSaveFile, handleNewFile, handleAskAi
  };
};