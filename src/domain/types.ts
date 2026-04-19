export interface FileEntry { name: string; path: string; is_dir: boolean; }
export interface ChatMessage { role: "user" | "ai" | "error" | "system"; content: string; }

export interface AIModel {
  id: string;
  name: string;
  provider: "ollama" | "openai" | "gemini";
}

export interface AppSettings {
  theme: "dark" | "light";
  useWsl: boolean;
  openAiKey: string;
  geminiKey: string;
}

export interface Toast {
  id: number;
  message: string;
  type: "info" | "success" | "error";
}

export const CLOUD_MODELS: AIModel[] = [
  { id: "gpt-4o", name: "GPT-4o (OpenAI)", provider: "openai" },
  { id: "gemini-1.5-pro-latest", name: "Gemini 1.5 Pro (Google)", provider: "gemini" }
];