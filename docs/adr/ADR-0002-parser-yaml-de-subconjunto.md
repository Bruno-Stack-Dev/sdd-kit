---
adr-id: ADR-0002
titulo: Parser YAML de subconjunto próprio, sem dependência
status: aceito
data: 2026-09-23
---

# ADR-0002: Parser YAML de subconjunto próprio, sem dependência

## Contexto
A Fase 1 torna `sdd.config.yaml` a config canônica. O kit é **copiado** para projetos de qualquer
stack (Go, Python, .NET...) e roda com `node scripts/...` sem `npm install`; o CI do kit também não
instala nada. Uma dependência npm quebraria essa propriedade em todo projeto consumidor, e vendorizar
uma biblioteca YAML completa traria ~100 KB de código de terceiros para auditar.

## Decisão
Implementar em `scripts/lib/yaml.mjs` um **subconjunto** de YAML 1.2, com erro explícito (e número de
linha) para tudo que fica fora dele:

- **Aceito:** mapas e listas em bloco (indentação por espaços), listas/mapas em fluxo numa linha,
  escalares simples e entre aspas, blocos `|`/`>` (com `-`/`+`), comentários, `---` inicial.
- **Rejeitado com erro:** tabs de indentação, âncoras/aliases, tags, chaves complexas, escalar simples
  multilinha, coleção em fluxo multilinha, chave duplicada, múltiplos documentos.

O serializador é determinístico (ordem de inserção, aspas só quando necessárias) e a propriedade
`parse(stringify(x)) == x` é testada.

## Alternativas
- **`yaml` (eemeli, ISC)** — madura, mas exige `node_modules` em cada projeto ou vendorização grande.
- **Config em JSON** — sem parser, mas sem comentários: pior para um arquivo editado por humanos que
  precisa explicar cada campo.
- **Continuar só com Markdown** — é o problema que a Fase 1 resolve.

## Consequências
- Configs que usem recursos avançados de YAML falham **cedo e com mensagem clara**, nunca com leitura
  silenciosamente errada.
- O subconjunto cobre tudo que `sdd.config.yaml`, perfis MCP e allowlists precisam.
- Se um dia o kit ganhar etapa de build/instalação, trocar por uma biblioteca é local (um módulo).
