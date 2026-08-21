import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class JsonStore {
  constructor(path) { this.path = path; }
  async load(fallback) {
    try { return { ...fallback, ...JSON.parse(await readFile(this.path, 'utf8')) }; }
    catch { return structuredClone(fallback); }
  }
  async save(value) {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = this.path + '.tmp';
    await writeFile(temporary, JSON.stringify(value, null, 2));
    await rename(temporary, this.path);
  }
}
