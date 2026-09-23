---
adr-id: ADR-0003
titulo: sdd.config.yaml é a config canônica; sdd.config.md vira visão gerada
status: aceito
data: 2026-09-23
---

# ADR-0003: `sdd.config.yaml` canônico, `sdd.config.md` gerado

## Contexto
No v2 a config era um Markdown com tabelas lido pelo LLM. Só as seções 7 e 8 eram checadas (por
regex de placeholder); comandos, paths, pipelines e agentes podiam estar errados sem que nada
reclamasse até a implementação falhar.

## Decisão
1. `sdd.config.yaml` é a **única autoridade** da config do projeto, validada por
   `schemas/sdd-config.schema.json` + checagens semânticas (`scripts/lib/config.mjs`): placeholders
   em seções críticas, regex inválidas, agentes inexistentes/desativados, IDs de etapa duplicados.
2. `sdd.config.md` passa a ser **visão gerada** (`sdd config render`), com cabeçalho
   `AUTO-GENERATED — DO NOT EDIT DIRECTLY` e as mesmas seções numeradas 1–12 do v2. Blocos sem tabela
   equivalente (segurança, integrações, IA) saem numa seção 13 em YAML. Agentes que citam
   "config seção N" continuam corretos.
3. Projetos v2 continuam funcionando: sem YAML, o `.md` legado é lido e migrado **em memória**, com
   aviso. `sdd config migrate` grava o YAML, guarda o `.md` original em `.sdd/backup/` e o troca pela
   visão gerada. Seções desconhecidas do `.md` legado vão para `legacy.sections` (nada é descartado).
4. As seções 5/5-B/5-C viram `pipelines.frontend|backend|delivery`, mas o formato aceita pipelines
   arbitrárias (base da Fase 15).
5. O `sdd-lint` (fast path que o motor já roda no Passo 0) passa a validar o YAML: config inválida é
   rejeitada antes de qualquer geração de código.

## Alternativas
- **Manter os dois formatos editáveis** — duas autoridades divergem; rejeitada.
- **Gerar o YAML a partir do Markdown** — manteria o parse frágil de tabelas como caminho principal.

## Consequências
- O round-trip `yaml → md → yaml` é testado; a visão desatualizada é detectada (`render --check`).
- Comentários do YAML não aparecem na visão Markdown (a visão traz as notas fixas de cada seção).
- `sdd.config.example.yaml` é o exemplo canônico; `sdd.config.example.md` é gerado dele e testado
  como "em dia".
