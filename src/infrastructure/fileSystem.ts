import { invoke } from "@tauri-apps/api/core";

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileEntry[];
}

export const readProjectFiles = async (path: string): Promise<FileEntry[]> => {
  // We will call a Rust command we are about to write
  return await invoke("list_files", { path });
};

export const readFileContent = async (path: string): Promise<string> => {
  return await invoke("read_file", { path });
};