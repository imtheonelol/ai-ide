export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface ChatMessage {
  role: "user" | "ai" | "error";
  content: string;
}

export interface AIModel {
  id: string;
  name: string;
}

// Our supported models for web development
export const SUPPORTED_MODELS: AIModel[] = [
  { id: "qwen2.5-coder:1.5b", name: "Qwen 1.5B (Fast/Low RAM)" },
  { id: "qwen2.5-coder:7b", name: "Qwen 7B (Smart/Mid RAM)" },
  { id: "deepseek-coder:6.7b", name: "DeepSeek 6.7B (Godly/High RAM)" }
];