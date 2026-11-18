# Proposal · Owner-signed project membership and key epochs

Status: Proposed (not accepted) · Date: 2026-11-18 · Answers: [#128](https://github.com/sicza95/cali-restore-pro/issues/128) (review finding F-2), most of F-1, and the part of F-3 it depends on · Source: [internal crypto review](../reviews/2026-11-17-crypto-internal.md) · Reviewed: Codex (gpt-6.1-sol) on 2026-11-18; its findings are folded in below

## Problem

Today the **server** decides when a project gets new keys. The client takes the project key epoch from the `sync_epoch` the server reports. A replacement project code is only provisioned when that epoch changes, and in the editor that happens during explicit conflict resolution, not on its own. Re-encrypted originals get versioned file ids derived from the `original_epoch` the server reports, and the file keys come from the vault root and that id. Suppose a dishonest or compromised server works with a removed member. It can keep reporting the old epoch. Remaining owners then keep encrypting new work under a code the removed person holds, and "rotated" originals reuse keys that person already has. Nothing on the client notices.

The owner wants every member to have their own key, so that removing someone takes away only that person's access, without trusting the server's word.

## What any design can and cannot do

- **What a member has already read stays with them.** Anyone who could decrypt a revision held its key, and no scheme can take back a key or a copy. Removal can only protect content written **after** it.
- **Removal therefore needs new content keys.** Suppose every member got their own wrapped copy of the _same_ key. Deleting the removed member's copy would not help, because they already have the key itself. Removal has to create a new key and give it only to the people who remain. Per-member keys decide who receives the new key, but they cannot replace the rotation.
- **The real fix is that clients, not the server, decide membership.** The gap is not missing encryption. It is that clients have no verifiable record of membership changes. Established designs close it the same way:
  - [Keybase teams](https://book.keybase.io/docs/teams/crypto) sign every membership change and key rotation into a team signature chain that the server cannot forge or roll back.
  - [MLS (RFC 9420)](https://rfc-editor.org/rfc/rfc9420) moves a group to a new epoch only through a commit authenticated by a member.
  - Tresorit [rotates a shared folder's key on every membership change](https://tresorit.com/blog/end-to-end-encryption-without-key-rotation-is-a-fatal-shortcut).
  - Research on E2EE cloud storage under a malicious server ([ETH Zürich, 2024](https://eprint.iacr.org/2024/1616.pdf)) finds that sharing metadata controlled by the server is the weak point.

Group ratchets such as MLS's TreeKEM are built for chats with thousands of members and constant messages. A CaliRestore project has a handful of members and saves revisions. A signed chain plus per-member HPKE wraps gives the same removal guarantee at much lower cost.

## Proposed design

### 1. Each person has a signing key

Every account gets a long-term **signing key** (Ed25519) that lives in the vault next to the existing P-256 sharing (HPKE) key. Safari has supported Ed25519 in Web Crypto since 17.0. Generation, import, export, signing, verification and backup round trips still have to be qualified on iPad. If a device cannot do this, it must refuse to sign rather than quietly create a second identity.

The public half is pinned by the same manual fingerprint check that protects sharing keys. Pins cover the signing key and the sharing key together, as one identity. Replacing an identity is an explicit, signed event that other members must re-pin.

The signing key travels in vault backups and device transfers. This fixes the part of F-3 that would otherwise make the chain unusable after a restore.

### 2. Each project has a membership chain

Each project has an append-only, hash-linked chain of entries. The server stores and relays the chain but cannot write it.

| Entry     | Content                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| `genesis` | project id, creating owner's identity                                            |
| `add`     | member id, identity, role and scopes                                             |
| `remove`  | member id                                                                        |
| `change`  | member id, new role or scopes                                                    |
| `rotate`  | for each affected key: new epoch id (128 random bits), epoch number, wrap hashes |

Every entry contains:

- `previous`, the SHA-256 of the previous entry;
- a sequence number;
- the signer's id;
- an algorithm identifier.

Entries are signed over a canonical byte encoding, which is specified with shared TS/Go test vectors (F-16).

Validation rules:

- An entry is valid only if its signer was an owner at `previous`.
- No entry may leave the project without an owner. The host owner can only be removed through a hosting transfer, as `owners.go` enforces today.
- One owner may remove another owner, as today.
- When an owner leaves on their own, they sign the `remove`, and a remaining owner signs the `rotate`. Until that `rotate` exists, the project accepts no new writes.

**Atomic transitions.** A `remove` or a scope reduction and its `rotate` are one signed **transition**. The transition is a single submission that carries both entries and every new wrap. The server applies it only if it extends the current head (compare-and-swap, under the existing project advisory lock). An owner whose submission loses the race fetches the new head, verifies it, and rebuilds on top. A transition missing a wrap for any remaining member is invalid.

### 3. Keys per scope and per epoch, wrapped to each member

Scopes stay separate, because a scoped reader must not decrypt content outside their scope. Each content scope (the project body, plus each optional scope such as estimates and finance) has its own **epoch key**: 256 random bits generated by the owner's client during a `rotate`. The client wraps each key separately, with HPKE, to every member who holds that scope. These wraps are the per-member keys the owner asked for: each member opens the project with their own private key. A removed member, or one whose scope shrinks, gets no wrap for the new epoch of that scope.

Rotation happens on removal, and on any `change` that takes a scope away. Adding a member or adding a scope only adds wraps.

The HPKE `info`/AAD of each wrap binds:

- project id;
- scope;
- epoch id and epoch number;
- recipient id;
- the hash of the transition that introduced the wrap.

A wrap therefore cannot be replayed into another epoch or handed to another member. That closes F-1 for keys.

### 4. Content is bound to the chain and signed by its author

- **Revisions** are encrypted under their scope's epoch key. The author also **signs** each revision with their signing key. The signature covers project, scope, epoch id, chain-head hash, revision number, predecessor revision hash and the ciphertext hash. Possessing a key then no longer lets someone impersonate an editor. Members with an edit scope sign with their own key. The chain's `add`/`change` entries say who may write which scope. The server API must allow non-owner editors to submit signed revisions, where today revision and key-transfer endpoints require ownership.
- **Scope grants and checkpoints** carry the same binding and signature.
- **Re-encrypted originals** get **random** new file ids and keys under the new epoch, instead of ids derived from the epoch the server reports.

### 5. Client rules

1. Before using any key, verify the chain from a trusted starting point (section 6). Reject an invalid signature, a broken link, a signer who was not an owner, or an entry that breaks a validation rule.
2. Store the **exact head hash** per project. Accept a newer chain only if it extends that head (ancestry, not just a higher sequence). A chain that does not extend it is a fork: stop writing and show it to the owner.
3. Keep persistent **watermarks**: the newest accepted revision hash per scope and the newest accepted grant per scope. Refuse anything older, even when it carries the same chain head. A replayed old revision at an unchanged membership is otherwise still accepted.
4. **Never encrypt under an epoch older than the newest verified `rotate` for that scope.** Once the chain shows a removal, the old key is closed for writing, whatever the server says.
5. Accept a revision only if its signature verifies, its chain binding matches a verified epoch, and its author held write scope at that point of the chain.

### 6. Trusted start and moving existing projects

The roster from the server is not a trusted starting point, and fingerprint pins only show that individual keys are genuine. They say nothing about whether the member list is complete or who owns the project. So:

- **Genesis is confirmed out of band.** When a project is migrated or created, the creating owner's client writes `genesis` and `add` entries and shows a short **chain fingerprint** (a hash of the head). Every other owner and member confirms it, the same way sharing fingerprints are confirmed today. Until a member confirms, their client shows the project as "membership not verified" and does not encrypt new shared work for it.
- **One initializer.** The server accepts only one `genesis` per project. A second owner who tries to migrate at the same time gets the existing chain to verify and confirm.
- **No downgrade.** A client that has seen a chain for a project stores that fact. It refuses to fall back to server-reported epochs even if the server later stops returning the chain.
- **New and restored devices** get the trusted head through the vault backup or the device transfer, which both already carry the vault. Otherwise they confirm the chain fingerprint again.
- **Not yet migrated.** Projects whose owners have not migrated keep the current scheme, and the sharing panel says that removal there still depends on the server. A later release makes the chain required.

## What remains after this

- **Already-delivered content** stays with the removed member. This is unavoidable and already documented.
- **Withheld chain entries.** A dishonest server can hide the newest entries from an owner or editor. That client then keeps writing under the old epoch, and new work keeps leaking to the removed member for as long as the withholding lasts. When another member sees writes bound to an old head, that proves the writer is stale; it does not by itself prove a fork. The design detects this but does not prevent it. A public transparency log (Keybase publishes a Merkle root) would make withholding detectable to everyone, but even that does not guarantee that a writer learns of a removal before encrypting. Limiting this needs a freshness rule as well, for example "refuse to write if the chain head is older than N hours without a signed heartbeat". That is a product decision, left open below.
- **Malicious client code** served by the server stays out of scope (M-03).
- **Offline owners** learn of a removal on reconnect, as they do today.

## Open questions for the owner

1. Freshness: should clients stop writing shared work after a set time without seeing a current signed chain head (and how long), or is detection enough?
2. Scope reduction: rotate at once (the cost is new wraps for everyone in that scope), or at the next write?

## Cost and order

This is several pull requests:

1. Signing identity, pins and backup (with F-3).
2. Chain format, canonical encoding and test vectors.
3. Chain storage and an API with compare-and-swap transitions.
4. Per-scope epoch wraps and the new AAD.
5. Signed revisions, grants and originals, plus non-owner editor submission.
6. Watermarks.
7. Genesis confirmation and migration.
8. Making the chain required.

Every client rule needs Go and browser tests. This changes the crypto design, so the external review (#52) should see it before release. Once accepted, it becomes an ADR that supersedes the epoch parts of the sharing design.

## Alternatives considered

- **Accept and document.** This is the simplest option, but removal would still depend on the server, which the owner rejected (2026-11-18).
- **Per-member wraps of one unchanging project key, with the removed member's wrap deleted.** This does not work: the removed member already holds the key.
- **One epoch key for all scopes.** This is simpler, but it breaks scope isolation: any scoped reader could decrypt everything.
- **Full MLS / TreeKEM.** It is built for large, busy groups. It needs much more code and state for a few members per project, and there is no browser library qualified for this app.
- **Hardware-enforced revocation (a TEE on the server).** This moves trust to the host's hardware instead of removing it, and it does not fit self-hosting.
