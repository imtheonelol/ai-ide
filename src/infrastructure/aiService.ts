import { invoke } from "@tauri-apps/api/core";
import { AIModel } from "../domain/types";

// FIXED: Passing an array of messages to enable full conversation memory
export const generateAIResponse = async (provider: string, model: string, messages: any[], apiKey: string): Promise<string> => {
  try { return await invoke<string>("generate_ai_proxy", { provider, model, messages, apiKey }); } 
  catch (error) { throw new Error(String(error)); }
};

export const getLocalModels = async (): Promise<AIModel[]> => {
  try {
    const res = await invoke<string>("get_local_models");
    const json = JSON.parse(res);
    return json.models.map((m: any) => ({ id: m.name, name: m.name, provider: "ollama" }));
  } catch (e) { return []; }
};

export const pullNewModel = async (modelName: string): Promise<string> => {
  return await invoke<string>("pull_model", { model: modelName });
};