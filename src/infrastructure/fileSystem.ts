import { invoke } from "@tauri-apps/api/core";
import { FileEntry } from "../domain/types";

export const readProjectFiles = async (path: string): Promise<FileEntry[]> => {
  try { return await invoke("list_files", { path }); } 
  catch (e) { console.error(e); return []; }
};

export const readFileContent = async (path: string): Promise<string> => {
  try { return await invoke("read_file", { path }); } 
  catch (e) { return "// Failed to load file."; }
};

export const saveFileContent = async (path: string, contents: string): Promise<void> => {
  await invoke("write_file", { path, contents });
};