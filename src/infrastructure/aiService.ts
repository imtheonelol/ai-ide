import { invoke } from "@tauri-apps/api/core";
import { AIModel } from "../domain/types";

export const generateAIResponse = async (model: string, prompt: string, system: string): Promise<string> => {
  try { return await invoke<string>("generate_ai_proxy", { model, prompt, system }); } 
  catch (error) { throw new Error(String(error)); }
};

export const getLocalModels = async (): Promise<AIModel[]> => {
  try {
    const res = await invoke<string>("get_local_models");
    const json = JSON.parse(res);
    return json.models.map((m: any) => ({ id: m.name, name: m.name }));
  } catch (e) { return []; }
};

export const pullNewModel = async (modelName: string): Promise<string> => {
  return await invoke<string>("pull_model", { model: modelName });
};