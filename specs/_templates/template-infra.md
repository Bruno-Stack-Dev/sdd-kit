---
doc-id: INFRA
titulo: Plano de Infraestrutura — <Nome>
versao: 0.1.0
status: rascunho
atualizado-em: AAAA-MM-DD
tags: [discovery, infraestrutura, devops]
---

# Plano de Infraestrutura — <Nome>

> Artefato de **discovery** (Bloco 5). Ambientes, deploy, dados e operação. Decisões que virarem
> regra permanente (ex.: "sempre Docker") entram no `sdd.config.md`; decisões pontuais viram ADR.

## Ambientes
| Ambiente | Propósito | URL/host | Dados |
|----------|-----------|----------|-------|
| dev | desenvolvimento local | localhost | mock/seed |
| homologação | testes de aceite | <host> | anonimizado |
| produção | usuários reais | <host> | reais |

## Empacotamento e deploy
- **Containerização:** <Docker / n/a>
- **Orquestração:** <Kubernetes / Compose / PaaS / n/a>
- **CI/CD:** <ex.: GitHub Actions — build → test → deploy>
- **Estratégia de release:** <blue-green / rolling / manual>

## Cloud e serviços
| Serviço | Escolha |
|---------|---------|
| Cloud | <AWS / Azure / GCP / on-prem / n/a> |
| Compute | <ex.: containers, serverless> |
| Banco gerenciado | <ex.: RDS Postgres> |
| Storage | <ex.: S3> |
| CDN | <ex.: CloudFront / n/a> |
| Cache | <ex.: Redis / n/a> |
| Fila | <ex.: SQS / RabbitMQ / n/a> |

## Dados e segurança operacional
- **Backup:** <frequência, retenção, RPO/RTO>
- **SSL/TLS:** <onde termina, renovação>
- **Segredos:** <ex.: secret manager — nunca em repo>
- **Variáveis de ambiente:** <onde vivem por ambiente>

## Observabilidade
| Sinal | Ferramenta | Alertas |
|-------|-----------|---------|
| Logs | <ex.: stack de logs> | <ex.: erro 5xx> |
| Métricas | <ex.: Prometheus> | <ex.: latência P95> |
| Traços | <ex.: OpenTelemetry / n/a> | — |

## Custos (estimativa inicial)
> <faixa esperada por ambiente/mês, se relevante>

## 📅 Histórico
| Data | Versão | Mudança |
|------|--------|---------|
| AAAA-MM-DD | 0.1.0 | Versão inicial (discovery) |
