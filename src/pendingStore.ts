import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

const PENDING_FILENAME = 'unity-solution-explorer-pending.json';
const PENDING_RELATIVE = `.vscode/${PENDING_FILENAME}`;

/** 单个项目的待同步项：相对 projectDir 的路径 */
export interface ProjectPending {
  folders: string[];
  files: string[];
}

/** 持久化格式：key 为 .csproj 绝对路径（归一化） */
interface PendingJson {
  [csprojPath: string]: ProjectPending;
}

function normalizePath(p: string): string {
  return path.normalize(p).replace(/\\/g, path.sep);
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return undefined;
  return folders[0].uri.fsPath;
}

function getPendingPath(): string | undefined {
  const root = getWorkspaceRoot();
  return root ? path.join(root, PENDING_RELATIVE) : undefined;
}

export class PendingStore {
  private byCsproj = new Map<string, ProjectPending>();

  constructor() {
    this.load();
  }

  load(): void {
    const filePath = getPendingPath();
    if (!filePath || !fs.existsSync(filePath)) return;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as PendingJson;
      this.byCsproj.clear();
      for (const [k, v] of Object.entries(data)) {
        const key = normalizePath(k);
        if (v && typeof v === 'object' && Array.isArray(v.folders) && Array.isArray(v.files)) {
          this.byCsproj.set(key, {
            folders: [...new Set(v.folders.map((f: string) => normalizePath(f)))],
            files: [...new Set(v.files.map((f: string) => normalizePath(f)))],
          });
        }
      }
    } catch {
      // 忽略
    }
  }

  save(): void {
    const filePath = getPendingPath();
    if (!filePath) return;
    try {
      const root = getWorkspaceRoot();
      if (!root) return;
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: PendingJson = {};
      for (const [k, v] of this.byCsproj) {
        if (v.folders.length > 0 || v.files.length > 0) {
          obj[k] = { folders: v.folders, files: v.files };
        }
      }
      fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch {
      // 忽略
    }
  }

  private ensure(csprojPath: string): ProjectPending {
    const key = normalizePath(csprojPath);
    let p = this.byCsproj.get(key);
    if (!p) {
      p = { folders: [], files: [] };
      this.byCsproj.set(key, p);
    }
    return p;
  }

  getPending(csprojPath: string): ProjectPending {
    const key = normalizePath(csprojPath);
    const p = this.byCsproj.get(key);
    return p ? { folders: [...p.folders], files: [...p.files] } : { folders: [], files: [] };
  }

  addFolder(csprojPath: string, relativeFolderPath: string): void {
    const rel = normalizePath(relativeFolderPath);
    if (!rel) return;
    const p = this.ensure(csprojPath);
    if (!p.folders.includes(rel)) p.folders.push(rel);
    this.save();
  }

  addFile(csprojPath: string, relativeFilePath: string): void {
    const rel = normalizePath(relativeFilePath);
    if (!rel) return;
    const p = this.ensure(csprojPath);
    if (!p.files.includes(rel)) p.files.push(rel);
    this.save();
  }

  removeFolder(csprojPath: string, relativeFolderPath: string): void {
    const key = normalizePath(csprojPath);
    const rel = normalizePath(relativeFolderPath);
    const p = this.byCsproj.get(key);
    if (!p) return;
    p.folders = p.folders.filter((f) => f !== rel && !f.startsWith(rel + path.sep));
    p.files = p.files.filter((f) => !f.startsWith(rel + path.sep));
    this.save();
  }

  removeFile(csprojPath: string, relativeFilePath: string): void {
    const key = normalizePath(csprojPath);
    const rel = normalizePath(relativeFilePath);
    const p = this.byCsproj.get(key);
    if (!p) return;
    p.files = p.files.filter((f) => f !== rel);
    this.save();
  }

  /** 重命名：从 pending 中移除旧路径，新路径若为新建项可之后由 add 添加 */
  removePath(csprojPath: string, relativePath: string): void {
    const key = normalizePath(csprojPath);
    const rel = normalizePath(relativePath);
    const p = this.byCsproj.get(key);
    if (!p) return;
    p.folders = p.folders.filter((f) => f !== rel && !f.startsWith(rel + path.sep));
    p.files = p.files.filter((f) => f !== rel && !f.startsWith(rel + path.sep));
    this.save();
  }

  /**
   * 合并后清理：已出现在蓝本中的路径、或磁盘上已不存在的路径从 pending 移除。
   * blueprintFileRels: 本次 csproj 解析出的文件相对路径集合。
   * projectDir: 项目目录，用于检查磁盘存在。
   */
  prune(csprojPath: string, blueprintFileRels: Set<string>, projectDir: string): void {
    const key = normalizePath(csprojPath);
    const p = this.byCsproj.get(key);
    if (!p) return;

    const inBlueprint = (rel: string) => {
      if (blueprintFileRels.has(rel)) return true;
      for (const b of blueprintFileRels) {
        if (b.startsWith(rel + path.sep)) return true;
      }
      return false;
    };

    const existsOnDisk = (rel: string) => fs.existsSync(path.join(projectDir, rel));

    p.folders = p.folders.filter((rel) => {
      if (inBlueprint(rel)) return false;
      return existsOnDisk(rel);
    });
    p.files = p.files.filter((rel) => {
      if (blueprintFileRels.has(rel)) return false;
      return existsOnDisk(rel);
    });
    this.save();
  }
}
