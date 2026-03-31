import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { SUPPORTED_EXTENSIONS } from './parser/csprojParser';

const CONFIG_FILENAME = 'unity-solution-explorer.json';
const CONFIG_RELATIVE = `.vscode/${CONFIG_FILENAME}`;

export interface UnitySolutionExplorerConfig {
  /** 不展示的项目（程序集）名称列表，如 ["Assembly-CSharp.FirstPass", "Some.Plugin"] */
  excludeProjects?: string[];
  /**
   * 除内置类型外，还要在树中展示的扩展名，如 [".dll", ".asmdef"]（可写 ".dll" 或 "dll"）
   */
  additionalFileExtensions?: string[];
}

function findWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return undefined;
  return folders[0].uri.fsPath;
}

/** 从工作区 .vscode/unity-solution-explorer.json 读取配置；同时合并 VSCode 设置中的排除项 */
export function getExcludeProjects(): string[] {
  const root = findWorkspaceRoot();
  const fromSettings = (vscode.workspace.getConfiguration('unitySolutionExplorer').get<string[]>('excludeProjects')) ?? [];
  if (!root) return fromSettings;

  const configPath = path.join(root, CONFIG_RELATIVE);
  let fromFile: string[] = [];
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const data = JSON.parse(raw) as UnitySolutionExplorerConfig;
      if (Array.isArray(data.excludeProjects)) {
        fromFile = data.excludeProjects;
      }
    }
  } catch {
    // 忽略解析错误
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
    const configPath = path.join(root, CONFIG_RELATIVE);
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const data = JSON.parse(raw) as UnitySolutionExplorerConfig;
        if (Array.isArray(data.additionalFileExtensions)) {
          fromFile = data.additionalFileExtensions.filter((x): x is string => typeof x === 'string');
        }
      }
    } catch {
      // 忽略解析错误
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
