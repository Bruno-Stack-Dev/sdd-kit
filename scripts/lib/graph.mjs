// Grafo de tarefas (DAG) e grafo de dependência entre specs.
// Detecta: dependência inexistente (órfã), ciclo, agente desconhecido, ID duplicado, arquivo de
// tarefas sem spec. Calcula tarefas prontas respeitando status e dependências.

/** Busca um ciclo num grafo { id: [deps] }. Devolve o caminho do ciclo ou null. */
export function findCycle(adjacency) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(Object.keys(adjacency).map((k) => [k, WHITE]));
  const stack = [];
  const visit = (n) => {
    color.set(n, GRAY);
    stack.push(n);
    for (const d of adjacency[n] ?? []) {
      if (!color.has(d)) continue; // dependência inexistente é reportada à parte
      if (color.get(d) === GRAY) return [...stack.slice(stack.indexOf(d)), d];
      if (color.get(d) === WHITE) {
        const c = visit(d);
        if (c) return c;
      }
    }
    stack.pop();
    color.set(n, BLACK);
    return null;
  };
  for (const n of Object.keys(adjacency).sort()) {
    if (color.get(n) === WHITE) {
      const c = visit(n);
      if (c) return c;
    }
  }
  return null;
}

/** Ordem topológica estável (dependências primeiro). Ignora arestas para nós inexistentes. */
export function topoOrder(adjacency) {
  const order = [];
  const seen = new Set();
  const visit = (n, path = new Set()) => {
    if (seen.has(n) || path.has(n)) return;
    path.add(n);
    for (const d of [...(adjacency[n] ?? [])].sort()) if (d in adjacency) visit(d, path);
    path.delete(n);
    seen.add(n);
    order.push(n);
  };
  for (const n of Object.keys(adjacency).sort()) visit(n);
  return order;
}

/**
 * Valida o grafo de tarefas.
 * @param taskFiles  saída de loadTasks()
 * @param specs      saída de loadSpecs()
 * @param agents     Set de agentes conhecidos
 * @returns { tasks: Map, errors: [{path, message}], warnings }
 */
export function buildTaskGraph(taskFiles, specs, agents) {
  const errors = [];
  const warnings = [];
  const tasks = new Map();
  const specIds = new Set(specs.map((s) => s.id).filter(Boolean));

  for (const f of taskFiles) {
    if (!f.spec) errors.push({ path: f.file, message: "arquivo de tarefas sem 'tarefas-de' no frontmatter" });
    else if (!specIds.has(f.spec)) errors.push({ path: f.file, message: `tarefas de '${f.spec}', mas essa spec não existe (órfão)` });
    for (const m of f.malformed) {
      errors.push({ path: `${f.file}:${m.line}`, message: `linha de tarefa fora da gramática '- [ ] [T-NNN] descrição (@agente-x) 🔒 T-NNN': ${m.text}` });
    }
    for (const t of f.tasks) {
      if (tasks.has(t.id)) {
        errors.push({ path: `${t.file}:${t.line}`, message: `ID de tarefa duplicado '${t.id}'` });
        continue;
      }
      tasks.set(t.id, t);
      if (agents && agents.size && !agents.has(t.agent)) {
        errors.push({ path: `${t.file}:${t.line}`, message: `agente '@${t.agent}' não existe em .claude/agents/` });
      }
    }
  }
  for (const t of tasks.values()) {
    for (const d of t.dependsOn) {
      if (!tasks.has(d)) errors.push({ path: `${t.file}:${t.line}`, message: `${t.id} depende de '${d}', que não existe` });
      if (d === t.id) errors.push({ path: `${t.file}:${t.line}`, message: `${t.id} depende de si mesma` });
    }
  }
  const adjacency = Object.fromEntries([...tasks.values()].map((t) => [t.id, t.dependsOn]));
  const cycle = findCycle(adjacency);
  if (cycle) errors.push({ path: 'specs/tasks', message: `ciclo de dependência entre tarefas: ${cycle.join(' → ')}` });
  return { tasks, adjacency, errors, warnings };
}

export function buildSpecGraph(specs) {
  const errors = [];
  const byId = new Map();
  for (const s of specs) {
    if (!s.id) continue;
    if (byId.has(s.id)) errors.push({ path: s.file, message: `spec-id duplicado '${s.id}' (também em ${byId.get(s.id).file})` });
    else byId.set(s.id, s);
  }
  for (const s of byId.values()) {
    for (const d of s.dependsOn) if (!byId.has(d)) errors.push({ path: s.file, message: `depende-de '${d}', que não existe` });
  }
  const adjacency = Object.fromEntries([...byId.values()].map((s) => [s.id, s.dependsOn]));
  const cycle = findCycle(adjacency);
  if (cycle) errors.push({ path: 'specs', message: `ciclo de dependência entre specs: ${cycle.join(' → ')}` });
  return { specs: byId, adjacency, errors };
}

/**
 * Tarefas prontas: status `pending` com todas as dependências `completed` ou `cancelled`.
 * `statusOf(id)` devolve o status efetivo (estado estruturado > checkbox do Markdown).
 */
export function readyTasks(graph, statusOf) {
  const done = (id) => ['completed', 'cancelled'].includes(statusOf(id));
  return [...graph.tasks.values()]
    .filter((t) => statusOf(t.id) === 'pending' && t.dependsOn.every(done))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Grupos de tarefas prontas que podem rodar em paralelo sem conflito. Conservador: tarefas do mesmo
 * agente na mesma spec ficam em série (tendem a tocar os mesmos arquivos).
 */
export function parallelBatches(ready) {
  const batches = [];
  const used = new Set();
  for (const t of ready) {
    const key = `${t.spec}::${t.agent}`;
    if (used.has(key)) continue;
    used.add(key);
    batches.push(t);
  }
  return batches;
}
