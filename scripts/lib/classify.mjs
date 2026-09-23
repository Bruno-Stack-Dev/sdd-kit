// Classificação determinística greenfield × brownfield por evidência (Passo B do /sdd-init).
// O usuário confirma; a CLI só evita que o modelo "ache" sem mostrar o porquê.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { IGNORED_DIRS } from './files.mjs';

// Diretórios do próprio kit / estado do SDD: não contam como código de aplicação.
const KIT_DIRS = new Set(['specs', '.claude', '.claude-plugin', '.sdd', 'policies', 'schemas', 'mcp', 'hooks', 'docs', 'evals']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.py', '.go', '.rs', '.cs', '.java', '.kt', '.rb', '.php', '.swift', '.c', '.cpp', '.scala', '.ex', '.dart']);
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'poetry.lock', 'uv.lock', 'Pipfile.lock', 'go.sum', 'Cargo.lock', 'packages.lock.json', 'composer.lock', 'Gemfile.lock', 'gradle.lockfile'];
const TEST_RE = /(^|[\\/])(tests?|__tests__|spec)([\\/]|$)|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|Tests?\.cs$/i;

function scan(root) {
  let code = 0, tests = 0;
  const walk = (dir, depth, top) => {
    if (depth > 8) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      if (depth === 0 && KIT_DIRS.has(e.name)) continue;
      if (depth === 0 && e.name === 'scripts') {
        // scripts/ do kit (modo cópia) não é código de aplicação; scripts/ do projeto é.
        if (existsSync(join(dir, 'scripts', 'sdd.mjs')) || existsSync(join(dir, 'scripts', 'sdd-lint.mjs'))) continue;
      }
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1, top ?? e.name);
      else if (CODE_EXT.has(extname(e.name).toLowerCase())) {
        if (TEST_RE.test(p)) tests++;
        else code++;
      }
    }
  };
  walk(root, 0, null);
  return { code, tests };
}

function readJson(f) {
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
}

function dependencyEvidence(root) {
  const out = [];
  const pkg = readJson(join(root, 'package.json'));
  if (pkg && Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }).length) out.push('package.json com dependências');
  const text = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };
  if (/^require\s/m.test(text('go.mod'))) out.push('go.mod com require');
  if (/dependencies\s*=|\[tool\.poetry\.dependencies\]/.test(text('pyproject.toml'))) out.push('pyproject.toml com dependências');
  if (text('requirements.txt').trim()) out.push('requirements.txt');
  if (/<dependency>/.test(text('pom.xml'))) out.push('pom.xml com dependências');
  if (/\[dependencies\]/.test(text('Cargo.toml'))) out.push('Cargo.toml com dependências');
  try {
    for (const f of readdirSync(root, { recursive: true }).filter((x) => String(x).endsWith('.csproj')).slice(0, 5)) {
      if (/PackageReference/.test(text(String(f)))) { out.push(`${f} com PackageReference`); break; }
    }
  } catch { /* readdir recursivo indisponível */ }
  return out;
}

function commitCount(root) {
  const r = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? Number(r.stdout.trim()) || 0 : null;
}

export function classifyProject(root) {
  const evidence = [];
  let score = 0;
  const { code, tests } = scan(root);
  if (code >= 5) { score += 2; evidence.push(`${code} arquivo(s) de código de aplicação`); } else if (code > 0) { score += 1; evidence.push(`${code} arquivo(s) de código (pouco)`); }
  if (tests > 0) { score += 1; evidence.push(`${tests} arquivo(s) de teste`); }
  const deps = dependencyEvidence(root);
  if (deps.length) { score += 1; evidence.push(...deps); }
  const locks = LOCKFILES.filter((f) => existsSync(join(root, f)));
  if (locks.length) { score += 1; evidence.push(`lockfile: ${locks.join(', ')}`); }
  const infra = ['Dockerfile', 'docker-compose.yml', 'compose.yaml', '.gitlab-ci.yml', 'Jenkinsfile', 'azure-pipelines.yml'].filter((f) => existsSync(join(root, f)));
  const gh = existsSync(join(root, '.github', 'workflows')) ? readdirSync(join(root, '.github', 'workflows')).filter((f) => /\.ya?ml$/.test(f)) : [];
  if (infra.length || gh.length) { score += 1; evidence.push(`infra/CI: ${[...infra, ...gh.map((f) => `.github/workflows/${f}`)].join(', ')}`); }
  const commits = commitCount(root);
  if (commits !== null && commits > 20) { score += 1; evidence.push(`${commits} commits no histórico`); }
  const classification = score >= 3 ? 'brownfield' : 'greenfield';
  const confidence = score >= 5 || score === 0 ? 'alta' : score === 2 || score === 3 ? 'baixa' : 'média';
  if (!evidence.length) evidence.push('nenhum código de aplicação, dependência, lockfile ou CI encontrado');
  return { classification, confidence, score, evidence };
}
