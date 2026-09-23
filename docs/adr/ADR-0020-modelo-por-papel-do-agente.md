---
adr-id: ADR-0020
titulo: O kit escolhe o modelo de cada agente pelo papel, com política versionada e overrides na config
status: aceito
data: 2026-09-23
---

# ADR-0020: Modelo por papel do agente

## Contexto
Todos os subagentes herdavam o modelo da sessão. O guardião, que decide se uma spec fecha, rodava no
mesmo modelo que o gerador de dados mockados; e quem escolhia o modelo, quando alguém escolhia, era o
LLM do orquestrador, sem registro. Isso contraria o princípio do kit: o que precisa acontecer sempre
vira código determinístico.

## Decisão
1. **Política única** em `policies/model-routing.json`: cada agente tem um **papel**
   (`audit`, `design`, `build`, `verify`, `review`, `support`); cada papel tem um **nível**
   (`light` → haiku, `standard` → sonnet, `deep` → opus, com esforço low/medium/high) e um **piso**.
   Critério: o custo do erro do papel, não o tamanho da tarefa. Guardiões e contratos ficam no topo
   (uma aprovação falsa ou um contrato errado se propagam); implementação e testes no padrão; dados
   mockados de formato fixo no leve.
2. **Sinais do contexto** sobem um nível, limitado a +1: spec reprovada pelo guardião (a nova
   tentativa não repete o mesmo modelo), tarefa reaberta, spec com ≥ 10 CAs (build/verify) e tags
   `critico`/`seguranca`. Etapa com `guardian: true` roda no topo, qualquer que seja o agente.
3. **Perfil** do projeto (`agents.models.profile`): `quality` (+1), `balanced`, `economy` (−1), sem
   furar o piso — guardiões nunca descem.
4. **Precedência**: `model`/`effort` na etapa da pipeline > `agents.models.overrides` > política.
   Valores explícitos não são ajustados por perfil nem por sinais; abaixo do piso geram aviso no
   `config validate`, não erro (o projeto pode não ter acesso ao modelo mais caro).
5. **Aliases, não IDs**: a política usa `opus`/`sonnet`/`haiku`, que o Claude Code resolve para a
   versão atual; IDs completos (`claude-...`) só em override explícito.
6. **Materialização**: o frontmatter dos agentes do kit traz `model`/`effort` do perfil `balanced`,
   para chamadas avulsas (`@agente-x` fora das skills). Um teste garante que batem com a política; o
   doctor avisa quando divergem num projeto.
7. **Execução**: as skills consultam `sdd models resolve --task <ID> --json`, passam o `model` ao
   delegar e gravam `--model`/`--effort` no `TASK_STARTED` (o estado guarda o modelo usado).
   `tasks ready`/`tasks show` mostram o modelo de cada tarefa.

## Alternativas
- **Modelo só no frontmatter**: simples, mas estático — não reage a reprovação nem ao perfil, e
  obriga editar agentes (que são do motor) para ajustar um projeto.
- **O orquestrador decide caso a caso**: flexível, mas não determinístico nem auditável.
- **Classificar a tarefa pelo texto (complexidade estimada por LLM)**: mais fino, mas depende de
  julgamento a cada chamada; os sinais escolhidos são fatos do estado e da spec.

## Consequências
- O Agent tool não recebe esforço por chamada: o esforço aplicado é o do frontmatter; quando o
  resolvido difere, `sdd models resolve` registra uma nota. O modelo, esse, é passado por chamada.
- Adapters para outros clientes (Codex, OpenCode, Cline) não têm subagentes: a resolução continua
  disponível pela CLI, mas o cliente usa o próprio modelo.
- Custo previsível por perfil; `sdd models list --profile economy` simula antes de mudar a config.
