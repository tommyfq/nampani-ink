import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Local development only: loads api/.env into process.env (values already set win).
 * In Docker the variables come from docker-compose.yml and there is no .env file.
 */
const file = resolve(__dirname, '..', '.env');
if (process.env.NODE_ENV !== 'production' && existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
