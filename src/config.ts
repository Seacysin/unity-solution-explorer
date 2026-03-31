import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { SUPPORTED_EXTENSIONS } from './parser/csprojParser';

const CONFIG_FILENAME = 'unity-solution-explorer.json';
const CONFIG_RELATIVE = `.vscode/${CONFIG_FILENAME}`;
const SETTINGS_RELATIVE = '.vscode/settings.json';
const SETTINGS_LEGACY_RELATIVE = '.vscode/setting.json';

export interface UnitySolutionExplorerConfig {
  /** 不展示的项目（程序集）名称列表，如 ["Assembly-CSharp.FirstPass", "Some.Plugin"] */
  excludeProjects?: string[];
  /**
   * 除内置类型外，还要在树中展示的扩展名，如 [".dll", ".asmdef"]（可写 ".dll" 或 "dll"）
   */
  additionalFileExtensions?: string[];
  /**
   * 解决方案根级别额外展示的目录（相对工作区根），如 [".cursor", ".claude"]
   * 仅从 .vscode/unity-solution-explorer.json 读取，不合并用户设置
   */
  extraSolutionFolders?: string[];
}

function findWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return undefined;
  return folders[0].uri.fsPath;
}

function readWorkspaceConfig(root: string): UnitySolutionExplorerConfig | undefined {
  const configPath = path.join(root, CONFIG_RELATIVE);
  try {
    if (!fs.existsSync(configPath)) return undefined;
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as UnitySolutionExplorerConfig;
  } catch {
    return undefined;
  }
}

/** 从工作区 .vscode/unity-solution-explorer.json 读取配置；同时合并 VSCode 设置中的排除项 */
export function getExcludeProjects(): string[] {
  const root = findWorkspaceRoot();
  const fromSettings = (vscode.workspace.getConfiguration('unitySolutionExplorer').get<string[]>('excludeProjects')) ?? [];
  if (!root) return fromSettings;

  let fromFile: string[] = [];
  const data = readWorkspaceConfig(root);
  if (data && Array.isArray(data.excludeProjects)) {
    fromFile = data.excludeProjects;
  }
  const set = new Set<string>([...fromFile, ...fromSettings]);
  return Array.from(set);
}

function normalizeExtensionList(items: string[]): string[] {
  const set = new Set<string>();
  for (const raw of items) {
    if (typeof raw !== 'string') continue;
    let s = raw.trim().toLowerCase();
    if (!s) continue;
    if (!s.startsWith('.')) {
      s = `.${s}`;
    }
    set.add(s);
  }
  return Array.from(set);
}

/** 来自工作区 JSON 与 VS Code 设置的额外扩展名（已归一化为小写且带点） */
export function getAdditionalFileExtensions(): string[] {
  const fromSettings =
    (vscode.workspace.getConfiguration('unitySolutionExplorer').get<string[]>('additionalFileExtensions')) ?? [];
  const root = findWorkspaceRoot();
  let fromFile: string[] = [];
  if (root) {
    const data = readWorkspaceConfig(root);
    if (data && Array.isArray(data.additionalFileExtensions)) {
      fromFile = data.additionalFileExtensions.filter((x): x is string => typeof x === 'string');
    }
  }
  return normalizeExtensionList([...fromFile, ...fromSettings]);
}

/** 内置扩展名 + 配置中的额外扩展名，供解析 csproj 时过滤 Include */
export function getMergedSupportedExtensions(): string[] {
  const set = new Set<string>(SUPPORTED_EXTENSIONS.map((e) => e.toLowerCase()));
  for (const e of getAdditionalFileExtensions()) {
    set.add(e);
  }
  return Array.from(set);
}

function normalizeRelativeFolderList(items: string[]): string[] {
  const set = new Set<string>();
  for (const raw of items) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const normalized = path.normalize(trimmed);
    if (path.isAbsolute(normalized)) continue;
    const parts = normalized.split(path.sep).filter(Boolean);
    if (parts.some((p) => p === '..')) continue;
    if (parts.length === 0) continue;
    set.add(parts.join(path.sep));
  }
  return Array.from(set);
}

function parseJsoncLike(raw: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // 兜底：支持 settings.json 常见 JSONC（注释、尾逗号）
    try {
      const noBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');
      const noLineComments = noBlockComments.replace(/^\s*\/\/.*$/gm, '');
      const noTrailingCommas = noLineComments.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(noTrailingCommas) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
}

/**
 * 读取工作区 .vscode/settings.json 中的额外目录：
 * unitySolutionExplorer.extraSolutionFolders
 * 返回相对 workspaceRoot 的目录路径列表。
 */
export function getExtraSolutionFolders(workspaceRoot?: string): string[] {
  const root = workspaceRoot ?? findWorkspaceRoot();
  if (!root) return [];

  // 首选 VS Code 工作区级配置（按当前 workspaceRoot scope 读取）。
  const inspect = vscode.workspace
    .getConfiguration(undefined, vscode.Uri.file(root))
    .inspect<unknown>('unitySolutionExplorer.extraSolutionFolders');
  const fromWorkspace = inspect?.workspaceFolderValue ?? inspect?.workspaceValue;
  if (Array.isArray(fromWorkspace)) {
    return normalizeRelativeFolderList(fromWorkspace.filter((x): x is string => typeof x === 'string'));
  }

  // 兜底：直接读取 settings 文件文本并做 JSONC 容错。
  const candidates = [SETTINGS_RELATIVE, SETTINGS_LEGACY_RELATIVE];
  for (const rel of candidates) {
    const p = path.join(root, rel);
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, 'utf-8');
      const data = parseJsoncLike(raw);
      const value = data?.['unitySolutionExplorer.extraSolutionFolders'];
      if (!Array.isArray(value)) continue;
      return normalizeRelativeFolderList(value.filter((x): x is string => typeof x === 'string'));
    } catch {
      // ignore and continue
    }
  }
  return [];
}
