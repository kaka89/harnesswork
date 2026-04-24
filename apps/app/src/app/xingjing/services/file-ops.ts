/**
 * 星静文件操作薄代理层
 *
 * 原 opencode-client.ts 中文件操作部分的精简替代。
 * 所有文件 I/O 委托给 XingjingBridge，不包含任何 Client 管理或降级逻辑。
 *
 * 保留能力：
 * - fileRead / fileWrite / fileList / fileDelete — 薄代理
 * - expandTildePath — 路径展开工具
 * - setWorkingDirectory — 产品切换时更新工作目录
 * - FileNode / FileContent — 类型定义
 */

import {
  fileRead as bridgeFileRead,
  fileWrite as bridgeFileWrite,
  fileList as bridgeFileList,
  getWorkspaceId,
} from './xingjing-bridge';
import { isTauriRuntime } from '../../utils';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface FileNode {
  name: string;
  path: string;
  absolute: string;
  type: 'file' | 'directory';
  ignored: boolean;
}

export interface FileContent {
  type: 'text';
  content: string;
}

// ─── 工作目录管理 ────────────────────────────────────────────────────────────

let _directory = '';

/**
 * 设置当前工作目录（产品切换时调用）。
 */
export function setWorkingDirectory(directory: string): void {
  _directory = directory;
}

/**
 * 获取当前工作目录
 */
export function getWorkingDirectory(): string {
  return _directory;
}

// ─── 路径工具 ─────────────────────────────────────────────────────────────────

/** 缓存的用户主目录路径（Tauri 环境下惰性加载） */
let _cachedHomeDir: string | null = null;

/**
 * 展开路径中的 ~ 符号为实际用户主目录。
 * Tauri 的 @tauri-apps/plugin-fs 不支持 ~ 自动展开，
 * 若直接传入会在当前工作目录下创建名为 "~" 的字面量目录。
 */
export async function expandTildePath(p: string): Promise<string> {
  if (!p.startsWith('~')) return p;
  if (!_cachedHomeDir) {
    try {
      const { homeDir } = await import('@tauri-apps/api/path');
      _cachedHomeDir = (await homeDir()).replace(/\/+$/, '');
    } catch {
      return p;
    }
  }
  return p === '~' ? _cachedHomeDir : `${_cachedHomeDir}${p.slice(1)}`;
}

// ─── Dev Server 文件操作（浏览器开发环境兜底）─────────────────────────────────

async function devServerFileRead(path: string, directory?: string): Promise<string | null> {
  if (!import.meta.env.DEV) return null;
  try {
    const fullPath = (path.startsWith('/') || !directory) ? path : `${directory}/${path}`;
    const resp = await fetch('/__xingjing_fs/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath }),
    });
    const data = await resp.json();
    return data.content ?? null;
  } catch {
    return null;
  }
}

async function devServerFileWrite(path: string, content: string, directory?: string): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try {
    const fullPath = (path.startsWith('/') || !directory) ? path : `${directory}/${path}`;
    const resp = await fetch('/__xingjing_fs/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath, content }),
    });
    const data = await resp.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

async function devServerFileList(path: string, directory?: string): Promise<FileNode[] | null> {
  if (!import.meta.env.DEV) return null;
  try {
    const fullPath = (path.startsWith('/') || !directory) ? path : `${directory.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const resp = await fetch('/__xingjing_fs/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath }),
    });
    const data = await resp.json();
    const entries: Array<{ name: string; path: string; type: string }> = data.entries ?? [];
    return entries.map(entry => ({
      name: entry.name,
      path: `${path.replace(/\/$/, '')}/${entry.name}`,
      absolute: entry.path,
      type: (entry.type === 'directory' ? 'directory' : 'file') as 'file' | 'directory',
      ignored: entry.name.startsWith('.'),
    }));
  } catch {
    return null;
  }
}

async function devServerFileDelete(path: string, directory?: string): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try {
    const fullPath = (path.startsWith('/') || !directory) ? path : `${directory}/${path}`;
    const resp = await fetch('/__xingjing_fs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath }),
    });
    const data = await resp.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

// ─── Tauri 原生文件操作（~ 路径兜底）──────────────────────────────────────────

async function tauriNativeFileRead(path: string, directory?: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const raw = (path.startsWith('/') || !directory) ? path : `${directory}/${path}`;
    const fullPath = await expandTildePath(raw);
    const content = await readTextFile(fullPath);
    return content || null;
  } catch {
    return null;
  }
}

async function tauriNativeFileWrite(path: string, content: string, directory?: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const raw = (path.startsWith('/') || !directory) ? path : `${directory}/${path}`;
    const fullPath = await expandTildePath(raw);
    const lastSlash = fullPath.lastIndexOf('/');
    if (lastSlash > 0) {
      await mkdir(fullPath.slice(0, lastSlash), { recursive: true }).catch(() => {});
    }
    await writeTextFile(fullPath, content);
    return true;
  } catch {
    return false;
  }
}

async function tauriNativeFileList(path: string, directory?: string): Promise<FileNode[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { readDir } = await import('@tauri-apps/plugin-fs');
    const raw = (path.startsWith('/') || !directory) ? path : `${directory}/${path}`;
    const fullPath = await expandTildePath(raw);
    const entries = await readDir(fullPath);
    return entries
      .filter(e => e.name != null)
      .map(entry => ({
        name: entry.name!,
        path: `${path.replace(/\/$/, '')}/${entry.name}`,
        absolute: `${fullPath.replace(/\/$/, '')}/${entry.name}`,
        type: (entry.isDirectory ? 'directory' : 'file') as 'file' | 'directory',
        ignored: entry.name!.startsWith('.'),
      }));
  } catch {
    return null;
  }
}

async function tauriNativeFileDelete(path: string, directory?: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    const { remove } = await import('@tauri-apps/plugin-fs');
    const raw = (path.startsWith('/') || !directory) ? path : `${directory}/${path}`;
    const fullPath = await expandTildePath(raw);
    await remove(fullPath);
    return true;
  } catch {
    return false;
  }
}

// ─── Bridge 路径归一化 ─────────────────────────────────────────────────────────

/**
 * 将绝对路径转换为 Bridge 可用的工作区相对路径。
 *
 * 问题：调用方常用 `${workDir}/${relPath}` 构造绝对路径，但 OpenWork Server
 * 的 writeWorkspaceFile / readWorkspaceFile API 会在服务端再次将 path 拼接到
 * workspace.path 下，导致路径嵌套：
 *   /Users/x/solo007/Users/x/solo007/.xingjing/memory/sidecar.json
 *
 * 此函数在传递给 Bridge 之前剥离 _directory（workDir）前缀，保证发送给
 * 服务端的始终是工作区相对路径。
 */
function toBridgeRelativePath(p: string): string {
  if (!_directory) return p;
  const dir = _directory.endsWith('/') ? _directory : _directory + '/';
  if (p.startsWith(dir)) {
    return p.slice(dir.length);
  }
  // path === _directory（无尾部文件名，不太可能但做防御）
  if (p === _directory) return p;
  return p;
}

// ─── 文件操作 API ─────────────────────────────────────────────────────────────

/**
 * 读取文件内容（文本）
 * 优先通过 Bridge 读取，~ 路径直达 Tauri native fs
 */
export async function fileRead(path: string, directory?: string): Promise<string | null> {
  // ~ 路径直达 Tauri native fs，失败后降级 dev server
  if (path.startsWith('~')) {
    const result = await tauriNativeFileRead(path, directory);
    if (result !== null) return result;
    return devServerFileRead(path, directory);
  }

  // 通过 Bridge 读取（OpenWork 文件 API）
  const wsId = getWorkspaceId();
  if (wsId) {
    try {
      const result = await bridgeFileRead(toBridgeRelativePath(path));
      if (result !== null) return result;
    } catch {
      // Bridge 失败，降级到 Tauri
    }
  }

  // Tauri native 兜底
  const tauriResult = await tauriNativeFileRead(path, directory ?? _directory);
  if (tauriResult !== null) return tauriResult;

  // Dev server 最终兜底（仅开发环境）
  return devServerFileRead(path, directory ?? _directory);
}

/**
 * 写入文件内容
 */
export async function fileWrite(path: string, content: string, directory?: string): Promise<boolean> {
  // ~ 路径直达 Tauri native fs，失败后降级 dev server
  if (path.startsWith('~')) {
    const ok = await tauriNativeFileWrite(path, content, directory);
    if (ok) return true;
    return devServerFileWrite(path, content, directory);
  }

  // 通过 Bridge 写入
  const wsId = getWorkspaceId();
  if (wsId) {
    try {
      const ok = await bridgeFileWrite(toBridgeRelativePath(path), content);
      if (ok) return true;
    } catch {
      // Bridge 失败，降级到 Tauri
    }
  }

  // Tauri native 兜底
  const tauriOk = await tauriNativeFileWrite(path, content, directory ?? _directory);
  if (tauriOk) return true;

  // Dev server 最终兜底（仅开发环境）
  return devServerFileWrite(path, content, directory ?? _directory);
}

/**
 * 列出目录下的文件和子目录
 */
export async function fileList(path: string, directory?: string): Promise<FileNode[]> {
  // ~ 路径直达 Tauri native fs，失败后降级 dev server
  if (path.startsWith('~')) {
    const result = await tauriNativeFileList(path, directory);
    if (result !== null) return result;
    const devResult = await devServerFileList(path, directory);
    return devResult ?? [];
  }

  // 通过 Bridge listDir
  const dir = directory ?? _directory ?? '';
  const absPath = (path.startsWith('/') || !dir) ? path : `${dir.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  try {
    const entries = await bridgeFileList(absPath);
    if (entries.length > 0 || getWorkspaceId()) {
      return entries.map(entry => ({
        name: entry.name,
        path: `${path.replace(/\/$/, '')}/${entry.name}`,
        absolute: entry.path,
        type: (entry.type === 'dir' ? 'directory' : 'file') as 'file' | 'directory',
        ignored: entry.name.startsWith('.'),
      }));
    }
  } catch {
    // Bridge 失败，降级到 Tauri
  }

  // Tauri native 兜底
  const tauriResult = await tauriNativeFileList(path, directory ?? _directory);
  if (tauriResult !== null) return tauriResult;

  // Dev server 最终兜底（仅开发环境）
  const devResult = await devServerFileList(path, directory ?? _directory);
  return devResult ?? [];
}

/**
 * 删除文件
 */
export async function fileDelete(path: string, directory?: string): Promise<boolean> {
  // 目前 Bridge 不提供 delete，直接走 Tauri native
  const ok = await tauriNativeFileDelete(path, directory ?? _directory);
  if (ok) return true;

  // Dev server 最终兜底（仅开发环境）
  return devServerFileDelete(path, directory ?? _directory);
}
