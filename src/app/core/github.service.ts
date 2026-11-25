import { Injectable, computed, signal } from '@angular/core';
import { DataError, githubMessage } from './data-error';
import { ResumeDocument } from './models';
import { asDataDocument } from './resume-schema';

const OWNER = 'adminproac';
const REPO = 'HojaDeVida';
const BRANCH = 'main';
const DATA_PATH = 'Data/resume-data.json';
const TOKEN_KEY = 'resume-admin.githubToken';

export function readLegacyToken(): string | null {
  try {
    const value = localStorage.getItem(TOKEN_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function clearLegacyToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}
const API = 'https://api.github.com';
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${DATA_PATH}`;

/**
 * Reads and writes Data/resume-data.json on GitHub.
 * The decrypted token lives only in memory for this tab. An older localStorage copy is removed on load.
 */
@Injectable({ providedIn: 'root' })
export class GithubService {
  constructor() { clearLegacyToken(); }
  readonly token = signal<string | null>(null);
  readonly hasToken = computed(() => !!this.token());
  readonly connected = signal(false);
  readonly checking = signal(false);
  readonly testOk = signal(false);
  /** true/false when the repo payload includes permissions.push; null when it does not. */
  readonly pushAccess = signal<boolean | null>(null);
  readonly connectionError = signal<string | null>(null);
  readonly lastCommitUrl = signal<string | null>(null);
  readonly lastCommitSha = signal<string | null>(null);

  private latest: ResumeDocument | null = null;
  private returnLatestOnce = false;
  /** Bumped after a commit so an in-flight "last commit" lookup cannot overwrite the new link. */
  private commitEpoch = 0;

  /** Decrypted token for this tab only. It is never written to localStorage. */
  useMemoryToken(value: string | null) {
    const token = value?.trim() || null;
    this.token.set(token);
    if (!token) {
      this.connected.set(false);
      this.testOk.set(false);
      this.pushAccess.set(null);
    }
  }

  setToken(value: string) {
    this.useMemoryToken(value);
    this.connected.set(false);
    this.testOk.set(false);
  }

  clearToken() {
    clearLegacyToken();
    this.useMemoryToken(null);
    this.connectionError.set(null);
  }

  /**
   * Fine-grained tokens are accepted when GET /repos/{owner}/{repo} returns 200.
   * permissions.push is reported when present. permissions.contents is not required.
   */
  async testConnection(candidate?: string): Promise<void> {
    const typed = candidate?.trim() ?? '';
    const token = typed || this.token() || '';
    if (!token) {
      this.connected.set(false);
      this.testOk.set(false);
      const message = '401 — Bad credentials';
      this.connectionError.set(message);
      throw new DataError(401, message);
    }
    this.checking.set(true);
    try {
      const res = await fetch(`${API}/repos/${OWNER}/${REPO}`, { headers: this.headers(token), cache: 'no-store' });
      const body = await readBody(res);
      const testingStored = !typed || token === this.token();
      if (!res.ok) {
        if (testingStored) this.connected.set(false);
        this.testOk.set(false);
        const message = githubMessage(res.status, body);
        this.connectionError.set(message);
        throw new DataError(res.status, message);
      }
      const push = body?.permissions?.push;
      this.pushAccess.set(typeof push === 'boolean' ? push : null);
      this.connectionError.set(null);
      this.testOk.set(true);
      if (testingStored) this.connected.set(true);
    } finally {
      this.checking.set(false);
    }
  }

  async getData(): Promise<ResumeDocument> {
    if (this.returnLatestOnce && this.latest) {
      this.returnLatestOnce = false;
      return this.latest;
    }
    try {
      const current = await this.fetchContents(!!this.token());
      this.latest = current.doc;
    } catch (contentsError) {
      const res = await fetch(`${RAW}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        if (contentsError instanceof DataError) throw contentsError;
        throw new DataError(res.status, githubMessage(res.status, { message: 'Could not read Data/resume-data.json' }));
      }
      const text = (await res.text()).replace(/^\uFEFF/, '');
      this.latest = asDataDocument(JSON.parse(text) as ResumeDocument);
    }
    void this.refreshLastCommit();
    return this.latest;
  }

  /** GET the file sha, apply `mutator`, PUT. On 409, repeat once with a fresh sha. */
  async update<T>(mutator: (doc: ResumeDocument) => T, message: string): Promise<T> {
    const token = this.token();
    if (!token) {
      throw new DataError(401, '401 — Se requiere un token de GitHub para guardar. / A GitHub token is required to save.');
    }
    let lastConflict: DataError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await this.fetchContents(true);
      const doc = structuredClone(current.doc);
      const result = mutator(doc);
      asDataDocument(doc);
      doc.meta.lastUpdated = new Date().toISOString();
      const res = await fetch(this.contentsUrl(), {
        method: 'PUT',
        headers: { ...this.headers(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          content: encodeBase64(JSON.stringify(doc, null, 2) + '\n'),
          sha: current.sha,
          branch: BRANCH,
        }),
      });
      const body = await readBody(res);
      if (res.status === 409 && attempt === 0) {
        lastConflict = new DataError(409, githubMessage(409, body));
        continue;
      }
      if (!res.ok) throw new DataError(res.status, githubMessage(res.status, body));
      this.latest = doc;
      this.returnLatestOnce = true;
      this.commitEpoch++;
      if (typeof body?.commit?.html_url === 'string') this.lastCommitUrl.set(body.commit.html_url);
      if (typeof body?.commit?.sha === 'string') this.lastCommitSha.set(body.commit.sha);
      this.connected.set(true);
      this.connectionError.set(null);
      return result;
    }
    throw lastConflict ?? new DataError(409, githubMessage(409, { message: 'sha conflict' }));
  }

  async refreshLastCommit() {
    const epoch = this.commitEpoch;
    try {
      const res = await fetch(
        `${API}/repos/${OWNER}/${REPO}/commits?path=${encodeURIComponent(DATA_PATH)}&sha=${BRANCH}&per_page=1`,
        { headers: this.headers(this.token()), cache: 'no-store' },
      );
      if (!res.ok || epoch !== this.commitEpoch) return;
      const body = await readBody(res);
      if (epoch !== this.commitEpoch) return;
      const commit = Array.isArray(body) ? body[0] : null;
      if (typeof commit?.html_url === 'string') this.lastCommitUrl.set(commit.html_url);
      if (typeof commit?.sha === 'string') this.lastCommitSha.set(commit.sha);
    } catch {
      // The link is optional; a failure here must not hide the résumé.
    }
  }

  private contentsUrl() {
    return `${API}/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${BRANCH}`;
  }

  private headers(token: string | null): HeadersInit {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private async fetchContents(auth: boolean): Promise<{ sha: string; doc: ResumeDocument }> {
    const res = await fetch(this.contentsUrl(), { headers: this.headers(auth ? this.token() : null), cache: 'no-store' });
    const body = await readBody(res);
    if (!res.ok) throw new DataError(res.status, githubMessage(res.status, body));
    if (typeof body?.content !== 'string' || typeof body?.sha !== 'string') {
      throw new DataError(res.status, githubMessage(res.status, { message: 'GitHub did not return Data/resume-data.json' }));
    }
    const text = decodeBase64(body.content).replace(/^\uFEFF/, '');
    return { sha: body.sha, doc: asDataDocument(JSON.parse(text) as ResumeDocument) };
  }
}

async function readBody(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
