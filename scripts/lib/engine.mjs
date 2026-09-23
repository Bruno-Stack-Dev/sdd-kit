// Identidade do motor: raiz, versão e versões de formato suportadas.
import { fileURLToPath } from 'node:url';

/** Raiz do motor (o diretório que contém scripts/, schemas/, .claude/...). No modo cópia é a raiz
 *  do projeto; no modo plugin é o diretório do plugin instalado. */
export const ENGINE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const ENGINE_VERSION = '3.0.0-dev';

/** Versão MAJOR do formato de sdd.config.yaml que este motor entende. */
export const CONFIG_SCHEMA_VERSION = 3;
