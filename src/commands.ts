import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { getTemplateForExtension, NEW_FILE_EXTENSIONS } from './templates';
import { SolutionTreeItem } from './tree/treeNodes';
import { PendingStore } from './pendingStore';

function getItemFromArg(arg: unknown): SolutionTreeItem | undefined {
  if (arg && typeof arg === 'object' && 'fullPath' in arg && 'type' in arg) {
    return arg as SolutionTreeItem;
  }
  return undefined;
}

function ensureFolderExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function refreshAfterAction(item: SolutionTreeItem | undefined, refreshProject: (csprojPath: string) => void, refreshFull: () => void): void {
  if (item?.projectCsprojPath) refreshProject(item.projectCsprojPath);
  else refreshFull();
}

export function registerCommands(
  context: vscode.ExtensionContext,
  pendingStore: PendingStore,
  refreshProject: (csprojPath: string) => void,
  refreshFull: () => void
): void {
  // ----- 文件夹：新建文件 -----
  context.subscriptions.push(
    vscode.commands.registerCommand('unitySolutionExplorer.newFile', async (arg: unknown) => {
      const item = getItemFromArg(arg);
      if (!item || item.type !== 'folder' || !item.projectCsprojPath) return;
      const folderPath = item.fullPath;
      const projectDir = path.dirname(item.projectCsprojPath);
      const fileName = await vscode.window.showInputBox({
        title: '新建文件',
        prompt: '输入文件名（可含扩展名，如 MyScript.cs）',
        value: 'NewScript.cs',
        validateInput: (value) => {
          if (!value.trim()) return '请输入文件名';
          if (/[<>:"/\\|?*]/.test(value)) return '文件名不能包含 \\ / : * ? " < > |';
          return null;
        },
      });
      if (!fileName?.trim()) return;
      let name = fileName.trim();
      let ext = path.extname(name);
      if (!ext) {
        const picked = await vscode.window.showQuickPick(NEW_FILE_EXTENSIONS, {
          title: '选择文件类型',
          placeHolder: '默认 .cs',
        });
        ext = picked?.ext ?? '.cs';
        name = name + ext;
      }
      const fullPath = path.join(folderPath, name);
      if (fs.existsSync(fullPath)) {
        vscode.window.showWarningMessage(`文件已存在: ${name}`);
        return;
      }
      ensureFolderExists(folderPath);
      const template = getTemplateForExtension(ext);
      if (ext === '.cs' && template.includes('ClassName')) {
        const className = path.basename(name, ext).replace(/[^a-zA-Z0-9_]/g, '');
        fs.writeFileSync(fullPath, template.replace(/ClassName/g, className || 'NewClass'), 'utf-8');
      } else {
        fs.writeFileSync(fullPath, template, 'utf-8');
      }
      const relFile = path.relative(projectDir, fullPath);
      if (relFile && !relFile.startsWith('..')) pendingStore.addFile(item.projectCsprojPath, relFile);
      refreshAfterAction(item, refreshProject, refreshFull);
      const doc = await vscode.workspace.openTextDocument(fullPath);
      await vscode.window.showTextDocument(doc);
    })
  );

  // ----- 文件夹：重命名 -----
  context.subscriptions.push(
    vscode.commands.registerCommand('unitySolutionExplorer.renameFolder', async (arg: unknown) => {
      const item = getItemFromArg(arg);
      if (!item || item.type !== 'folder') return;
      const oldPath = item.fullPath;
      const parentDir = path.dirname(oldPath);
      const oldName = path.basename(oldPath);
      const newName = await vscode.window.showInputBox({
        title: '重命名文件夹',
        value: oldName,
        prompt: '输入新文件夹名',
        validateInput: (value) => {
          if (!value.trim()) return '请输入名称';
          if (/[<>:"/\\|?*]/.test(value)) return '名称不能包含 \\ / : * ? " < > |';
          if (value === oldName) return '名称未改变';
          return null;
        },
      });
      if (!newName?.trim() || newName.trim() === oldName) return;
      const newPath = path.join(parentDir, newName.trim());
      if (fs.existsSync(newPath)) {
        vscode.window.showErrorMessage('目标文件夹已存在');
        return;
      }
      try {
        fs.renameSync(oldPath, newPath);
        if (item.projectCsprojPath) {
          const projectDir = path.dirname(item.projectCsprojPath);
          const relOld = path.relative(projectDir, oldPath);
          const relNew = path.relative(projectDir, newPath);
          pendingStore.removePath(item.projectCsprojPath, relOld);
          if (relNew && !relNew.startsWith('..')) pendingStore.addFolder(item.projectCsprojPath, relNew);
        }
        refreshAfterAction(item, refreshProject, refreshFull);
        vscode.window.showInformationMessage('文件夹已重命名');
      } catch (e) {
        vscode.window.showErrorMessage('重命名失败: ' + (e as Error).message);
      }
    })
  );

  // ----- 文件夹：新建子文件夹 -----
  context.subscriptions.push(
    vscode.commands.registerCommand('unitySolutionExplorer.newFolder', async (arg: unknown) => {
      const item = getItemFromArg(arg);
      if (!item || item.type !== 'folder' || !item.projectCsprojPath) return;
      const folderPath = item.fullPath;
      const projectDir = path.dirname(item.projectCsprojPath);
      const name = await vscode.window.showInputBox({
        title: '新建文件夹',
        prompt: '输入文件夹名',
        value: 'NewFolder',
        validateInput: (value) => {
          if (!value.trim()) return '请输入名称';
          if (/[<>:"/\\|?*]/.test(value)) return '名称不能包含 \\ / : * ? " < > |';
          return null;
        },
      });
      if (!name?.trim()) return;
      const newPath = path.join(folderPath, name.trim());
      if (fs.existsSync(newPath)) {
        vscode.window.showWarningMessage('该文件夹已存在');
        return;
      }
      fs.mkdirSync(newPath, { recursive: true });
      const relFolder = path.relative(projectDir, newPath);
      if (relFolder && !relFolder.startsWith('..')) pendingStore.addFolder(item.projectCsprojPath, relFolder);
      refreshAfterAction(item, refreshProject, refreshFull);
      vscode.window.showInformationMessage('文件夹已创建');
    })
  );

  // ----- 文件夹：删除 -----
  context.subscriptions.push(
    vscode.commands.registerCommand('unitySolutionExplorer.deleteFolder', async (arg: unknown) => {
      const item = getItemFromArg(arg);
      if (!item || item.type !== 'folder') return;
      const folderPath = item.fullPath;
      const confirm = await vscode.window.showWarningMessage(
        `确定要删除文件夹 "${path.basename(folderPath)}" 及其下所有内容？`,
        { modal: true },
        '删除',
        '取消'
      );
      if (confirm !== '删除') return;
      try {
        if (item.projectCsprojPath) {
          const projectDir = path.dirname(item.projectCsprojPath);
          pendingStore.removeFolder(item.projectCsprojPath, path.relative(projectDir, folderPath));
        }
        fs.rmSync(folderPath, { recursive: true });
        refreshAfterAction(item, refreshProject, refreshFull);
        vscode.window.showInformationMessage('文件夹已删除');
      } catch (e) {
        vscode.window.showErrorMessage('删除失败: ' + (e as Error).message);
      }
    })
  );

  // ----- 文件夹：在资源管理器中打开 -----
  context.subscriptions.push(
    vscode.commands.registerCommand('unitySolutionExplorer.revealFolderInExplorer', (arg: unknown) => {
      const item = getItemFromArg(arg);
      if (!item || item.type !== 'folder') return;
      const { exec } = require('child_process');
      const p = item.fullPath.replace(/"/g, '\\"');
      if (process.platform === 'win32') {
        exec(`explorer "${p}"`);
      } else if (process.platform === 'darwin') {
        exec(`open "${p}"`);
      } else {
        exec(`xdg-open "${p}"`);
      }
    })
  );

  // ----- 文件夹：复制绝对路径 -----
  context.subscriptions.push(
    vscode.commands.registerCommand('unitySolutionExplorer.copyFolderPath', async (arg: unknown) => {
      const item = getItemFromArg(arg);
      if (!item || item.type !== 'folder') return;
      await vscode.env.clipboard.writeText(item.fullPath);
      vscode.window.showInformationMessage('已复制路径');
    })
  );

  // ----- 文件：重命名 -----
  context.subscriptions.push(
    vscode.commands.registerCommand('unitySolutionExplorer.renameFile', async (arg: unknown) => {
      const item = getItemFromArg(arg);
      if (!item || item.type !== 'file') return;
      const oldPath = item.fullPath;
      const dir = path.dirname(oldPath);
      const oldName = path.basename(oldPath);
      const newName = await vscode.window.showInputBox({
        title: '重命名文件',
        value: oldName,
        prompt: '输入新文件名',
        validateInput: (value) => {
          if (!value.trim()) return '请输入文件名';
          if (/[<>:"/\\|?*]/.test(value)) return '文件名不能包含 \\ / : * ? " < > |';
          if (value === oldName) return '名称未改变';
          return null;
        },
      });
      if (!newName?.trim() || newName.trim() === oldName) return;
      const newPath = path.join(dir, newName.trim());
      if (fs.existsSync(newPath)) {
        vscode.window.showErrorMessage('目标文件已存在');
        return;
      }
      try {
        if (item.projectCsprojPath) {
          const projectDir = path.dirname(item.projectCsprojPath);
          pendingStore.removePath(item.projectCsprojPath, path.relative(projectDir, oldPath));
          const relNew = path.relative(projectDir, newPath);
          if (relNew && !relNew.startsWith('..')) pendingStore.addFile(item.projectCsprojPath, relNew);
        }
        fs.renameSync(oldPath, newPath);
        refreshAfterAction(item, refreshProject, refreshFull);
        vscode.window.showInformationMessage('文件已重命名');
      } catch (e) {
        vscode.window.showErrorMessage('重命名失败: ' + (e as Error).message);
      }
    })
  );

  // ----- 文件：删除 -----
  context.subscriptions.push(
    vscode.commands.registerCommand('unitySolutionExplorer.deleteFile', async (arg: unknown) => {
      const item = getItemFromArg(arg);
      if (!item || item.type !== 'file') return;
      const filePath = item.fullPath;
      const confirm = await vscode.window.showWarningMessage(
        `确定要删除文件 "${path.basename(filePath)}"？`,
        { modal: true },
        '删除',
        '取消'
      );
      if (confirm !== '删除') return;
      try {
        if (item.projectCsprojPath) {
          const projectDir = path.dirname(item.projectCsprojPath);
          pendingStore.removeFile(item.projectCsprojPath, path.relative(projectDir, filePath));
        }
        fs.unlinkSync(filePath);
        refreshAfterAction(item, refreshProject, refreshFull);
        vscode.window.showInformationMessage('文件已删除');
      } catch (e) {
        vscode.window.showErrorMessage('删除失败: ' + (e as Error).message);
      }
    })
  );

  // ----- 文件：在资源管理器中打开所在文件夹 -----
  context.subscriptions.push(
    vscode.commands.registerCommand('unitySolutionExplorer.revealFileInExplorer', (arg: unknown) => {
      const item = getItemFromArg(arg);
      if (!item || item.type !== 'file') return;
      const dir = path.dirname(item.fullPath);
      if (process.platform === 'win32') {
        require('child_process').exec(`explorer /select,"${item.fullPath}"`);
      } else if (process.platform === 'darwin') {
        require('child_process').exec(`open -R "${item.fullPath}"`);
      } else {
        require('child_process').exec(`xdg-open "${dir}"`);
      }
    })
  );

  // ----- 文件：复制绝对路径 -----
  context.subscriptions.push(
    vscode.commands.registerCommand('unitySolutionExplorer.copyFilePath', async (arg: unknown) => {
      const item = getItemFromArg(arg);
      if (!item || item.type !== 'file') return;
      await vscode.env.clipboard.writeText(item.fullPath);
      vscode.window.showInformationMessage('已复制路径');
    })
  );
}
