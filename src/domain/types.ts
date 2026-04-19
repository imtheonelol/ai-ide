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

// These IDs now exactly match the models installed on your laptop!
export const SUPPORTED_MODELS: AIModel[] = [
  { id: "qwen2.5:1.5b", name: "Qwen 2.5 (1.5B) - Fast / Low RAM" },
  { id: "qwen2.5:7b", name: "Qwen 2.5 (7B) - Smart / Mid RAM" },
  { id: "deepseek-coder:6.7b", name: "DeepSeek (6.7B) - (Requires Download)" }
];