# Review progress — 2026-10-01

## Plan
1. Discovery: inspect circuit statements, tooling, input preparation, UI and documented assumptions.
2. Verification: establish a local toolchain; compile each circuit; test valid/invalid witnesses and browser workflows using synthetic data only.
3. Improvement: make targeted, backwards-compatible correctness fixes and add regression tests; retest.
4. Synthesis: document verified findings, competing design options, a scoped roadmap, data provenance and scalability experiments.

## Boundaries
Local changes only. No git push, production deployments, external customer data, or representation of regulatory compliance. Development keys are not production keys.

## Discovery
- Base commit: e839efc. Initially clean working tree.
- KYC uses depth 3 and authenticated roots only by external assumption.
- AML uses eight-by-eight exact comparisons; the three-signal product requires compiler verification.
- Solvency is arithmetic over committed, unaudited numbers, not comprehensive corporate solvency.
- Browser trusts arbitrary uploaded circuit and verification-key files and does not independently accept/reject policy context.
- No automated test scripts in package.json; methodology explicitly says its test plan was not run.
- No node/npm/Circom available on the shell PATH. Tools will be isolated under ignored tools/ if installation succeeds.
- Dedicated reasoning-state and browser MCP tools are not available in this session; this file records progress instead. Browser automation will be attempted with local tooling.

Sources: README.md, docs/methodology.md, circuits/*.circom, src/App.jsx, scripts/*.sh, scripts/prepare-input.mjs.

## Completion
- Discovery, targeted fixes, local verification and synthesis completed for this review scope.
- All three default circuits compiled and generated real browser proofs using development-only keys.
- Seven circuit/input regression groups passed; browser proof downloads independently verified, tampered signals/invalid witnesses rejected.
- Added and tested a verifier-owned policy CLI. A signal ordering error in its first iteration was caught by testing, corrected using .sym, and regression-tested against independent fixtures.
- Benchmarked synthetic KYC witness paths at depths 3, 8, 16 and 20; no claim of populated million-user operation.
- npm production dependency audit reported unresolved findings; no unsafe force-upgrade applied.
- Complete findings and recommendations: docs/engineering-review.md. Raw measurements: docs/review-results/.
- No public data adapter, customer data ingestion, production deployment, git commit or push performed.
