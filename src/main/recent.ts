import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';

export const pathIdentity = (path: string): string => process.platform === 'win32' ? path.toLowerCase() : path;

/** A bounded list of paths, not document content. Calls share the application queue. */
export class RecentFiles {
  constructor(private readonly path: string) {}

  async list(): Promise<string[]> {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      if (!Array.isArray(value) || !value.every(path => typeof path === 'string' && isAbsolute(path))) throw new Error('Ungültige Liste zuletzt verwendeter Dateien.');
      return value.slice(0, 10);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async remember(path: string): Promise<void> {
    const paths = [path, ...await this.list()].filter((candidate, index, all) => all.findIndex(other => pathIdentity(other) === pathIdentity(candidate)) === index).slice(0, 10);
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(paths), { mode: 0o600 });
      await rename(temporary, this.path);
    } finally { await rm(temporary, { force: true }).catch(() => undefined); }
  }
}
