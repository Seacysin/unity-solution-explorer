import * as path from 'path';

/** 支持的展示与编辑的扩展名（小写） */
export const SUPPORTED_EXTENSIONS = ['.cs', '.shader', '.xml', '.txt', '.json'];

export interface CsprojInfo {
  assemblyName: string;
  rootNamespace: string;
  compileItems: { include: string; link?: string }[];
  projectPath: string;
}

function parseItemGroup(content: string, tagName: string): { include: string; link?: string }[] {
  const items: { include: string; link?: string }[] = [];
  const regex = new RegExp(
    `<${tagName}\\s+Include="([^"]+)"(?:\\s+Link="([^"]+)")?\\s*\\/?>`,
    'g'
  );
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    const include = m[1].trim().replace(/\\/g, path.sep);
    const link = m[2]?.trim();
    if (include && !include.includes('*')) {
      items.push({ include, link });
    }
  }
  return items;
}

function isSupportedPath(filePath: string, supportedExtensions: readonly string[]): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return supportedExtensions.includes(ext);
}

/**
 * 解析 .csproj 文件（支持 Unity 生成的 MSBuild 格式）。
 * 提取 AssemblyName、RootNamespace，以及 Compile / None / Content 中的支持文件。
 * supportedExtensions 默认含 .cs/.shader/.xml/.txt/.json，可通过配置合并额外扩展名。
 */
export function parseCsproj(
  projectPath: string,
  content: string,
  supportedExtensions: readonly string[] = SUPPORTED_EXTENSIONS
): CsprojInfo {
  const projectDir = path.dirname(projectPath);
  const compileItems = parseItemGroup(content, 'Compile');
  const noneItems = parseItemGroup(content, 'None');
  const contentItems = parseItemGroup(content, 'Content');

  const allIncludes = [...compileItems, ...noneItems, ...contentItems]
    .map((item) => path.resolve(projectDir, item.include))
    .filter((p) => isSupportedPath(p, supportedExtensions));

  let assemblyName = path.basename(projectPath, '.csproj');
  let rootNamespace = assemblyName;

  const assemblyNameMatch = content.match(/<AssemblyName>\s*(.*?)\s*<\/AssemblyName>/s);
  if (assemblyNameMatch) {
    assemblyName = assemblyNameMatch[1].trim();
  }
  const rootNsMatch = content.match(/<RootNamespace>\s*(.*?)\s*<\/RootNamespace>/s);
  if (rootNsMatch) {
    rootNamespace = rootNsMatch[1].trim();
  }

  return {
    assemblyName,
    rootNamespace,
    compileItems: allIncludes.map((include) => ({ include })),
    projectPath,
  };
}
