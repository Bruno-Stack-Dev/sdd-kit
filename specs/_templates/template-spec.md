---
spec-id: <PREFIXO>NNN
titulo: <Título descritivo e específico>
versao: 0.1.0
status: rascunho            # rascunho | implementada | aprovada | arquivada
autor: <email>
criado-em: AAAA-MM-DD
atualizado-em: AAAA-MM-DD
tipo: feature
cas: 0                      # contagem de Critérios de Aceitação (atualize ao escrever)
depende-de: []              # ex.: [<PREFIXO>NNN]
tags: []
---

# <PREFIXO>NNN: <Título>

## 📌 Resumo Executivo

> Em 1-3 parágrafos: o que será construído, para quem e por quê. Se alguém ler só isto, deve
> decidir se continua lendo.

## 🎯 Contexto e Motivação

- **Problema atual:** <descreva, com evidência se houver>
- **Por que agora:** <o que muda se adiar>
- **Histórico relevante:** <ADRs/specs relacionadas>

## ✅ Objetivos
1. <objetivo mensurável>

## ❌ Não-Objetivos
1. <limite explícito de escopo>

## 📋 Requisitos

### Funcionais
- **RF-01**: <o que o sistema deve fazer>

### Não-Funcionais
- **RNF-01**: <performance, segurança, escala, acessibilidade>

## 🏗️ Design Proposto

### Visão geral
> <abordagem em texto curto>

### Modelo de dados
```ts
// tipos/contratos (a fonte da verdade — ver sdd.config.md seção 3)
```

### Máquina de estados (se aplicável)
> <estados e transições; marque os estados terminais>

### Gates de controle humano (se aplicável)
> Qual decisão exige confirmação humana, qual o setter único permitido, e qual invariante
> prova que não há caminho alternativo. (Ver `sdd.config.md` seção 8.)

### Dados sensíveis (se aplicável)
> O que é sensível e como é filtrado antes de sair da camada de estado.

## ✅ Critérios de Aceitação

> Cada CA precisa virar **ao menos um teste**. Numere-os; mantenha `cas:` no frontmatter sincronizado.

- **CA-01**: <comportamento verificável>
- **CA-02**: <comportamento verificável>

## ⚠️ Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| <risco> | B/M/A | <mitigação> |

## 🔒 Segurança e Privacidade
> Dados sensíveis envolvidos, conformidade (LGPD/GDPR), threat model curto.

## 🧩 Decisões assumidas
> Defaults da config adotados por ausência no brief (preenchido pelo gerador).

## ❓ Questões em Aberto
- [ ] <questão a resolver antes de aprovar>

## 📅 Histórico
| Data | Versão | Mudança |
|------|--------|---------|
| AAAA-MM-DD | 0.1.0 | Versão inicial |
