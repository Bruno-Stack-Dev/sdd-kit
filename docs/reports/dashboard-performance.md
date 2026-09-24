# Desempenho do dashboard (`sdd status` / `sdd dashboard`)

Gerado por `node tests/perf/dashboard.perf.mjs --report docs/reports/dashboard-performance.md` em 2026-09-24.

Ambiente: Node v24.15.0 · win32 10.0.26200 · 11th Gen Intel(R) Core(TM) i7-11800H @ 2.30GHz (16 núcleos).

Cenário sintético: 50 agentes, 100 specs, 1000 tarefas, 50 ADRs, 100000 eventos
(2200 de domínio em `.sdd/events.jsonl`, 97800 de trace em 10 sessões). Scans de segurança desligados
(`--no-scan`): o secret scan custa o mesmo que `doctor --security` e roda só no startup e no `r`.

| Medida | Resultado |
|--------|-----------|
| Startup (serviço + 1º snapshot) | 1597 ms |
| Heap usado após o snapshot | 154.0 MB (Δ 127.0 MB) |
| RSS após o snapshot | 277.7 MB |
| Atualização incremental (+1 000 registros) + snapshot | 36 ms |
| Quadro da TUI (140×50) | 3.0 ms |
| CPU ociosa com watcher (5 s) | 0.00% |
| Eventos observados | 101000 |
| Janela em memória (events.max_displayed) | 500 |

## Leitura

- O startup lê os dois logs uma vez (streaming por offset) e aplica o reducer incremental; depois
  disso cada atualização só processa os bytes novos (`JsonlTail`), sem reler o log inteiro.
- A memória fica limitada: a janela de eventos (`events.max_displayed`), a linha do tempo por
  agente (100) e a tabela de arquivos (5 000) são buffers fixos; o resto são contadores.
- Ocioso, o dashboard só faz `stat` periódico (padrão 1 s) além do `fs.watch`; o custo de CPU
  medido acima inclui esse stat e o timer do relógio.
