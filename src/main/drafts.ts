import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

interface Draft { id: string; text: string; updatedAt: number }

/** Private recovery records, not a user-facing note collection. */
export class DraftStore {
  private lastUpdate = 0;
  constructor(private readonly directory: string) {}

  async latest(): Promise<{ draft: Draft | null; warning: string | null }> {
    let names: string[];
    try { names = await readdir(this.directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { draft: null, warning: null };
      throw error;
    }
    const drafts: Draft[] = [];
    const unreadable: string[] = [];
    for (const name of names.filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
      try {
        const draft: unknown = JSON.parse(await readFile(join(this.directory, name), 'utf8'));
        if (!draft || typeof draft !== 'object' || !('id' in draft) || draft.id !== name.slice(0, -5) || !('text' in draft) || typeof draft.text !== 'string' || !('updatedAt' in draft) || typeof draft.updatedAt !== 'number' || !Number.isFinite(draft.updatedAt)) {
          throw new Error('Ungültiger lokaler Entwurf.');
        }
        this.lastUpdate = Math.max(this.lastUpdate, draft.updatedAt);
        if (draft.text) drafts.push({ id: name.slice(0, -5), text: draft.text, updatedAt: draft.updatedAt });
      } catch { unreadable.push(name); }
    }
    return {
      draft: drafts.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null,
      warning: unreadable.length ? `Unlesbare Entwürfe bleiben unverändert: ${unreadable.join(', ')}. Andere gültige Entwürfe werden weiterhin geladen.` : null,
    };
  }

  async write(id: string, text: string): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const target = join(this.directory, `${id}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    this.lastUpdate = Math.max(Date.now(), this.lastUpdate + 1);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify({ id, text, updatedAt: this.lastUpdate }), 'utf8');
        await file.sync();
      } finally { await file.close(); }
      await rename(temporary, target);
    } finally { await rm(temporary, { force: true }).catch(() => undefined); }
  }

  async remove(id: string): Promise<void> {
    await rm(join(this.directory, `${id}.json`), { force: true });
  }
}
