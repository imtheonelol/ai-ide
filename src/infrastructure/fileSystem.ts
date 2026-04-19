import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener"; // FIXED: Correct Tauri v2 export
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

export const deleteProjectFile = async (path: string, is_dir: boolean): Promise<void> => {
  await invoke("delete_path", { path, is_dir });
};

export const openNativeFolderPicker = async (): Promise<string | null> => {
  const selected = await open({ directory: true, multiple: false });
  return selected as string | null;
};

export const runTerminalCommand = async (cmd: string, args: string[], dir: string): Promise<string> => {
  try { return await invoke("run_command", { cmd, args, dir }); } catch (e) { return String(e); }
};

export const spawnLiveServer = async (dir: string, port: number): Promise<string> => {
  return await invoke("spawn_server", { dir, port });
};

export const openInBrowser = async (url: string): Promise<void> => {
  await openUrl(url); // FIXED: Calling the correct function
};