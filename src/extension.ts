import * as vscode from 'vscode';
import { PendingStore } from './pendingStore';
import { SolutionTreeProvider } from './tree/SolutionTreeProvider';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext): void {
  const pendingStore = new PendingStore();
  const treeProvider = new SolutionTreeProvider(context, pendingStore);
  const view = vscode.window.createTreeView('unitySolutionExplorerView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  treeProvider.setTreeView(view);

  context.subscriptions.push(view);
  context.subscriptions.push(
    vscode.commands.registerCommand('unitySolutionExplorer.refresh', () => {
      treeProvider.refresh();
    })
  );
  registerCommands(
    context,
    treeProvider.getPendingStore(),
    (csprojPath) => treeProvider.refreshProject(csprojPath),
    () => treeProvider.refresh()
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const uri = editor?.document?.uri;
      if (uri?.scheme === 'file') {
        treeProvider.revealFileInTree(uri.fsPath);
      }
    })
  );
  const currentUri = vscode.window.activeTextEditor?.document?.uri;
  if (currentUri?.scheme === 'file') {
    setTimeout(() => {
      treeProvider.revealFileInTree(currentUri.fsPath);
    }, 1200);
  }
}

export function deactivate(): void {}
