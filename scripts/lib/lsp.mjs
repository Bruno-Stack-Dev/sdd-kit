// Code intelligence: detecta linguagens do projeto, o language server disponível e o plugin LSP
// oficial do Claude Code correspondente. Não instala nem executa nada (só procura no PATH).
import { existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { findOnPath, IGNORED_DIRS } from './files.mjs';

// Fonte: docs oficiais do Claude Code (marketplace claude-plugins-official), ver
// docs/references/integrations-snapshot.md. Reverifique ao atualizar.
export const LSP_CATALOG = [
  { language: 'typescript', label: 'TypeScript/JavaScript', manifests: ['tsconfig.json', 'jsconfig.json', 'package.json'], exts: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'], plugin: 'typescript-lsp', binary: 'typescript-language-server', install: 'npm install -g typescript-language-server typescript' },
  { language: 'python', label: 'Python', manifests: ['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'Pipfile'], exts: ['.py'], plugin: 'pyright-lsp', binary: 'pyright-langserver', install: 'pip install pyright  (ou npm install -g pyright)' },
  { language: 'go', label: 'Go', manifests: ['go.mod'], exts: ['.go'], plugin: 'gopls-lsp', binary: 'gopls', install: 'go install golang.org/x/tools/gopls@latest' },
  { language: 'rust', label: 'Rust', manifests: ['Cargo.toml'], exts: ['.rs'], plugin: 'rust-analyzer-lsp', binary: 'rust-analyzer', install: 'rustup component add rust-analyzer' },
  { language: 'csharp', label: 'C#', manifests: [], manifestExts: ['.csproj', '.sln'], exts: ['.cs'], plugin: 'csharp-lsp', binary: 'csharp-ls', install: 'dotnet tool install --global csharp-ls' },
  { language: 'java', label: 'Java', manifests: ['pom.xml', 'build.gradle', 'settings.gradle'], exts: ['.java'], plugin: 'jdtls-lsp', binary: 'jdtls', install: 'baixe o Eclipse JDT Language Server e coloque `jdtls` no PATH' },
  { language: 'kotlin', label: 'Kotlin', manifests: ['build.gradle.kts', 'settings.gradle.kts'], exts: ['.kt', '.kts'], plugin: 'kotlin-lsp', binary: 'kotlin-language-server', install: 'releases de kotlin-language-server no GitHub' },
  { language: 'cpp', label: 'C/C++', manifests: ['CMakeLists.txt', 'compile_commands.json', 'meson.build'], exts: ['.c', '.h', '.cpp', '.hpp', '.cc'], plugin: 'clangd-lsp', binary: 'clangd', install: 'pacote clangd do sistema (brew/apt/winget)' },
  { language: 'php', label: 'PHP', manifests: ['composer.json'], exts: ['.php'], plugin: 'php-lsp', binary: 'intelephense', install: 'npm install -g intelephense' },
  { language: 'lua', label: 'Lua', manifests: [], exts: ['.lua'], plugin: 'lua-lsp', binary: 'lua-language-server', install: 'releases de lua-language-server no GitHub' },
  { language: 'swift', label: 'Swift', manifests: ['Package.swift'], exts: ['.swift'], plugin: 'swift-lsp', binary: 'sourcekit-lsp', install: 'Xcode ou toolchain Swift' },
];

// Linguagens sem plugin oficial: Serena (MCP, cross-client) é a alternativa documentada.
const NO_OFFICIAL = { '.rb': 'ruby', '.ex': 'elixir', '.exs': 'elixir', '.scala': 'scala', '.dart': 'dart', '.clj': 'clojure', '.hs': 'haskell' };

/** Conta arquivos por extensão até uma profundidade/limite (barato em repos grandes). */
function countExtensions(root, { maxDepth = 6, maxFiles = 20000 } = {}) {
  const counts = {};
  const manifests = new Set();
  let seen = 0;
  const walk = (dir, depth) => {
    if (depth > maxDepth || seen > maxFiles) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else {
        seen++;
        const ext = extname(e.name).toLowerCase();
        counts[ext] = (counts[ext] ?? 0) + 1;
        if (depth <= 2) manifests.add(e.name);
      }
    }
  };
  walk(root, 0);
  return { counts, manifests };
}

export function detectLanguages(root) {
  const { counts, manifests } = countExtensions(root);
  const out = [];
  for (const entry of LSP_CATALOG) {
    const files = entry.exts.reduce((n, e) => n + (counts[e] ?? 0), 0);
    const manifestHits = entry.manifests.filter((m) => manifests.has(m));
    const manifestExtHits = (entry.manifestExts ?? []).filter((e) => counts[e]);
    // package.json sozinho (sem fontes JS/TS) não caracteriza projeto TypeScript/JavaScript.
    const strong = manifestHits.filter((m) => m !== 'package.json').length + manifestExtHits.length;
    if (!files && !strong) continue;
    const binaryPath = findOnPath(entry.binary);
    out.push({
      language: entry.language,
      label: entry.label,
      files,
      evidence: [...manifestHits, ...manifestExtHits.map((e) => `*${e}`), ...(files ? [`${files} arquivo(s) ${entry.exts.filter((e) => counts[e]).join('/')}`] : [])],
      plugin: `${entry.plugin}@claude-plugins-official`,
      binary: entry.binary,
      binaryFound: !!binaryPath,
      binaryPath,
      install: entry.install,
    });
  }
  out.sort((a, b) => b.files - a.files);
  const unsupported = [...new Set(Object.entries(NO_OFFICIAL).filter(([ext]) => counts[ext]).map(([, lang]) => lang))];
  return { languages: out, unsupported };
}
