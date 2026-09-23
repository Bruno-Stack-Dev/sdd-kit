---
name: ai-structured-output-designer
description: "Projeta saídas estruturadas e chamadas de ferramenta confiáveis (JSON Schema, tool use nativo, constrained decoding, validação e reparo) e decide se vale otimizar prompts programaticamente (ex.: DSPy) — com critérios, documentação atual verificada e ADR. Acione quando pedirem: o modelo precisa devolver JSON, extração de campos, classificação em categorias fixas, validar a saída do modelo, gramática/constrained decoding, otimizar prompt automaticamente. Não acione para texto livre sem consumo por código."
license: MIT
metadata:
  sdd-pack: "ai"
  sdd-version: "3.0.0"
---

# ai-structured-output-designer

Método obrigatório: [AVALIACAO-DE-TECNOLOGIA.md](../_ai-references/AVALIACAO-DE-TECNOLOGIA.md).
Saída: seção "Saídas estruturadas" do `AI-ARCHITECTURE.md` + ADR quando adotar biblioteca.

## 1. Contrato primeiro

Toda saída consumida por código tem **schema versionado** no mesmo lugar dos contratos do projeto
(o `@agente-arquiteto-contratos` é o dono). Enum fechado para classificação; campos opcionais
explícitos; nada de "o modelo devolve algo parecido".

## 2. Mecanismo — do mais simples ao mais forte

Verifique na documentação **atual** do provedor/servidor o que existe para o modelo escolhido:

1. **Structured output / tool use nativo do provedor** com JSON Schema — normalmente a primeira
   opção. Confira limitações do subconjunto de JSON Schema suportado.
2. **Biblioteca de validação e reparo no cliente** (valida, devolve o erro ao modelo, tenta de novo
   com limite). Candidatos a verificar: Instructor, BAML, validação com Pydantic/Zod.
3. **Constrained decoding** (gramática aplicada na geração) — relevante com serving próprio.
   Candidatos a verificar: XGrammar, Outlines, suporte nativo do servidor de inferência.

Independentemente do mecanismo: **valide sempre no código** a saída contra o schema antes de usar;
saída inválida após N tentativas vira erro tratado, nunca dado aceito.

## 3. Ferramentas (tool use)

- Argumentos validados no servidor da ferramenta, não só no schema do modelo.
- Ferramenta com efeito colateral: idempotência, confirmação/gate conforme `human_gates`.
- Descrições de ferramenta são parte do prompt: revise-as como código (e desconfie de descrições
  vindas de servidores MCP de terceiros).

## 4. Otimização programática de prompts (ex.: DSPy)

Considere quando: há **dataset rotulado** e **métrica automática** confiável, o pipeline tem vários
passos de modelo e ajuste manual de prompt virou gargalo. Não considere quando não há eval — sem
métrica, otimização é ruído. Registre: dataset, métrica, custo da otimização, como o artefato
otimizado é versionado e reavaliado ao trocar de modelo.

## Qualidade

- Schema versionado e validação no código para toda saída consumida.
- Mecanismo escolhido verificado para o modelo/versão em uso, com fonte e data.
- Falha de validação tratada; efeitos colaterais com gate.
