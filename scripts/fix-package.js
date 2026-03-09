const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'package.json');
const json = JSON.parse(fs.readFileSync(p, 'utf-8'));
json.contributes.commands = [
  { command: 'unitySolutionExplorer.refresh', title: '刷新解决方案', icon: '$(refresh)' },
  { command: 'unitySolutionExplorer.newFile', title: '新建文件' },
  { command: 'unitySolutionExplorer.renameFolder', title: '重命名文件夹' },
  { command: 'unitySolutionExplorer.newFolder', title: '新建文件夹' },
  { command: 'unitySolutionExplorer.deleteFolder', title: '删除文件夹' },
  { command: 'unitySolutionExplorer.revealFolderInExplorer', title: '在资源管理器中打开文件夹' },
  { command: 'unitySolutionExplorer.copyFolderPath', title: '复制绝对路径' },
  { command: 'unitySolutionExplorer.renameFile', title: '重命名文件' },
  { command: 'unitySolutionExplorer.deleteFile', title: '删除文件' },
  { command: 'unitySolutionExplorer.revealFileInExplorer', title: '在资源管理器中打开所在文件夹' },
  { command: 'unitySolutionExplorer.copyFilePath', title: '复制绝对路径' }
];
json.contributes.menus['view/item/context'] = [
  { command: 'unitySolutionExplorer.newFile', when: 'view == unitySolutionExplorerView && viewItem == folder', group: '1_new' },
  { command: 'unitySolutionExplorer.newFolder', when: 'view == unitySolutionExplorerView && viewItem == folder', group: '1_new' },
  { command: 'unitySolutionExplorer.renameFolder', when: 'view == unitySolutionExplorerView && viewItem == folder', group: '2_edit' },
  { command: 'unitySolutionExplorer.deleteFolder', when: 'view == unitySolutionExplorerView && viewItem == folder', group: '2_edit' },
  { command: 'unitySolutionExplorer.revealFolderInExplorer', when: 'view == unitySolutionExplorerView && viewItem == folder', group: '3_open' },
  { command: 'unitySolutionExplorer.copyFolderPath', when: 'view == unitySolutionExplorerView && viewItem == folder', group: '3_open' },
  { command: 'unitySolutionExplorer.renameFile', when: 'view == unitySolutionExplorerView && viewItem == file', group: '2_edit' },
  { command: 'unitySolutionExplorer.deleteFile', when: 'view == unitySolutionExplorerView && viewItem == file', group: '2_edit' },
  { command: 'unitySolutionExplorer.revealFileInExplorer', when: 'view == unitySolutionExplorerView && viewItem == file', group: '3_open' },
  { command: 'unitySolutionExplorer.copyFilePath', when: 'view == unitySolutionExplorerView && viewItem == file', group: '3_open' }
];
json.contributes.configuration = {
  title: 'Unity Solution Explorer',
  properties: {
    'unitySolutionExplorer.excludeProjects': {
      type: 'array',
      items: { type: 'string' },
      default: [],
      description: '不在 Solution Explorer 中显示的项目（程序集）名称列表，可与 .vscode/unity-solution-explorer.json 合并'
    }
  }
};
fs.writeFileSync(p, JSON.stringify(json, null, 2), 'utf-8');
console.log('package.json updated');
