// Segurança: guardrails ativos, scans (reaproveitando as checagens do doctor), gates de segurança e
// decisões da política observadas no trace. Achado só é contado se algum scanner o produziu;
// scanner que não rodou aparece como NOT_RUN — nunca como PASS (mesma regra do doctor).

const SECURITY_GATE = /secur|segur|secret|segredo|audit|scan|sast|dast|depend|vuln/i;
const DOCTOR_STATUS = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', not_run: 'NOT_RUN', skip: 'SKIP' };

/**
 * @param ctx { guards, secretChecks (checagens do doctor ou null), agentScan, config, gates (state.gates),
 *              policy (índice), skillScanner (bool: instalado) }
 */
export function securitySummary({ guards, secretChecks, agentScan, config, gates, policy, tracked = true }) {
  const scans = [];
  const findings = { critical: 0, high: 0, medium: 0, low: 0 };
  const byId = (id) => secretChecks?.find((c) => c.id === id);
  for (const [id, name] of [['secrets.content', 'Secret scan'], ['secrets.tracked-files', 'Arquivos sensíveis versionados']]) {
    const c = byId(id);
    if (!c) { scans.push({ id, name, status: 'NOT_RUN', detail: secretChecks ? 'checagem indisponível' : 'não executado (use `r` no dashboard ou `sdd status` sem --no-scan)', counts: false, source: 'doctor --security' }); continue; }
    scans.push({ id, name, status: DOCTOR_STATUS[c.status] ?? 'NOT_RUN', detail: c.title, details: c.details.slice(0, 20), counts: true, source: 'doctor --security' });
    const weak = (d) => /possível (jwt|connection-string-password|generic-assignment|bearer-token|basic-auth)/.test(d);
    // Crítico = segredo/arquivo sensível VERSIONADO. Sem git não há como saber (um .env local é
    // normal): tudo conta como médio, com a razão no detalhe.
    const strong = c.status === 'fail' ? Math.max(1, c.details.filter((d) => !weak(d)).length) : 0;
    if (tracked) findings.critical += strong;
    else findings.medium += strong;
    if (c.status === 'fail' || c.status === 'warn') findings.medium += c.details.filter(weak).length;
    if (!tracked && strong) scans[scans.length - 1].detail += ' — sem git: versionamento desconhecido, contado como médio';
  }
  const eg = config?.engineering_gates ?? {};
  for (const [id, name] of [['dependency_audit', 'Dependency audit'], ['security_lint', 'Security lint (SAST)']]) {
    const g = eg[id];
    // Como no pick() dos gates da spec: bloqueio em qualquer spec (ou global) prevalece; senão, o mais recente.
    const all = Object.values(gates ?? {}).filter((x) => x.gate === id);
    const ev = all.find((x) => x.status === 'blocked') ?? all.sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
    if (!g?.enabled) { scans.push({ id, name, status: 'NOT_CONFIGURED', detail: `engineering_gates.${id} desligado`, counts: false, source: 'sdd.config.yaml' }); continue; }
    scans.push({ id, name, status: ev ? (ev.status === 'passed' ? 'PASS' : 'FAIL') : 'NOT_RUN', detail: ev ? `${ev.status}${ev.spec ? `@${ev.spec}` : ''} em ${ev.ts}${ev.reason ? ` — ${ev.reason}` : ''}` : `sem GATE_PASSED/GATE_BLOCKED --gate ${id}`, counts: !!ev, source: 'GATE_* (.sdd/events.jsonl)' });
    if (ev?.status === 'blocked') findings.high++;
  }
  for (const g of Object.values(gates ?? {})) {
    if (!SECURITY_GATE.test(g.gate) || ['dependency_audit', 'security_lint'].includes(g.gate)) continue;
    scans.push({ id: `gate:${g.gate}${g.spec ? `@${g.spec}` : ''}`, name: `Gate ${g.gate}`, status: g.status === 'passed' ? 'PASS' : 'FAIL', detail: `${g.status} em ${g.ts}${g.reason ? ` — ${g.reason}` : ''}`, counts: true, source: 'GATE_* (.sdd/events.jsonl)' });
    if (g.status === 'blocked') findings.high++;
  }
  scans.push(agentScan
    ? { id: 'agent-scan', name: 'Agent scan (Snyk)', status: agentScan.status === 'pass' ? 'PASS' : agentScan.status === 'not_run' ? 'NOT_RUN' : 'FAIL', detail: `${agentScan.status} em ${agentScan.ran_at}`, counts: agentScan.status !== 'not_run', source: agentScan.file }
    : { id: 'agent-scan', name: 'Agent scan (Snyk)', status: 'NOT_RUN', detail: 'nunca executado (opcional, com consentimento)', counts: false, source: '.sdd/reports/' });
  const decisions = policy.decisions.toArray().reverse().map((e) => ({
    id: e.id,
    ts: e.ts,
    agent: e.agent ?? '(sessão principal)',
    tool: e.attrs['tool.name'] ?? null,
    attempt: [e.attrs['tool.name'], e.attrs['file.path'] ?? e.attrs['tool.command'] ?? e.attrs['tool.pattern']].filter(Boolean).join(' '),
    rule: e.attrs['policy.rule'] ?? null,
    decision: String(e.attrs['policy.decision'] ?? '?').toUpperCase(),
    session: e.session,
  }));
  return {
    guards,
    scans,
    findings: { ...findings, source: 'scans que rodaram (doctor --security, GATE_*, agent-scan); high/low só existem quando um scanner os produz' },
    policy: { deny: policy.deny, ask: policy.ask, decisions, source: 'trace policy.decision (hooks PreToolUse)' },
  };
}
