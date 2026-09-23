// `sdd trace show [--session s] [--spec X] [--task T] [--agent A] [--trace id] [--json]`
// `sdd trace export --otlp <url> [...filtros]` — ex.: Phoenix em http://localhost:6006/v1/traces
import { UsageError, ICON } from '../lib/cli.mjs';
import { readTimeline, toOtlp } from '../lib/trace.mjs';

function filters(flags) {
  return { session: flags.session, spec: flags.spec, task: flags.task, agent: flags.agent, traceId: flags.trace };
}

export async function traceCommand({ positional, flags, root }) {
  const [sub] = positional;
  if (sub === 'show') {
    const items = readTimeline(root, filters(flags));
    if (flags.json) { console.log(JSON.stringify(items, null, 2)); return 0; }
    if (!items.length) { console.log('nenhum evento de trace para esse filtro'); return 0; }
    for (const i of items) {
      const a = i.attrs ?? {};
      const ctx = [a['sdd.spec'], a['sdd.task'], a['sdd.agent'] && `@${a['sdd.agent']}`, a['tool.name'], a['file.path'], a['policy.decision'] && `policy=${a['policy.decision']}`].filter(Boolean).join(' ');
      console.log(`${i.ts}  ${i.source === 'event' ? '◆' : '·'} ${i.name.padEnd(22)} ${i.status === 'error' ? `${ICON.error} ` : ''}${ctx}`);
    }
    return 0;
  }
  if (sub === 'export') {
    if (!flags.otlp) throw new UsageError('uso: trace export --otlp <url> (ex.: http://localhost:6006/v1/traces) [--session s] [--spec X]');
    const items = readTimeline(root, filters(flags));
    const body = toOtlp(items);
    try {
      const res = await fetch(flags.otlp, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { console.log(`${ICON.error} backend OTLP respondeu ${res.status} — trace local continua em .sdd/trace/`); return 1; }
      console.log(`${ICON.ok} ${items.length} span(s) exportados para ${flags.otlp}`);
      return 0;
    } catch (e) {
      console.log(`${ICON.warn} backend OTLP indisponível (${e.message}) — nada perdido: o trace local continua em .sdd/trace/`);
      return 1;
    }
  }
  throw new UsageError('uso: trace <show|export>');
}
