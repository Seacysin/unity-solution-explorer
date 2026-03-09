import * as path from 'path';

export interface SlnProject {
  name: string;
  relativePath: string;
  absolutePath: string;
  id: string;
}

/**
 * 解析 .sln 文件，提取 Project 段中的项目路径与名称。
 * 格式示例: Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Assembly-CSharp", "Assembly-CSharp.csproj", "{...}"
 */
export function parseSln(slnPath: string, content: string): SlnProject[] {
  const projects: SlnProject[] = [];
  const slnDir = path.dirname(slnPath);
  const projectRegex = /^\s*Project\s*\(\s*"[^"]+"\s*\)\s*=\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = projectRegex.exec(content)) !== null) {
    const name = m[1].trim();
    const relativePath = m[2].trim().replace(/\\/g, path.sep);
    const absolutePath = path.resolve(slnDir, relativePath);
    if (relativePath.toLowerCase().endsWith('.csproj')) {
      projects.push({ name, relativePath, absolutePath, id: m[3].trim() });
    }
  }
  return projects;
}
