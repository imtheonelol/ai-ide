import { invoke } from "@tauri-apps/api/core";

export const generateAIResponse = async (model: string, prompt: string, system: string): Promise<string> => {
  try {
    return await invoke<string>("generate_ai_proxy", { model, prompt, system });
  } catch (error) {
    throw new Error(String(error));
  }
};