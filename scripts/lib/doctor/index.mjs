// sdd doctor — orquestra as checagens por modo.
//   fast     : o que o sdd-lint cobre + config + grafo + estado (barato, roda em todo commit)
//   project  : fast + planos/ADRs/ledger/padrões proibidos
//   security : permissões, hooks, sandbox, política, segredos
//   skills   : skills (spec Agent Skills, atribuição) + agentes + scanner externo
//   mcp      : configuração e governança de MCP
//   full     : tudo
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Report } from './report.mjs';
import { loadProject } from '../project.mjs';
import { checkLint, checkConfig, checkSpecs, checkPlansAndTasks, checkAdrs, checkState, checkForbiddenPatterns } from './project.mjs';
import { checkAgents, checkSkills, checkSkillScanner, checkCommands } from './agents-skills.mjs';
import { checkPermissions, checkHooks, checkSandbox, checkSecrets, checkPolicyFile, checkInstall } from './security.mjs';
import { checkMcp } from './mcp.mjs';
import { checkEngine, isEngineRepo } from './engine.mjs';

export const MODES = ['fast', 'project', 'security', 'skills', 'mcp', 'full'];

const PLAN = {
  fast: ['lint', 'config', 'specs', 'tasks', 'state', 'agents'],
  project: ['config', 'specs', 'tasks', 'adrs', 'state', 'forbidden'],
  security: ['install', 'permissions', 'hooks', 'sandbox', 'policy', 'secrets'],
  skills: ['skills', 'commands', 'agents', 'scanner'],
  mcp: ['mcp'],
  full: ['lint', 'config', 'specs', 'tasks', 'adrs', 'state', 'forbidden', 'agents', 'skills', 'commands', 'scanner', 'install', 'permissions', 'hooks', 'sandbox', 'policy', 'secrets', 'mcp'],
};

export function runDoctor(root, { mode = 'full', ownedPredicate } = {}) {
  if (!MODES.includes(mode)) throw new Error(`modo desconhecido '${mode}'`);
  const report = new Report(mode);
  const p = loadProject(root);
  const adrDirs = [`${p.specsDir}/decisions`];
  const engine = isEngineRepo(root) && p.cfg.source === 'none';
  if (existsSync(join(root, 'docs', 'adr'))) adrDirs.push('docs/adr');
  const steps = {
    lint: () => checkLint(report, p),
    config: () => (engine ? checkEngine(report, p) : checkConfig(report, p)),
    specs: () => checkSpecs(report, p),
    tasks: () => checkPlansAndTasks(report, p),
    adrs: () => checkAdrs(report, p, adrDirs),
    state: () => checkState(report, p),
    forbidden: () => checkForbiddenPatterns(report, p),
    agents: () => checkAgents(report, p),
    skills: () => checkSkills(report, p, { ownedPredicate }),
    commands: () => checkCommands(report, p),
    scanner: () => checkSkillScanner(report, p),
    install: () => (engine ? null : checkInstall(report, p)),
    permissions: () => checkPermissions(report, p),
    hooks: () => checkHooks(report, p),
    sandbox: () => checkSandbox(report, p),
    policy: () => checkPolicyFile(report, p),
    secrets: () => checkSecrets(report, p),
    mcp: () => checkMcp(report, p),
  };
  for (const s of PLAN[mode]) {
    try { steps[s](); } catch (e) {
      report.fail('Doctor', `internal.${s}`, `checagem '${s}' quebrou: ${e.message}`, [e.stack?.split('\n').slice(1, 3).join(' ')]);
    }
  }
  return report;
}
