// Executa os padrões proibidos da config (grep de ausência) de forma determinística.
// É o que o @agente-spec-guardian cita no relatório, em vez de afirmar "não encontrei".
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { walkFiles, isBinary, relPosix } from './files.mjs';
import { isPlaceholder } from './config-md.mjs';

const MAX_FILE = 2 * 1024 * 1024;
const MAX_MATCHES = 20;

/**
 * @returns [{ pattern, scope, expected, count, status: 'pass'|'fail'|'improved'|'not_run', matches, message }]
 */
export function checkForbidden(root, patterns = []) {
  return patterns.map((fp) => {
    const out = { pattern: fp.pattern, scope: fp.scope, expected: fp.expected ?? 0, count: 0, matches: [], status: 'pass', message: '' };
    if (isPlaceholder(fp.pattern) || isPlaceholder(fp.scope)) {
      return { ...out, status: 'not_run', message: 'placeholder não resolvido' };
    }
    let re;
    try { re = new RegExp(fp.pattern); } catch (e) { return { ...out, status: 'not_run', message: `regex inválida: ${e.message}` }; }
    const scopePath = join(root, fp.scope);
    if (!existsSync(scopePath)) return { ...out, status: 'not_run', message: `escopo '${fp.scope}' não existe (ainda)` };
    for (const file of walkFiles(scopePath)) {
      let st;
      try { st = statSync(file); } catch { continue; }
      if (st.size > MAX_FILE || isBinary(file)) continue;
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (re.test(line)) {
          out.count++;
          if (out.matches.length < MAX_MATCHES) out.matches.push(`${relPosix(root, file)}:${i + 1}`);
        }
      });
    }
    if (out.count > out.expected) { out.status = 'fail'; out.message = `${out.count} ocorrência(s), esperado ≤ ${out.expected}`; }
    else if (out.count < out.expected) { out.status = 'improved'; out.message = `${out.count} ocorrência(s), abaixo do esperado ${out.expected} — reduza 'expected' para travar a melhora`; }
    else out.message = `${out.count} ocorrência(s) (esperado ${out.expected})`;
    return out;
  });
}
