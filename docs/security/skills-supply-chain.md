# Supply chain de skills

Nenhuma skill externa é ativada só porque existe num repositório popular. Toda skill tem, no
`skills.lock.json` (motor) ou em `.sdd/skills.lock.json` (projeto): **origem, ref, licença, hash,
risco, status do scan, data da revisão e nível de confiança**.

```bash
sdd skills info <skill-ou-pack>    # de onde veio, versão, licença, hash, scans, confiança, evals
sdd skills verify                  # hashes do disco × lock (falha se algo mudou sem revisão)
sdd pack list                      # packs, confiança, licença, ativos e alterados
```

## Níveis de confiança

| trust | Significa | Pode ativar? |
|-------|-----------|--------------|
| `core` | skill do próprio kit (MIT) | sim |
| `vendored-reviewed` | vendorizada e adaptada pelo mantenedor, com proveniência registrada | sim |
| `reviewed` | ingerida e revisada por uma pessoa (`sdd skills review --trust reviewed`) | sim |
| `quarantine` | ingerida, ainda sem revisão humana | não (só com `--force`, registrado) |
| `rejected` | reprovada no scan ou na revisão | não |

## Pipeline de ingestão

```text
skill externa
  ↓ sdd skills add <dir> --source <url> --license <SPDX> [--ref <tag|commit>]
  ├─ estrutura: spec Agent Skills (nome, descrição, campos, YAML válido)   → falha = recusa
  ├─ licença: obrigatória                                                    → ausente = recusa
  ├─ scan estático do SDD (offline): prompt injection, ocultação, unicode
  │  invisível, segredos, exfiltração, curl|sh, exec dinâmico, rede, blobs   → erro = rejected
  ├─ quarentena: pack `external` (motor) ou `.sdd/quarantine/` (projeto), inativa
  └─ lock: origem, ref, licença, hash, risco, achados
  ↓ sdd skills scan <local> --external      (Cisco skill-scanner, se instalado; senão NOT_RUN)
  ↓ leitura humana do conteúdo — obrigatória quando o risco é high (scripts com rede/exec)
  ↓ sdd skills review <nome> --trust reviewed
  ↓ sdd doctor --skills                      (spec, links, evals, hashes)
ativação
```

## Packs

`sdd pack activate <pack>` só copia o pack para `.claude/skills/` se o hash do disco bater com o
lock e a confiança não for `quarantine`/`rejected`; registra `PACK_ACTIVATED` no estado.
`sdd pack deactivate <pack>` move as cópias para `.sdd/backup/` (nada é apagado) e recusa cópias
alteradas localmente sem `--force`.

## Manutenção do lock

Mudou o conteúdo de um pack ou de uma skill núcleo? Revise o diff e rode:

```bash
sdd skills lock --update   # recalcula hashes e o scan estático; preserva origem, licença e confiança
```

O CI roda `sdd skills verify`: um PR que altera uma skill sem atualizar o lock falha — a alteração
fica visível no diff do lock.

## Limites

- O scan estático e o Cisco skill-scanner são **best-effort**: "sem achados" não prova segurança.
- O scan olha o conteúdo, não o comportamento em runtime: um script que lê `.env` via biblioteca pode
  escapar das regras — por isso o risco de skills com scripts é no mínimo `medium` e a leitura humana
  é exigida para `high`.
