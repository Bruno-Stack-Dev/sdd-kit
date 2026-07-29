---
description: Roda o motor inteiro (brief → specs → código) para o brief em specs/_entrada/.
---

# /gerar-projeto

Dispara o pipeline automático **brief → specs → código**.

Passos:
1. Garanta que `sdd.config.md` existe na raiz — senão, rode `/sdd-init` primeiro.
2. Leia `specs/_gerador/GERADOR.md` por completo — é o motor.
3. Execute-o do início ao fim para o brief em `specs/_entrada/`.
4. Único ponto de parada: Passo 1 do gerador (brief incompleto → pergunte só os gaps; ou
   tópico bloqueado da config seção 9 → pare e avise).
5. Caso contrário, rode sem pedir confirmação: gere specs/planos/tarefas, implemente o código
   pelas **camadas da config** (seção 5), valide com `@agente-spec-guardian` + linter, e emita
   feedback por spec.

Não recrie comandos/agentes existentes. Não avance com a suíte vermelha.
