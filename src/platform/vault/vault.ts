import { importCode, newCode, open, parseEnvelope, seal } from './crypto';
import type { Envelope } from './crypto';
import { commitVault, readVault, estimateTable, presetTable, reportTable } from './store';
import type { VaultRow } from './store';
import { encryptedFiles } from './files';
import { revisionQueue } from './revision-queue';
import { projectDocuments } from './project-store';
import { originalPins } from './original-pins';
import { projectBackups } from './project-backups';

export class LocalVault {
  #root?: CryptoKey;
  #row?: VaultRow;
  #pairing?: string;
  #epoch = 0;
  #fileAccess = new AbortController();
  #channel = new BroadcastChannel('calirestore-vault');
  #closed = false;

  constructor(
    private readonly account: string,
    invalidate: () => void,
  ) {
    this.#channel.onmessage = ({ data }) => {
      if (data === account) {
        this.lock(false);
        invalidate();
      }
    };
  }

  lock(broadcast = true) {
    this.#epoch++;
    this.#fileAccess.abort();
    this.#fileAccess = new AbortController();
    this.#root = undefined;
    this.#row = undefined;
    this.#pairing = undefined;
    if (broadcast && !this.#closed) this.#channel.postMessage(this.account);
  }

  close() {
    this.lock(false);
    this.#closed = true;
    this.#channel.close();
  }

  async status() {
    const row = await readVault(this.account);
    return { exists: !!row, remembered: !!row?.remembered };
  }

  #assert(epoch: number) {
    if (this.#epoch !== epoch || this.#closed) throw new Error('Vault locked');
  }

  async #install(root: CryptoKey, envelope: Envelope, remember: boolean, epoch: number) {
    this.#assert(epoch);
    const row = { envelope, stamp: newCode(), remembered: remember ? root : undefined };
    await commitVault(this.account, undefined, row);
    this.#assert(epoch);
    this.#root = root;
    this.#row = row;
  }

  async #create(text: string, code: string, remember: boolean, epoch: number) {
    const root = await importCode(code);
    const envelope = await seal(root, this.account, 'snapshot', text);
    await this.#install(root, envelope, remember, epoch);
    return code;
  }

  create(code: string, remember: boolean) {
    return this.#create('', code, remember, this.#epoch);
  }

  async unlock(code?: string) {
    const epoch = this.#epoch;
    const row = await readVault(this.account);
    if (!row) throw new Error('Vault missing');
    const root = code === undefined ? row.remembered : await importCode(code);
    if (!root) throw new Error('Recovery key required');
    const text = await open(root, this.account, 'snapshot', row.envelope);
    this.#assert(epoch);
    this.#root = root;
    this.#row = row;
    return text;
  }

  async restore(file: string, code: string, remember: boolean) {
    const epoch = this.#epoch;
    const envelope = parseEnvelope(file);
    const root = await importCode(code);
    const text = await open(root, this.account, 'snapshot', envelope);
    await this.#install(root, envelope, remember, epoch);
    return text;
  }

  requestTransfer() {
    return (this.#pairing = newCode());
  }

  async acceptTransfer(file: string, code: string, remember: boolean) {
    const epoch = this.#epoch;
    if (!this.#pairing) throw new Error('Pairing code missing');
    const root = await importCode(this.#pairing);
    const text = await open(root, this.account, 'transfer', parseEnvelope(file));
    await this.#create(text, code, remember, epoch);
    this.#pairing = undefined;
    return text;
  }

  #unlocked() {
    if (!this.#root || !this.#row) throw new Error('Vault locked');
    return { root: this.#root, row: this.#row, epoch: this.#epoch };
  }

  async #update(row: VaultRow, next: VaultRow, epoch: number) {
    this.#assert(epoch);
    await commitVault(this.account, row.stamp, next);
    this.#assert(epoch);
    this.#row = next;
  }

  files() {
    const { root, row } = this.#unlocked();
    return encryptedFiles(root, this.account, row.stamp, this.#fileAccess.signal);
  }

  accessSignal() {
    this.#unlocked();
    return this.#fileAccess.signal;
  }

  originalPins() {
    const { root } = this.#unlocked();
    return originalPins(root, this.account, () => this.#row?.stamp ?? '', this.#fileAccess.signal);
  }

  projects() {
    const { root, row } = this.#unlocked();
    return projectDocuments(root, this.account, row.stamp, this.#fileAccess.signal);
  }

  estimates() {
    const { root, row } = this.#unlocked();
    return projectDocuments(root, this.account, row.stamp, this.#fileAccess.signal, estimateTable);
  }

  estimatePresets() {
    const { root, row } = this.#unlocked();
    return projectDocuments(root, this.account, row.stamp, this.#fileAccess.signal, presetTable);
  }

  reports() {
    const { root, row } = this.#unlocked();
    return projectDocuments(root, this.account, row.stamp, this.#fileAccess.signal, reportTable);
  }

  projectBackups() {
    const { root, row } = this.#unlocked();
    return projectBackups(root, this.account, row.stamp, this.#fileAccess.signal);
  }

  revisions() {
    const { root } = this.#unlocked();
    return revisionQueue(root, this.account, () => this.#row?.stamp ?? '', this.#fileAccess.signal);
  }

  async sharingIdentity(pin?: { account: string; fingerprint: string }) {
    const { root, row, epoch } = this.#unlocked();
    const saved = row.sharingIdentity;
    const data = saved
      ? (JSON.parse(await open(root, this.account, 'sharing-identity', saved)) as {
          seed: string;
          pins: Record<string, string>;
        })
      : { seed: newCode(), pins: {} as Record<string, string> };
    this.#assert(epoch);
    if (pin && Object.hasOwn(data.pins, pin.account) && data.pins[pin.account] !== pin.fingerprint)
      throw new Error('Sharing identity changed');
    if (!saved || (pin && data.pins[pin.account] !== pin.fingerprint)) {
      if (pin) data.pins[pin.account] = pin.fingerprint;
      const sharingIdentity = await seal(
        root,
        this.account,
        'sharing-identity',
        JSON.stringify(data),
      );
      await this.#update(row, { ...row, stamp: newCode(), sharingIdentity }, epoch);
    }
    return { seed: data.seed, signal: this.#fileAccess.signal };
  }

  async save(text: string) {
    const { root, row, epoch } = this.#unlocked();
    const envelope = await seal(root, this.account, 'snapshot', text);
    await this.#update(row, { ...row, envelope, stamp: newCode() }, epoch);
  }

  async trust(remember: boolean) {
    const { root, row, epoch } = this.#unlocked();
    await this.#update(
      row,
      { ...row, stamp: newCode(), remembered: remember ? root : undefined },
      epoch,
    );
    this.#channel.postMessage(this.account);
  }

  backup() {
    return JSON.stringify(this.#unlocked().row.envelope);
  }

  async approveTransfer(code: string) {
    const { root, row, epoch } = this.#unlocked();
    const text = await open(root, this.account, 'snapshot', row.envelope);
    const envelope = await seal(await importCode(code), this.account, 'transfer', text);
    this.#assert(epoch);
    return JSON.stringify(envelope);
  }

  async forget(discard: boolean) {
    if (!discard) throw new Error('Discard confirmation required');
    const epoch = this.#epoch;
    const row = await readVault(this.account);
    this.#assert(epoch);
    if (row) await commitVault(this.account, row.stamp, undefined);
    this.lock();
  }
}
