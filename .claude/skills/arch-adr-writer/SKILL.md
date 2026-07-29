---
name: arch-adr-writer
description: Escreve um Architecture Decision Record preservando contexto, opções consideradas, racional e consequências. Acione quando pedirem: registrar uma decisão de arquitetura, escrever um ADR, documentar por que escolhemos X em vez de Y, formalizar um trade-off já decidido. Não acione para comparar opções ainda abertas — use arch-tradeoff-analysis-writer primeiro.
pack: "software-architecture-pack"
purpose: "Write an architecture decision record that preserves context, options considered, rationale, and consequences."
inputs: ["decision to capture", "drivers and constraints", "options considered", "outcome and consequences"]
outputs: ["ADR draft", "open questions", "follow-up actions", "traceable decision summary"]
handoffs: ["arch-tradeoff-analysis-writer", "arch-deployment-view-writer", "arch-architecture-risk-assessor"]
---
# adr-writer

## Purpose
Write an architecture decision record that preserves context, options considered, rationale, and consequences.

## SDD Kit integration
Neste kit, ADRs **não** usam um formato próprio: use o template `specs/_templates/template-adr.md`
e grave o resultado em `specs/decisions/ADR-NNN-<slug>.md` (numeração sequencial do projeto). O
`@agente-arquiteto-guardian` depois fiscaliza que o código respeita cada ADR aceito — então
escreva a decisão de forma **verificável** (regras que virem checagem: "borda não importa
repositório", "REST, não GraphQL"). Não duplique o conteúdo do discovery: referencie
`specs/discovery/ARQUITETURA.md` em vez de repetir o C4.

## Expected inputs
- decision to capture
- drivers and constraints
- options considered
- outcome and consequences

## Deliverables
- ADR draft
- open questions
- follow-up actions
- traceable decision summary

## Trigger this skill when
- You need to move from vague architectural preference to explicit design reasoning.
- Structural decisions, boundaries, or quality goals are unclear or contested.
- A team needs an architecture artifact, critique, or decision record that can drive implementation.

## Operating procedure
1. Clarify the decision or structure this skill is meant to address.
2. Separate facts, assumptions, constraints, and desired quality outcomes.
3. Produce concrete structure or analysis tied to this system context.
4. Make tradeoffs and uncertainty explicit instead of hiding them behind generic architecture language.
5. Recommend the next most useful architecture artifact or decision step.

## Quality gates
- Recommendations are tied to system context and drivers.
- Assumptions and unknowns are visible.
- Operational and deployment consequences are not ignored when relevant.
- Findings are concrete enough to influence implementation or governance.

## Output style
- Be concrete and structured.
- Prefer architecture rationale over buzzwords.
- Separate evidence, inference, and recommendation.
- Use priority or severity when useful.

## Failure modes to avoid
- Do not recommend a style because it sounds modern.
- Do not hide uncertainty behind definitive language.
- Do not ignore team size, ownership, or operational cost.
- Do not produce diagrams or structure with no stated purpose.

## Minimum output skeleton
```md
## Summary
## Findings or proposal
## Evidence vs assumptions
## Risks or tradeoffs
## Recommended next skill
```

## Handoff targets
- tradeoff-analysis-writer
- deployment-view-writer
- architecture-risk-assessor
