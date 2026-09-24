// Autonomia operacional: quantas ações observadas pelos hooks foram executadas sem intervenção
// humana. NÃO é métrica de qualidade — uma ação autônoma pode estar errada.
//
//   ações         = invocações de ferramenta observadas, cada uma contada uma vez:
//                   tool.called (PreToolUse permitiu)
//                 + policy.decision deny, e ask com tool_use_id
//                 + conclusões (tool.completed/file.modified) sem tool.called/decisão pareada
//                   pelo tool_use_id — trace gravado antes do tool.called existir
//   autônomas     = ações − confirmações pedidas (ask) − bloqueios (deny)
//   autonomia (%) = autônomas / ações
//
// Trace antigo, `ask` sem tool_use_id: se aprovado, a ação aparece como conclusão sem par (conta
// uma vez); se recusado pelo humano, não há ação a contar, mas a confirmação é descontada — nesse
// caso a autonomia sai um pouco MENOR que a real (erro para o lado conservador). Confirmações
// pedidas pelo próprio Claude Code, fora da política do SDD, não são observáveis.

export const AUTONOMY_FORMULA = 'autônomas = ações − confirmações (ask) − bloqueios (deny); % = autônomas / ações';

export function autonomyMetrics(a) {
  const actions = a.called + a.deny + a.askWithId + a.unpaired;
  const human = a.ask;
  const blocked = a.deny;
  const auto = Math.max(0, actions - human - blocked);
  const legacy = a.unpaired > 0;
  return {
    actions,
    autoApproved: auto,
    humanApprovals: human,
    policyBlocked: blocked,
    percent: actions ? Math.round((auto / actions) * 1000) / 10 : null,
    available: actions > 0,
    source: !actions ? 'trace vazio' : a.called ? `trace: tool.called + policy.decision${legacy ? ` + ${a.unpaired} conclusão(ões) sem par (trace anterior ao tool.called)` : ''}` : 'trace: tool.completed + policy.decision (trace anterior ao tool.called)',
    formula: AUTONOMY_FORMULA,
    note: 'confirmações pedidas pelo próprio Claude Code, fora da política do SDD, não são observáveis',
  };
}
