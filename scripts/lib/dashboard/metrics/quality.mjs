// Qualidade: resultados de teste registrados (TEST_*) e de evals (`sdd eval run`). Contagens
// (passed/failed/skipped/total/coverage) só aparecem quando o evento as trouxe em `meta`
// (`sdd event TEST_PASSED --spec X --suite unit --passed 142 --failed 0 --total 142`).

export function qualitySummary({ specs, state, testsIndex, evals }) {
  const active = specs.filter((s) => s.id && s.state !== 'archived');
  const rows = [];
  let withCounts = false;
  let partial = 0;
  const totals = { passed: 0, failed: 0, skipped: 0, total: 0 };
  const bySuite = new Map();
  for (const s of active) {
    const last = state.tests?.by_spec?.[s.id] ?? null;
    const suites = testsIndex.get(s.id);
    const suiteRows = suites ? [...suites.entries()].map(([suite, r]) => ({ suite, ...r })) : [];
    for (const r of suiteRows) {
      if (r.passed === null && r.failed === null && r.total === null) continue;
      // Contagem só é somada quando é completa: total, ou aprovados E falhas. Um `--passed 8`
      // sozinho não vira "8/8, 0 falhas" — a suíte fica fora do total e é contada como parcial.
      const complete = r.total !== null ? r.passed !== null || r.failed !== null : r.passed !== null && r.failed !== null;
      if (!complete) { partial++; continue; }
      withCounts = true;
      const skipped = r.skipped ?? 0;
      const total = r.total ?? r.passed + r.failed + skipped;
      const passed = r.passed ?? total - r.failed - skipped;
      const failed = r.failed ?? total - r.passed - skipped;
      totals.passed += passed; totals.failed += failed; totals.skipped += skipped; totals.total += total;
      const agg = bySuite.get(r.suite) ?? { suite: r.suite, passed: 0, failed: 0, skipped: 0, total: 0, coverage: null };
      agg.passed += passed; agg.failed += failed; agg.skipped += skipped; agg.total += total;
      if (r.coverage !== null) agg.coverage = r.coverage;
      bySuite.set(r.suite, agg);
    }
    rows.push({ spec: s.id, title: s.title, result: last?.result ?? null, ts: last?.ts ?? null, command: last?.command ?? null, suites: suiteRows });
  }
  const specsWithTests = rows.filter((r) => r.result).length;
  const specsPassing = rows.filter((r) => r.result === 'passed').length;
  const specsFailing = rows.filter((r) => r.result === 'failed').length;
  const evalFailed = evals.reduce((n, e) => n + (e.passed !== null ? e.total - e.passed : 0), 0);
  return {
    specs: rows,
    specsWithTests,
    specsPassing,
    specsFailing,
    totals: withCounts ? totals : null,
    partialSuites: partial,
    suites: [...bySuite.values()],
    global: state.tests?.last && !state.tests.last.spec ? state.tests.last : null,
    evals,
    failedChecks: specsFailing + evalFailed,
    source: 'TEST_* em .sdd/events.jsonl (contagens em meta, quando registradas) + evals/results/*-latest.json',
  };
}
