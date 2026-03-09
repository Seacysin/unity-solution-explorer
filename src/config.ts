import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';

const CONFIG_FILENAME = 'unity-solution-explorer.json';
const CONFIG_RELATIVE = `.vscode/${CONFIG_FILENAME}`;

export interface UnitySolutionExplorerConfig {
  /** 不展示的项目（程序集）名称列表，如 ["Assembly-CSharp.FirstPass", "Some.Plugin"] */
  excludeProjects?: string[];
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
