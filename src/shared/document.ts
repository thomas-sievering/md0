export interface DocumentState {
  documentId: string;
  path: string | null;
  text: string;
  dirty: boolean;
  error: string | null;
  conflict: boolean;
  notice: string | null;
  noticeRevision: number;
  recoveryAvailable: boolean;
  draftSaved: boolean;
}

export interface DocumentApi {
  openExternal(url: string): Promise<void>;
  state(): Promise<DocumentState>;
  open(): Promise<DocumentState>;
  recent(): Promise<string[]>;
  openRecent(path: string): Promise<DocumentState>;
  openDroppedFile(file: File): Promise<DocumentState>;
  newDocument(): Promise<DocumentState>;
  edit(text: string): Promise<DocumentState>;
  save(): Promise<DocumentState>;
  refresh(): Promise<DocumentState>;
  loadDiskVersion(): Promise<DocumentState>;
  saveCopy(): Promise<DocumentState>;
  restoreBackup(): Promise<DocumentState>;
  close(): Promise<DocumentState>;
  zen(enable?: boolean): Promise<boolean>;
  onCloseRequested(listener: () => void): void;
  onWindowBlurred(listener: () => void): void;
  onOpenError(listener: (message: string) => void): void;
}
