// Modelo de relatório do doctor.
//   status: pass | warn | fail | not_run | skip
//   not_run = a checagem existe mas não pôde rodar (ferramenta ausente, sem consentimento...) —
//   NUNCA é contado como pass.

export const STATUS_ICON = { pass: '✓', warn: '⚠', fail: '✖', not_run: '○', skip: '·' };

export class Report {
  constructor(mode) {
    this.mode = mode;
    this.checks = [];
  }

  add(group, id, status, title, details = []) {
    this.checks.push({ group, id, status, title, details: details.filter(Boolean) });
    return this;
  }

  pass(group, id, title, details) { return this.add(group, id, 'pass', title, details); }
  warn(group, id, title, details) { return this.add(group, id, 'warn', title, details); }
  fail(group, id, title, details) { return this.add(group, id, 'fail', title, details); }
  notRun(group, id, title, details) { return this.add(group, id, 'not_run', title, details); }
  skip(group, id, title, details) { return this.add(group, id, 'skip', title, details); }

  /** Registra pass/fail/warn a partir de listas de erros e avisos. */
  fromIssues(group, id, okTitle, errors, warnings = [], failTitle) {
    const fmt = (i) => (typeof i === 'string' ? i : `${i.path ? `${i.path}: ` : ''}${i.message}`);
    if (errors.length) return this.fail(group, id, failTitle ?? `${okTitle}: ${errors.length} erro(s)`, [...errors.map(fmt), ...warnings.map(fmt)]);
    if (warnings.length) return this.warn(group, id, `${okTitle} (${warnings.length} aviso(s))`, warnings.map(fmt));
    return this.pass(group, id, okTitle);
  }

  summary(strict = false) {
    const count = { pass: 0, warn: 0, fail: 0, not_run: 0, skip: 0 };
    for (const c of this.checks) count[c.status]++;
    const failing = count.fail + (strict ? count.warn : 0);
    const overall = failing ? 'NOT_READY' : count.warn || count.not_run ? 'READY_WITH_WARNINGS' : 'READY';
    return { ...count, overall };
  }

  toJSON(strict = false) {
    return { mode: this.mode, strict, checks: this.checks, summary: this.summary(strict) };
  }

  format({ verbose = false, strict = false } = {}) {
    const L = ['SDD DOCTOR', ''];
    const groups = [...new Set(this.checks.map((c) => c.group))];
    for (const g of groups) {
      L.push(g);
      for (const c of this.checks.filter((x) => x.group === g)) {
        L.push(`${STATUS_ICON[c.status]} ${c.title}`);
        const show = verbose || c.status === 'fail' || c.status === 'warn' || c.status === 'not_run';
        if (show) {
          const lim = verbose ? c.details.length : 8;
          for (const d of c.details.slice(0, lim)) L.push(`    ${d}`);
          if (c.details.length > lim) L.push(`    … +${c.details.length - lim} (use --verbose)`);
        }
      }
      L.push('');
    }
    const s = this.summary(strict);
    L.push('Overall');
    L.push(s.overall);
    L.push(`${s.pass} ok · ${s.warn} aviso(s) · ${s.fail} falha(s) · ${s.not_run} não executada(s)`);
    return L.join('\n');
  }
}
