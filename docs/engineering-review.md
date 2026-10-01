# Engineering review and improvement proposal

Date: 2026-10-01. Baseline: e839efc. Local review; no deployment or external customer data.

## Conclusion

Narrow the next iteration to **privacy-preserving verification of issuer-attested predicates**, with KYC-style credential validity as the flagship workflow. Keep screening and balance coverage as explicit research demonstrations, not claims of comprehensive AML or corporate solvency. The principal missing component is trustworthy, fresh, complete evidence and verifier policy—not a larger Merkle tree.

## Verified defects and changes

1. **AML failed compilation.** `customerFlags[c] * watchlistFlags[w] * equal[c][w].out === 0` is not quadratic. Introduced a constrained intermediate `bothActive`; all three circuits now compile.
2. **Count validation trusted an unsafe comparator precondition.** The baseline solvency witness accepted field modulus minus one as a count. `LessThan(4)` alone does not establish a four-bit input domain. Added `BoundedCount8` with bit decomposition, upper bound and nonzero checks to both vector circuits. Zero is now rejected, matching the existing helper's 1–8-entry policy. This is a semantic tightening; a later empty-set profile must explicitly define its intended meaning.
3. **Browser file controls retained stale selections.** Module changes cleared React state but not native file controls. Workspace remount now clears controls; same-module clicks are a no-op. Added asynchronous input revision checks, disabled edits during proving, cleared old results before retries, and reset status on artifact changes.
4. **External font loading weakened local-only expectations.** Removed Google Fonts import. Tested workflow now makes no external HTTP requests. This is not a universal privacy guarantee: compromised dependencies, browser extensions, hosting or operating systems remain outside the tested boundary.
5. **Helper accepted numeric JSON through coercion.** Require decimal strings for field/32-bit values, avoiding prior rounding before BigInt conversion. Selected KYC credential must have verified='1'. Existing exclusive output creation and mode 0600 retained.
6. **KYC fixed depth generalized.** `PrivateKYC(depth)` supports depth 1–32; default wrapper remains depth 3. Source preparation and UI remain eight-leaf defaults. Larger profiles require matching witness tooling and newly generated keys.
7. **Independent verifier policy added.** `scripts/verify-proof.mjs` pins verification-key bytes by SHA-256, checks every public signal against verifier-owned expectations, checks policy expiry, and requires KYC day to equal verifier UTC day. This is a CLI example, NOT a complete trust registry or UI integration.
8. **Tests exposed an ordering assumption during implementation.** Public signals follow the compiled signal order, not the textual order in `main {public [...]}`. Verified against generated `.sym`: KYC=[issuerRoot,currentDay]; AML=[customerCount,watchlistCount,customerRoot,watchlistRoot]; solvency=[assetCount,liabilityCount,assetRoot,liabilityRoot]. Fixed the new policy verifier and added an assertion against independently prepared fixture values.

Changed circuit versions invalidate old proving/verification keys. Do not pair older keys/contracts with the new circuits. Existing checked-in Solidity verifier was neither overwritten nor deployed; provenance against a future production build remains unverified.

## Test evidence

Machine: Apple M3, arm64 macOS, 24 GiB RAM; Node v22.16.0, Chrome 154.0.8037.92; circom2 package 0.2.22. Raw measurements are copied into `docs/review-results/`.

- `npm test`: 7 passing groups, including 40 deterministic generated vector cases checked against plaintext reference functions.
- Checks cover invalid roots, secrets, verification flags, dates, nonbinary paths, overlap, active zero identifiers, counts, padding, maximum values, deficits, field aliases and helper overwrite/number rejection.
- `npm run test:browser`: real local Chrome uploads synthetic witnesses/artifacts, generates proofs, downloads proof/public signals, independently verifies them, rejects altered public signals, and rejects invalid witness roots for every module.
- Policy tests: accepted matching fixture context; rejected differing expected signal, unpinned key, expired policy and stale KYC day. Test clock is deliberately fixed to the fixture date; these are not fresh real-world attestations.
- Malformed JSON clears input and disables proving. Mobile-width layout had no horizontal overflow. No page exceptions or external HTTP requests were observed.
- `npm run build` passes. Vite still warns about a >500 kB minified bundle (~515 kB); consider deferred proof-engine loading after correctness work.
- `git diff --check` passed after code edits.

One measured browser run (witness + proving + local verification + UI overhead): KYC 460 ms, screening 417 ms, solvency 381 ms. Compact proof JSON sizes were 719/723/723 bytes. These are illustrative single-machine samples, NOT p95 latency or service capacity. The browser fixture uses default eight-slot profiles and local single-party development keys only.

### KYC scaling experiment

Measured five warm witness runs per depth, after one warmup. Median times:

- Depth 3: capacity 8, 2,267 constraints, 1.91 ms.
- Depth 8: capacity 256, 4,867 constraints, 3.89 ms.
- Depth 16: capacity 65,536, 9,027 constraints, 7.05 ms.
- Depth 20: capacity 1,048,576, 11,107 constraints, 8.68 ms.

These are synthetic authentication paths, NOT populated registries. Results demonstrate logarithmic-depth membership work, not million-user operation. Did not measure full registry construction/update, path distribution, peak memory, larger-depth setup/proving, concurrency, mobile proving or root-rotation throughput. Larger profiles exceed the development setup script's power-12 capacity and need appropriately sized setup.

## What a valid proof still does not establish

### Trust and replay

A prover can currently choose an issuer root, historical date, watchlist and financial commitments. A SNARK can correctly verify a meaningless claim about self-chosen data. An uploaded verification key can also describe a different circuit. Root acceptance and key pinning therefore belong to the verifier, not the proof uploader.

The new CLI policy verifier addresses a small part of this boundary. It does not authenticate the policy file, issuer credentials or underlying records. A policy supplied by the prover defeats its purpose. Trusted distribution, controlled policy administration and artifact manifests remain necessary.

There is no challenge, relying-party binding or one-use proof identifier. Even with today's day enforced, an accepted proof is reusable. A next-version circuit should actually constrain a domain-separated response/nullifier to the holder secret and verifier challenge/domain; merely adding an unconstrained public challenge or JSON metadata is insufficient. The verifier must validate challenge issuance/expiry and atomically enforce replay policy. Avoid universal nullifiers that link the same person across relying parties.

### KYC

The circuit proves possession of a secret/path for an approved, unexpired leaf—not identity, full customer due diligence, issuer honesty or current non-revocation. An issuer must authorize the root. Old accepted roots may preserve revoked credentials. Root epochs, maximum staleness, revocation semantics, recovery and confidential witness distribution are protocol requirements. Do not send all customers' credential secrets to the browser: the current source builder is issuer-side/test tooling, not a production wallet API.

### Screening is not complete AML

The current prover knows both sets, so this is not two-party private set intersection. Exact identifier disjointness omits entity resolution, aliases, fuzzy matches, ownership/control criteria, transaction monitoring and human review. Canonicalization must be versioned and shared across sources. An official list's internal record ID is not automatically a customer matching identifier.

Scaling the current all-pairs algorithm costs O(customers × watchlist). Prefer researching authenticated sorted-set non-membership or a sparse Merkle dictionary for a small number of screened identifiers against an externally published list. A sorted neighbor proof also requires authenticated adjacency/order, not just two arbitrary membership proofs. Sparse-tree absence proves absence of an exact canonical key, not absence of a fuzzy sanctions match. False-negative handling remains external.

### Balance coverage is not corporate solvency

A >= L over unsigned 32-bit values establishes neither ownership, lien-free assets, valuation, liquidity, consolidated entity scope nor complete liabilities. At cent units, each current entry is capped at 42,949,672.95 currency units; changing units without metadata can radically change meaning. Currency, valuation policy/time, legal entity, units and evidence scope must be bound to commitments and verifier expectations. Financial accounting and stress/liquidity questions should remain explicit external attestations.

Merkle-sum structures can support aggregation and selective inclusion; they do not prove no liabilities were omitted. Add creditor reconciliation/independent attestations before claiming completeness. If wider integers are needed, derive aggregate bit widths and prove overflow bounds rather than merely increasing the array length.

### Commitment privacy

Vector commitments are deterministic unsalted Poseidon hashes. ZK does not stop guessing low-entropy financial vectors from public commitments or correlating identical datasets over time. Introduce high-entropy private blinding, domain separation and a documented encoding in a new circuit version, then reassess who needs a stable public root. A public authority's watchlist commitment may intentionally be deterministic; private customer and balance commitments have different privacy requirements. Active lengths are public already.

## Competing approaches and recommendation

### Broaden all three modules vs narrow one workflow

- Broaden: stronger demo breadth and comparison across proof statements.
- Objection: multiplies oracle, regulatory and integration assumptions, with each module too shallow to defend as operational compliance.
- Recommendation: retain all three as baselines; make issuer-attested credential validity the end-to-end research contribution. Evaluate privacy, soundness, freshness, revocation and verifier acceptance separately.

### Real data now vs synthetic evaluation first

- Real feeds: improve source fidelity, update handling and reproducibility.
- Objection: ingesting official data does not authenticate a prover-selected subset, establish complete customer matching or fix circuits. Real personal records would add unnecessary exposure.
- Recommendation: start with a versioned public snapshot adapter and synthetic customers. Do not ingest real customer PII for the demo. Keep raw snapshot, retrieval time, content hash, canonicalization version, provenance and full-set commitment. Authenticate its publication and validate it independently of the prover.

### Larger Merkle tree vs stronger trust protocol

- Larger tree: now experimentally inexpensive for witness computation at depth 20.
- Objection: tree size says nothing about trusted roots, freshness or incomplete input data; AML and solvency have different scaling problems.
- Recommendation: depth 16/20 membership profile after trusted-root/revocation protocol; do not present leaf capacity as validated user scale. Measure registry operations and full proof costs before a scalability claim.

### Put verification on-chain vs off-chain first

- On-chain: shared audit trail and enforcement point.
- Objection: deployment does not cure false source data, adds fees and permanently visible metadata, and may introduce linkage risk.
- Recommendation: off-chain verifier-owned policy first. Compare on-chain verification only if the research question needs a shared settlement/enforcement boundary. No contract deployed in this review.

## Concrete data-source designs (proposed, not connected)

Official documentation URLs were checked during the review; no feed ingestion has been implemented or validated.

- [OFAC Sanctions List Service](https://ofac.treasury.gov/sanctions-list-service): candidate public list snapshot for the screening research pipeline. Retain full source snapshot and list type/version; never silently select eight convenient entries and label the result a full-list screen. Design record normalization and entity matching separately from proof generation.
- [GLEIF API](https://www.gleif.org/en/lei-data/gleif-api): candidate legal-entity reference enrichment. An LEI reference is not KYC approval, beneficial ownership assurance or proof of corporate financial health.
- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces): candidate public-company financial snapshot experiment. Align entity, reporting period, unit, filing/version and accounting concept; reject missing or conflicting values. Public filings help test reproducibility but are not current bank balances or evidence of private-data confidentiality.
- Private evidence later: issuer-signed credentials, bank/custodian attestations and accounting exports only with explicit authorization and an agreed data contract. Do not embed API credentials in browser code. Cryptographic transport/signature verification, freshness and operational trust need separate designs.

## Suggested next deliverable and acceptance criteria

**A verifier-controlled, revocable credential demonstration** with a trusted registry publisher, a holder wallet/path API, and a separate verifier. All customer identities remain synthetic.

Acceptance criteria: reject unauthorized key/root, revoked credential under current policy, stale epoch/day, altered policy domain and replayed challenge; accept authorized fresh credential; give clear reasons for policy failure versus invalid proof. Bind policy/version/domain in constrained claims. Pin artifacts with a signed manifest and publish signal ordering per circuit build. Benchmark depth 3/8/16/20 with repeatable full proof generation, peak memory and registry operations. Add separate privacy and threat-model review.

Secondary demonstration: authenticated exact-ID watchlist snapshot with update/revocation tests, not 'complete AML'. Tertiary demonstration: independently attested balance-coverage predicates, not 'corporate solvency certification'.

## Remaining engineering risks

- No independent cryptographic audit, underconstraint formal analysis, production ceremony, production key provenance or contract deployment verification.
- Dependency audit (`npm audit --omit=dev --json`) reported 19 affected package entries: 13 low, 2 moderate, 4 high, no critical. These include transitive chains, not 19 independent exploitable vulnerabilities. Findings include ws and underscore; runtime reachability was not established. Avoid blind `audit fix --force`, which proposed a breaking circomlibjs downgrade. Resolve and retest dependencies before any hosted deployment.
- Browser test ran the Vite development server, not a deployed production host. Build succeeded, but CSP, supply-chain controls, artifact download integrity and production hosting remain unevaluated.
- No worker cancellation/progress UI, memory limits, oversized-file defenses, production monitoring or availability testing.
- Input validation coverage is substantial for a prototype, not exhaustive. Negative zero, canonical encoding at every external boundary, fuzz/property expansion and resource exhaustion need additional review.
- New verifier policy checks are CLI-only and depend on correct independently managed configuration; the existing browser remains a proof workbench, not an authoritative compliance decision system.
