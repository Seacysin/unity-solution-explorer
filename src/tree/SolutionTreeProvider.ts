import * as path from 'path';
import * as vscode from 'vscode';
import { parseSln } from '../parser/slnParser';
import { parseCsproj } from '../parser/csprojParser';
import { getExcludeProjects, getMergedSupportedExtensions } from '../config';
import { PendingStore } from '../pendingStore';
import { SolutionTreeItem, buildFolderTree } from './treeNodes';
import * as fs from 'fs';

const EXPANDED_PROJECTS_KEY = 'unitySolutionExplorer.expandedProjects';

export class SolutionTreeProvider implements vscode.TreeDataProvider<SolutionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SolutionTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private projectNodeByCsprojPath = new Map<string, SolutionTreeItem>();
  /** 项目目录 -> .csproj 路径，用于根据文件路径反查所属项目 */
  private projectDirByCsprojPath = new Map<string, string>();
  /** 文件绝对路径 -> 树节点，用于 reveal 定位（key 统一小写以兼容 Windows） */
  private filePathToItem = new Map<string, SolutionTreeItem>();
  private treeView: vscode.TreeView<SolutionTreeItem> | undefined;
  private pendingStore: PendingStore;

  private pathKey(p: string): string {
    try {
      const resolved = path.resolve(p);
      const n = path.normalize(resolved);
      return process.platform === 'win32' ? n.toLowerCase() : n;
    } catch {
      const n = path.normalize(p);
      return process.platform === 'win32' ? n.toLowerCase() : n;
    }
  }

  setTreeView(view: vscode.TreeView<SolutionTreeItem>): void {
    this.treeView = view;
    this.context.subscriptions.push(
      view.onDidExpandElement((e) => this.saveExpanded(e.element, true)),
      view.onDidCollapseElement((e) => this.saveExpanded(e.element, false))
    );
  }

  /** 持久化/移除项目节点的展开状态（仅 project 层级） */
  private saveExpanded(element: SolutionTreeItem, expanded: boolean): void {
    if (element.type !== 'project' || !element.fullPath) return;
    const key = this.pathKey(element.fullPath);
    const list = this.context.workspaceState.get<string[]>(EXPANDED_PROJECTS_KEY) ?? [];
    const set = new Set(list);
    if (expanded) set.add(key);
    else set.delete(key);
    this.context.workspaceState.update(EXPANDED_PROJECTS_KEY, [...set]);
  }

  /** 读取上次持久化的展开项目 key 集合 */
  private getExpandedProjectKeys(): Set<string> {
    const list = this.context.workspaceState.get<string[]>(EXPANDED_PROJECTS_KEY) ?? [];
    return new Set(list);
  }

  /** 为树节点设置 parent，供 getParent / reveal 使用 */
  private setParents(items: SolutionTreeItem[], parent: SolutionTreeItem): void {
    for (const item of items) {
      (item as SolutionTreeItem).parent = parent;
      if (item.children?.length) {
        this.setParents(item.children, item);
      }
    }
  }

  /** 根据路径查找已注册的文件节点（含多种 key 形式兼容） */
  private findFileItemByPath(targetKey: string): SolutionTreeItem | undefined {
    let item = this.filePathToItem.get(targetKey);
    if (item) return item;
    for (const [k, v] of this.filePathToItem) {
      if (k === targetKey) return v;
      if (path.relative(k, targetKey) === '' || path.relative(targetKey, k) === '') return v;
    }
    return undefined;
  }

  /** 在树中展开并定位到指定文件路径（如当前打开的文件） */
  async revealFileInTree(filePath: string): Promise<void> {
    if (!this.treeView || !filePath) return;
    const key = this.pathKey(filePath);

    if (this.projectDirByCsprojPath.size === 0) {
      this._onDidChangeTreeData.fire();
      await new Promise((r) => setTimeout(r, 800));
    }

    let csprojPath: string | undefined;
    let longest = 0;
    for (const [dir, csproj] of this.projectDirByCsprojPath) {
      const d = this.pathKey(dir);
      const keyWithSep = d + (d.endsWith(path.sep) ? '' : path.sep);
      if (key === d || key.startsWith(keyWithSep)) {
        if (d.length > longest) {
          longest = d.length;
          csprojPath = csproj;
        }
      }
    }
    if (!csprojPath) return;
    const projectNode = this.projectNodeByCsprojPath.get(csprojPath);
    if (!projectNode) return;

    let item = this.findFileItemByPath(key);
    if (item) {
      await this.treeView.reveal(item, { select: true, focus: false, expand: 3 });
      return;
    }

    await this.treeView.reveal(projectNode, { expand: true });
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 50));
      item = this.findFileItemByPath(key);
      if (item) {
        await this.treeView.reveal(item, { select: true, focus: false, expand: 3 });
        return;
      }
    }
  }

  private registerFileItems(items: SolutionTreeItem[]): void {
    for (const item of items) {
      if (item.type === 'file' && item.fullPath) {
        this.filePathToItem.set(this.pathKey(item.fullPath), item);
      }
      if (item.children?.length) {
        this.registerFileItems(item.children);
      }
    }
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    pendingStore: PendingStore
  ) {
    this.pendingStore = pendingStore;
    this.setupWatchers();
  }

  private setupWatchers(): void {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.csproj');
    watcher.onDidChange((uri) => {
      const csprojPath = uri.fsPath;
      const node = this.projectNodeByCsprojPath.get(csprojPath);
      if (node) this._onDidChangeTreeData.fire(node);
    });
    watcher.onDidCreate((uri) => {
      const csprojPath = uri.fsPath;
      const node = this.projectNodeByCsprojPath.get(csprojPath);
      if (node) this._onDidChangeTreeData.fire(node);
    });
    this.context.subscriptions.push(watcher);

    const onFocus = vscode.window.onDidChangeWindowState((e) => {
      if (e.focused) this._onDidChangeTreeData.fire();
    });
    this.context.subscriptions.push(onFocus);
  }

  getPendingStore(): PendingStore {
    return this.pendingStore;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  refreshProject(csprojPath: string): void {
    const node = this.projectNodeByCsprojPath.get(csprojPath);
    if (node) {
      this._onDidChangeTreeData.fire(node);
    } else {
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: SolutionTreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: SolutionTreeItem): SolutionTreeItem | undefined {
    return element.parent;
  }

  async getChildren(element?: SolutionTreeItem): Promise<SolutionTreeItem[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
      return [];
    }

    if (!element) {
      return this.getSolutionRoots(workspaceFolders);
    }

    if (element.type === 'solution') {
      return element.children ?? [];
    }

    if (element.type === 'project' && element.projectCsprojPath) {
      const items = await this.loadOneProjectTree(element.projectCsprojPath);
      this.setParents(items, element);
      this.registerFileItems(items);
      return items;
    }

    if (element.type === 'folder') {
      return element.children ?? [];
    }

    return [];
  }

  private async getSolutionRoots(
    workspaceFolders: readonly vscode.WorkspaceFolder[]
  ): Promise<SolutionTreeItem[]> {
    const roots: SolutionTreeItem[] = [];
    const seenSlns = new Set<string>();
    this.projectNodeByCsprojPath.clear();
    this.projectDirByCsprojPath.clear();
    this.filePathToItem.clear();

    for (const folder of workspaceFolders) {
      const slnFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*.sln'),
        null,
        50
      );
      for (const uri of slnFiles) {
        const slnPath = uri.fsPath;
        if (seenSlns.has(slnPath)) continue;
        seenSlns.add(slnPath);
        try {
          const content = fs.readFileSync(slnPath, 'utf-8');
          const projects = parseSln(slnPath, content);
          const excludeSet = new Set(getExcludeProjects().map((n) => n.trim()).filter(Boolean));
          const filtered =
            excludeSet.size > 0 ? projects.filter((p) => !excludeSet.has(p.name)) : projects;
          const solutionName = path.basename(slnPath, '.sln');
          const projectNodes = await this.loadProjectNodes(filtered);
          const solutionItem = new SolutionTreeItem(
            solutionName,
            'solution',
            slnPath,
            projectNodes,
            vscode.TreeItemCollapsibleState.Expanded
          );
          this.setParents(projectNodes, solutionItem);
          roots.push(solutionItem);
        } catch (e) {
          roots.push(
            new SolutionTreeItem(
              path.basename(slnPath) + ' (解析失败)',
              'solution',
              slnPath,
              [],
              vscode.TreeItemCollapsibleState.None
            )
          );
        }
      }
    }

    if (roots.length === 0) {
      return [
        new SolutionTreeItem(
          '未找到 .sln 文件',
          'solution',
          '',
          undefined,
          vscode.TreeItemCollapsibleState.None
        ),
      ];
    }
    return roots;
  }

  private async loadProjectNodes(
    projects: { name: string; absolutePath: string }[]
  ): Promise<SolutionTreeItem[]> {
    const expandedKeys = this.getExpandedProjectKeys();
    const nodes: SolutionTreeItem[] = [];
    for (const proj of projects) {
      try {
        if (!fs.existsSync(proj.absolutePath)) {
          nodes.push(
            new SolutionTreeItem(
              proj.name + ' (文件不存在)',
              'project',
              proj.absolutePath,
              [],
              vscode.TreeItemCollapsibleState.None
            )
          );
          continue;
        }
        const content = fs.readFileSync(proj.absolutePath, 'utf-8');
        const info = parseCsproj(proj.absolutePath, content, getMergedSupportedExtensions());
        const projectDir = path.dirname(proj.absolutePath);
        const csprojKey = this.pathKey(proj.absolutePath);
        const isAssemblyCSharp = path.basename(proj.absolutePath) === 'Assembly-CSharp.csproj';
        const shouldExpand =
          expandedKeys.has(csprojKey) || isAssemblyCSharp;
        const projectItem = new SolutionTreeItem(
          info.assemblyName || proj.name,
          'project',
          proj.absolutePath,
          undefined,
          shouldExpand
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
          proj.absolutePath
        );
        projectItem.tooltip = proj.absolutePath;
        this.projectNodeByCsprojPath.set(proj.absolutePath, projectItem);
        this.projectDirByCsprojPath.set(projectDir, proj.absolutePath);
        nodes.push(projectItem);
      } catch (e) {
        nodes.push(
          new SolutionTreeItem(
            proj.name + ' (解析失败)',
            'project',
            proj.absolutePath,
            [],
            vscode.TreeItemCollapsibleState.None
          )
        );
      }
    }
    return nodes;
  }

  /**
   * 蓝本（csproj 解析）+ Pending 合并后建树，不做整盘扫描。
   */
  private async loadOneProjectTree(csprojPath: string): Promise<SolutionTreeItem[]> {
    const projectDir = path.dirname(csprojPath);
    try {
      if (!fs.existsSync(csprojPath)) {
        return [];
      }
      const content = fs.readFileSync(csprojPath, 'utf-8');
      const info = parseCsproj(csprojPath, content, getMergedSupportedExtensions());
      const blueprintFiles = info.compileItems.map((c) => c.include);
      const blueprintRels = new Set(
        blueprintFiles.map((f) => path.relative(projectDir, f)).filter((r) => !r.startsWith('..'))
      );

      this.pendingStore.prune(csprojPath, blueprintRels, projectDir);
      const pendingAfter = this.pendingStore.getPending(csprojPath);

      return buildFolderTree(
        blueprintFiles,
        projectDir,
        csprojPath,
        pendingAfter.folders,
        pendingAfter.files
      );
    } catch {
      return [];
    }
  }
}
