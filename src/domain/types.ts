export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface ChatMessage {
  role: "user" | "ai" | "error" | "system";
  content: string;
}

export interface AIModel {
  id: string;
  name: string;
}

export interface AppSettings {
  autoSaveAI: boolean;
  theme: "dark" | "light";
}