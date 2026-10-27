import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import type { DocumentState } from '../shared/document';
import { DraftStore } from './drafts';

export class DocumentSession {
  private path: string | null = null;
  private text = '';
  private savedText = '';
  private error: string | null = null;
  private fingerprint = '';
  private conflict = false;
  private notice: string | null = null;
  private noticeRevision = 0;

  private notify(message: string) {
    this.notice = message;
    this.noticeRevision++;
  }
  private recoveryAvailable = false;

  private draftId: string = randomUUID();
  private draftSaved = false;
  private readonly drafts: DraftStore | null;

  constructor(private readonly recoveryDirectory?: string, draftDirectory?: string) {
    this.drafts = draftDirectory ? new DraftStore(draftDirectory) : null;
  }

  async startup(): Promise<DocumentState> {
    try {
      const recovery = await this.drafts?.latest();
      const draft = recovery?.draft;
      if (draft) {
        this.draftId = draft.id;
        this.text = draft.text;
        this.draftSaved = true;
      }
      if (recovery?.warning) this.reportError('Entwurf wiederherstellen fehlgeschlagen', new Error(recovery.warning));
    } catch (error) { this.reportError('Entwurf wiederherstellen fehlgeschlagen', error); }
    return this.recoveryState();
  }

  async persistDraft(): Promise<DocumentState> {
    if (this.path || !this.drafts || this.draftSaved) return this.state();
    try {
      await this.drafts.write(this.draftId, this.text);
      this.draftSaved = true;
      this.error = null;
    } catch (error) { this.reportError('Lokale Entwurfssicherung fehlgeschlagen', error); }
    return this.state();
  }

  private backupPrefix() {
    return createHash('sha256').update(this.path ?? '').digest('hex') + '-';
  }

  private async latestBackup(): Promise<string | null> {
    if (!this.recoveryDirectory) return null;
    let names: string[];
    try { names = await readdir(this.recoveryDirectory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const name = names.filter(name => /^[a-f0-9]{64}-\d+-[a-f0-9-]+\.json$/.test(name) && (!this.path || name.startsWith(this.backupPrefix())))
      .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1])).at(-1);
    return name ? join(this.recoveryDirectory, name) : null;
  }

  async recoveryState(): Promise<DocumentState> {
    try { this.recoveryAvailable = Boolean(await this.latestBackup()); }
    catch (error) { this.reportError('Lokale Sicherung nicht erreichbar', error); }
    return this.state();
  }

  private async protectLocalText() {
    if (!this.recoveryDirectory) throw new Error('Kein lokaler Sicherungsort verfügbar.');
    await mkdir(this.recoveryDirectory, { recursive: true });
    const latest = await this.latestBackup();
    const timestamp = Math.max(Date.now(), latest ? Number(basename(latest).split('-')[1]) + 1 : 0);
    const target = join(this.recoveryDirectory, `${this.backupPrefix()}${timestamp}-${randomUUID()}.json`);
    const temporary = `${target}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify({ path: this.path, text: this.text }), 'utf8');
        await file.sync();
      } finally { await file.close(); }
      await rename(temporary, target);
      this.recoveryAvailable = true;
    } finally { await rm(temporary, { force: true }).catch(() => undefined); }
  }

  async loadDiskVersion(): Promise<DocumentState> {
    if (!this.path) return this.state();
    try {
      await this.protectLocalText();
      // Read after the durable backup, never use a stale watcher snapshot.
      const version = await this.diskVersion(this.path);
      new TextDecoder('utf-8', { fatal: true }).decode(version.bytes);
      this.text = this.savedText = version.bytes.toString('utf8');
      this.fingerprint = version.fingerprint;
      this.conflict = false;
      this.error = null;
      this.notify('Dateiversion geladen; lokaler Stand im Menü wiederherstellbar');
    } catch (error) { this.reportError('Dateiversion laden fehlgeschlagen', error); }
    return this.state();
  }

  async restoreBackup(
    confirmDiscard: () => Promise<boolean> = async () => false,
    canRestorePath: (path: string) => Promise<boolean> = async () => true,
  ): Promise<DocumentState> {
    if (!await this.canLeave(confirmDiscard)) return this.state();
    try {
      const path = await this.latestBackup();
      if (!path) throw new Error('Keine lokale Sicherung für diese Datei vorhanden.');
      const backup: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (!backup || typeof backup !== 'object' || !('path' in backup) || typeof backup.path !== 'string' || !isAbsolute(backup.path) || (this.path !== null && backup.path !== this.path) || !('text' in backup) || typeof backup.text !== 'string') {
        throw new Error('Ungültige lokale Sicherung.');
      }
      // The application owns path/window identity; approve before adopting it.
      if (!await canRestorePath(backup.path)) return this.state();
      if (!this.path) {
        // Startup recovery must not depend on an accessible/valid original.
        this.path = backup.path;
        try {
          const disk = await this.diskVersion(backup.path);
          new TextDecoder('utf-8', { fatal: true }).decode(disk.bytes);
          this.savedText = disk.bytes.toString('utf8');
          this.fingerprint = disk.fingerprint;
          this.conflict = false;
        } catch {
          this.savedText = '';
          this.fingerprint = '';
          this.conflict = true;
        }
      }
      this.text = backup.text;
      this.notify('Lokale Sicherung wiederhergestellt; noch nicht gespeichert');
      this.error = null;
      await this.refresh();
    } catch (error) { this.reportError('Wiederherstellen fehlgeschlagen', error); }
    return this.state();
  }

  private async diskVersion(path: string) {
    const file = await open(path, 'r');
    try {
      const bytes = await file.readFile();
      const info = await file.stat({ bigint: true });
      return { bytes, fingerprint: `${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}:${bytes.toString('base64')}` };
    } finally {
      await file.close();
    }
  }

  state(): DocumentState {
    return { documentId: this.path ?? this.draftId, path: this.path, text: this.text, dirty: this.text !== this.savedText, error: this.error, conflict: this.conflict, notice: this.notice, noticeRevision: this.noticeRevision, recoveryAvailable: this.recoveryAvailable, draftSaved: !this.path && this.draftSaved };
  }

  async canLeave(confirm: () => Promise<boolean> = async () => false): Promise<boolean> {
    if (!this.path && this.drafts) {
      await this.persistDraft();
      return this.draftSaved;
    }
    return this.canDiscard(confirm);
  }

  async newDocument(confirm: () => Promise<boolean> = async () => false): Promise<DocumentState> {
    if (!await this.canLeave(confirm)) return this.state();
    this.path = null;
    this.text = this.savedText = '';
    this.fingerprint = '';
    this.conflict = false;
    this.error = this.notice = null;
    this.draftId = randomUUID();
    this.draftSaved = false;
    return this.recoveryState();
  }

  async canDiscard(confirm: () => Promise<boolean>): Promise<boolean> {
    return !this.state().dirty || await confirm();
  }

  async open(path: string, confirmDiscard: () => Promise<boolean> = async () => false): Promise<DocumentState> {
    if (!await this.canLeave(confirmDiscard)) return this.state();
    try {
      const resolved = await realpath(path);
      const version = await this.diskVersion(resolved);
      // Validate without stripping a UTF-8 BOM; never silently corrupt other encodings.
      new TextDecoder('utf-8', { fatal: true }).decode(version.bytes);
      this.text = version.bytes.toString('utf8');
      this.fingerprint = version.fingerprint;
      this.savedText = this.text;
      this.path = resolved;
      this.error = null;
      this.conflict = false;
      this.notice = null;
      this.recoveryAvailable = Boolean(await this.latestBackup());
    } catch (error) {
      this.reportError('Öffnen fehlgeschlagen', error);
    }
    return this.state();
  }

  async refresh(): Promise<DocumentState> {
    if (!this.path) return this.state();
    try {
      const version = await this.diskVersion(this.path);
      if (version.fingerprint === this.fingerprint) return this.state();
      if (this.state().dirty || this.conflict) {
        this.conflict = true;
        this.error = 'Konflikt: Die Datei wurde extern geändert. Lokaler Text bleibt erhalten.';
      } else {
        new TextDecoder('utf-8', { fatal: true }).decode(version.bytes);
        this.text = this.savedText = version.bytes.toString('utf8');
        this.fingerprint = version.fingerprint;
        this.error = null;
        this.notify('Datei extern aktualisiert');
      }
    } catch (error) {
      this.conflict = true;
      this.reportError('Datei nicht erreichbar', error);
    }
    return this.state();
  }

  reportError(action: string, error: unknown): DocumentState {
    this.error = `${action}: ${error instanceof Error ? error.message : String(error)}`;
    return this.state();
  }

  edit(text: string): DocumentState {
    this.text = text;
    this.draftSaved = false;
    return this.state();
  }

  private async publishNewFile(path: string) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(this.text, 'utf8');
        await file.sync();
      } finally { await file.close(); }
      // Existing targets are never replaced, even after picker approval.
      await link(temporary, path);
      // Removing our staging hard link changes ctime: fingerprint only afterward.
      await rm(temporary);
    } finally { await rm(temporary, { force: true }).catch(() => undefined); }
  }

  async saveCopy(path: string | null): Promise<DocumentState> {
    if (!path || !this.path) return this.state();
    try {
      let destination: string;
      try { destination = await realpath(path); }
      catch { destination = join(await realpath(dirname(resolve(path))), basename(path)); }
      const identity = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
      if (identity(destination) === identity(this.path)) throw new Error('Als Kopie einen anderen Speicherort als das Original wählen.');
      await this.publishNewFile(path);
      this.error = null;
      this.notify('Eigene Fassung als Kopie gespeichert; Original bleibt im Konflikt');
    } catch (error) { this.reportError('Kopie speichern fehlgeschlagen (neuen Dateinamen wählen)', error); }
    return this.state();
  }

  async saveDraft(path: string | null): Promise<DocumentState> {
    if (!path || this.path) return this.state();
    try {
      await this.publishNewFile(path);
      const resolved = await realpath(path);
      const written = await this.diskVersion(resolved);
      if (!written.bytes.equals(Buffer.from(this.text, 'utf8'))) throw new Error('Die neue Datei wurde extern geändert. Entwurf bleibt erhalten.');
      await this.drafts?.remove(this.draftId);
      this.path = resolved;
      this.savedText = this.text;
      this.fingerprint = written.fingerprint;
      this.error = null;
      this.conflict = false;
      this.notice = null;
      this.recoveryAvailable = Boolean(await this.latestBackup());
    } catch (error) { this.reportError('Speichern fehlgeschlagen (neuen Dateinamen wählen)', error); }
    return this.state();
  }

  async save(): Promise<DocumentState> {
    if (!this.path) return this.state();
    const path = this.path;
    const text = this.text;
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const matches = async () => (await this.diskVersion(path)).fingerprint === this.fingerprint;
      if (this.conflict || !await matches()) {
        this.conflict = true;
        throw new Error('Konflikt: Die Datei wurde extern geändert. Lokaler Text bleibt erhalten.');
      }
      if (!this.state().dirty) { this.error = null; return this.state(); }
      const info = await stat(path);
      const file = await open(temporary, 'wx', info.mode);
      try {
        await file.writeFile(text, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      if (!await matches()) {
        this.conflict = true;
        throw new Error('Konflikt: Die Datei wurde während des Speicherns geändert.');
      }
      await rename(temporary, path);
      const written = await this.diskVersion(path);
      if (!written.bytes.equals(Buffer.from(text, 'utf8'))) {
        this.conflict = true;
        throw new Error('Konflikt: Die Datei wurde direkt nach dem Speichern extern geändert.');
      }
      this.fingerprint = written.fingerprint;
      this.savedText = text;
      this.error = null;
    } catch (error) {
      this.error = `Speichern fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
    return this.state();
  }
}
