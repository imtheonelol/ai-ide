import { invoke } from "@tauri-apps/api/core";
import { FileEntry } from "../domain/types";

export const readProjectFiles = async (path: string): Promise<FileEntry[]> => {
  try { return await invoke("list_files", { path }); } catch (e) { return []; }
};
export const readFileContent = async (path: string): Promise<string> => {
  try { return await invoke("read_file", { path }); } catch (e) { return ""; }
};
export const saveFileContent = async (path: string, contents: string): Promise<void> => {
  await invoke("write_file", { path, contents });
};
export const createProjectFolder = async (path: string): Promise<void> => {
  await invoke("create_folder", { path });
};
export const runTerminalCommand = async (cmd: string, args: string[], dir: string): Promise<string> => {
  try { return await invoke("run_command", { cmd, args, dir }); } catch (e) { return String(e); }
};