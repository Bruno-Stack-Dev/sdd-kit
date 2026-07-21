# /implementar-tarefa T-XXX

Implementa uma tarefa do board de `specs/tasks/`.

Passos:
1. Localize a tarefa `T-XXX` e identifique o `@agente-*` responsável (e a camada da config seção 5).
2. Leia a spec mãe, o plano e o `sdd.config.md`.
3. Atue como aquele agente, seguindo suas regras em `.claude/agents/` e as regras inegociáveis
   da config (seção 6).
4. Respeite stack, paths e gates declarados na config — não introduza tecnologia fora dela.
5. Acione `@agente-spec-guardian` para validar antes de concluir (greps de ausência = 0).
6. Marque a tarefa `[x]` e atualize a spec se houve divergência.
