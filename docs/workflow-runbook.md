# Request-bound KYC demonstration: runbook and boundaries

This implements a **local, synthetic FYP vertical slice**, not the entire production architecture in the attached comments. Browser/local proving remains separate from API verification. Legacy AML, solvency and KYC workbench formats remain unchanged.

## Requirements and quick start

Node 22.16+ (this version was tested); built-in SQLite is experimental and is explicitly enabled. Existing pinned npm dependencies are sufficient. No extra npm runtime library was added.

```bash
npm ci --ignore-scripts
npm run setup:workflow  # once: development setup, synthetic credential, local role tokens
npm run api            # terminal 1, loopback 127.0.0.1:8787 ONLY
npm run dev            # terminal 2, use http://127.0.0.1:5173
```

On the review machine, prepend `python3 tools/run.py` to npm commands if Node is not on PATH. The ignored tools wrapper is machine-local, not part of a fresh clone.

Setup refuses to overwrite an existing config. It writes `build/workflow/` with restrictive file modes. Do not publish, commit, email or upload this directory. All fixtures are synthetic. The setup ceremony is local/single-party and unsuitable for real claims. Configuration has absolute artifact paths; generate a separate configuration on another machine.

### Publish an approved root

In a third terminal:

```bash
npm run workflow -- register
npm run workflow -- propose
npm run workflow -- approve PROPOSAL_ID
```

Replace PROPOSAL_ID with the printed proposal identifier. This exercises separate configured issuer/approver principals. They are stored on one development machine for convenience, so it is **not operational two-person security**. An actual deployment must prevent either human from using the other's credentials.

### Browser holder workflow

1. Open the Vite UI and select **Open trusted KYC workflow**.
2. Locally inspect `build/workflow/credentials.json` and enter only the synthetic `holder` token into the password field. Do not paste tokens into chat. Tokens are kept in component memory, not browser persistent storage.
3. Choose `build/workflow/holder.private.json` as the local session credential.
4. Create a verification request, then select **Prove locally and submit**.
5. The API, not the browser, decides whether the proof is acceptable.

Artifacts are selected automatically from the configured profile and hash-checked before proving. The user no longer chooses a verification key. The issuer root must already be approved. Browser frontend code is still trusted; a malicious frontend/extension could steal a witness. Proof generation currently runs on the main thread; a dedicated worker remains a UX improvement.

### Institution-local proving alternative

```bash
npm run workflow -- prove
npm run workflow -- audit
```

The CLI reads a local private file and produces a proof inside the caller's environment. Its HTTP body contains only proof/public signals. It is a minimal proving client, **not** a scheduled worker fleet, source-system connector or centralized witness service.

### Demonstrate revocation

```bash
npm run workflow -- revoke
npm run workflow -- approve NEW_PROPOSAL_ID
npm run workflow -- prove
```

The last command should fail: the replacement synthetic tree excludes the original approved credential. Pending requests against the previous epoch are also rejected. Only the current root is accepted; there is no grace window. All non-revoked holders would need updated paths after rotation. Actual credential issuance/recovery/path distribution and issuer correctness remain outside this slice. Do not describe root rotation alone as a complete credential lifecycle system.

## API contract

All endpoints are under `/api/v1`. Authentication is an in-memory configured opaque bearer token checked against its SHA-256 hash. No access token in URLs. Requests require exact top-level schemas; proof also has an allowlisted shape. Max JSON body is 32 KiB. No CORS; explicitly configured browser origins only. Service binds loopback. This configuration is not safe to expose publicly or by changing the bind address.

- GET `/profile`: trusted profile metadata, artifact hashes and signal schema.
- GET `/artifacts/{name}`: only three approved artifact files; never a general directory server.
- POST `/issuers`: issuer role, body `{ "issuer": "demo-issuer" }`.
- POST `/root-proposals`: issuer role, body `issuer`, `root` (decimal string), `epoch` (positive integer), `validUntil` (epoch milliseconds, at most 30 days ahead).
- POST `/root-proposals/{id}/approve`: approver role, empty JSON object; different principal from proposer required; monotonic epoch; root must differ from current root.
- GET `/roots/{issuer}`: current tenant root metadata (caller must inspect expiry).
- POST `/requests`: holder role, body `{ "issuer": "demo-issuer", "purpose": "account-opening" }`; request lifetime at most five minutes, root expiry or UTC day end, whichever is earliest.
- GET `/requests/{id}`: only the same holder and tenant.
- POST `/requests/{id}/proof`: same holder/tenant; body `proof` and `publicSignals` only.
- GET `/results/{id}`: verifier role in same tenant; minimum decision context, no secret/proof. Accepted is a historical decision, not evidence of continuing credential validity after revocation.
- GET `/audit`: verifier role; most recent 100 events in its tenant.

Typical errors: 401 invalid authentication; 403 role/origin mismatch; 404 inaccessible/not-found object; 409 stale root or consumed request; 410 expiry; 422 public-context or cryptographic rejection; 429 pending request cap; 503 verifier busy. Only one proof verifies at a time per process; overload is rejected, not queued. This is explicit backpressure, not a throughput solution.

## Cryptographic and policy boundary

New circuit: `kyc_session.circom`, profile `kyc-session-v1`, separate from legacy KYC.

Public witness order, confirmed against real generated proofs: `[response, issuerRoot, currentDay, context]`.

`response = Poseidon(domainConstant, credentialSecret, context)` is constrained inside the circuit. Membership ties the same secret to the approved leaf. Server context hashes a random 256-bit challenge plus request identifier, owner, tenant, issuer/root/epoch, relying party, purpose, UTC day and profile/key hash into a field element. Editing JSON metadata cannot rebind an old proof. The API checks stored context and does not allow clients to select relying party, key, clock or arbitrary purpose.

Replay protection requires both this relation and atomic request consumption. After asynchronous cryptographic verification the API rechecks expiry, root and profile inside an SQLite transaction before changing pending to accepted. Profile/key changes invalidate old pending requests. Artifact hashes are checked at startup and bytes retained in memory to avoid file replacement between validation and use. The configuration file itself is trusted operator input; there is no signed release manifest or root-of-trust bootstrap.

An authorized issuer and approver can still publish a dishonest root. This design does not prove customer identity or issuer due diligence. Shared/reused credential secrets undermine holder assurance. Rate limits do not make a weak secret safe. Only high-entropy synthetic secrets were generated here.

## Persistence and audit

SQLite stores authorized roots, proposals, request context/state and audit metadata. It does not store private credential files, full witnesses, proof bodies or bearer tokens. Config stores token hashes; synthetic role tokens reside in a separate ignored local file. Main entrypoint sets restrictive umask/database mode.

Audit records actor, tenant, event, object identifier and timestamp. It is NOT a tamper-evident audit ledger and does not comprehensively record every denied request. A local operator with filesystem access controls the database and config. Restart persistence was tested, not crash/power-loss recovery or backup restoration. SQLite WAL means copying only the main database file while running is not a safe backup strategy; use a reviewed consistent backup procedure before deployment.

## Tests and evidence

```bash
npm run test:workflow
npm run test:workflow:browser  # requires ports 8787 and 5181 free; stop running API first
npm test
npm run test:browser          # requires previous legacy npm run setup:test
npm run build
```

Workflow browser test uses local Chrome (override CHROME_PATH); UI test launches its own API/database and Vite. Tests use unique ignored database files, not the interactive demo database. Negative revoked-membership tests can print expected witness assertion messages even when the suite succeeds.

Evidence: `docs/review-results/workflow-results.json`, `workflow-browser-results.json`. Includes real proof generation, public-signal ordering, request tampering, invalid proof, replay/concurrent duplicate submission, restart persistence, root rotation, tenant/role separation, artifact pinning, and browser request-body inspection. Legacy tests passed again. Process peak RSS reflects the combined test/prover/verifier process, not an isolated worker. Two proof timing samples do not establish p95 latency or production throughput.

## Still required before institutional use

- OIDC/SSO/MFA, proper token lifecycle/revocation, granular issuer ownership authorization and independent operational approvals.
- HTTPS/mTLS deployment, strict Host handling/reverse-proxy configuration, CSP and production frontend serving, dependency remediation and software supply-chain review.
- Institution-controlled read-only connectors, source snapshot provenance/reconciliation, confidential path distribution and formal revocation policy.
- Signing-key management and signed artifact/configuration distribution. Local Groth16 setup is not a production ceremony.
- Proving worker isolation, resource limits, cancellation, controlled egress, transient-data lifecycle and service-level load testing.
- Bounded verification worker pool/queue, durable job recovery, retention/pruning and full audit coverage.
- Production database migrations, backup/restore drills, crash recovery and privacy/cryptographic review.
- Full screening/financial redesign: unchanged eight-slot demonstrations do not become production AML or corporate solvency merely because a KYC API exists.

Do not use real customer data or expose this service remotely until these boundaries are addressed.
