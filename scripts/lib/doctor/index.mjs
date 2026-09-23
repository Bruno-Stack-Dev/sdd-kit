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
import { checkLint, checkConfig, checkSpecs, checkPlansAndTasks, checkAdrs, checkState, checkForbiddenPatterns, checkCodeIntelligence, checkBrownfield } from './project.mjs';
import { checkAgents, checkSkills, checkSkillScanner, checkCommands, checkSupplyChain, checkAgentScan } from './agents-skills.mjs';
import { checkPermissions, checkHooks, checkSandbox, checkSecrets, checkPolicyFile, checkInstall } from './security.mjs';
import { checkMcp } from './mcp.mjs';
import { checkEngine, isEngineRepo } from './engine.mjs';

export const MODES = ['fast', 'project', 'security', 'skills', 'mcp', 'full'];

const PLAN = {
  fast: ['lint', 'config', 'specs', 'tasks', 'state', 'agents'],
  project: ['config', 'specs', 'tasks', 'adrs', 'state', 'forbidden', 'brownfield', 'lsp'],
  security: ['install', 'permissions', 'hooks', 'sandbox', 'policy', 'secrets'],
  skills: ['skills', 'supply', 'commands', 'agents', 'scanner'],
  mcp: ['mcp', 'agentscan'],
  full: ['lint', 'config', 'specs', 'tasks', 'adrs', 'state', 'forbidden', 'brownfield', 'lsp', 'agents', 'skills', 'supply', 'commands', 'scanner', 'install', 'permissions', 'hooks', 'sandbox', 'policy', 'secrets', 'mcp', 'agentscan'],
};

export async function runDoctor(root, { mode = 'full', ownedPredicate } = {}) {
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
    lsp: () => (engine ? null : checkCodeIntelligence(report, p)),
    brownfield: () => checkBrownfield(report, p),
    agents: () => checkAgents(report, p),
    skills: () => checkSkills(report, p, { ownedPredicate }),
    commands: () => checkCommands(report, p),
    supply: () => checkSupplyChain(report, p),
    scanner: () => checkSkillScanner(report, p),
    install: () => (engine ? null : checkInstall(report, p)),
    permissions: () => checkPermissions(report, p),
    hooks: () => checkHooks(report, p),
    sandbox: () => checkSandbox(report, p),
    policy: () => checkPolicyFile(report, p),
    secrets: () => checkSecrets(report, p),
    mcp: () => checkMcp(report, p),
    agentscan: () => checkAgentScan(report, p),
  };
  for (const s of PLAN[mode]) {
    try { await steps[s](); } catch (e) {
      report.fail('Doctor', `internal.${s}`, `checagem '${s}' quebrou: ${e.message}`, [e.stack?.split('\n').slice(1, 3).join(' ')]);
    }
  }
  return report;
}
