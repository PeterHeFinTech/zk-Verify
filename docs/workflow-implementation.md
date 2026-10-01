# KYC workflow implementation

## Plan and boundary
Implement an FYP-sized workflow, not production compliance infrastructure. Source: attached architecture-review comments and existing engineering-review.md.

1. Add versioned request-bound KYC circuit without modifying legacy proof formats.
2. Add loopback-only API with SQLite persistence, configured principals/roles/tenants, issuer registration, two-principal root publication and verifier-owned artifacts.
3. Add local proving client and browser flow. Only proof and allowlisted public signals cross the API boundary.
4. Test real proofs and negative paths: authorization, stale roots, replay, wrong context, tampering, concurrency and restart persistence.
5. Document runbook, trust boundary and unmet production requirements.

Dedicated reasoning-state tools are unavailable; progress and evidence are recorded here instead.

## Decisions
- Keep browser and institution-local proving; never centralize private witnesses.
- Context is a server-issued random challenge hashed with issuer, tenant, relying party, purpose, root, epoch and profile. Circuit constrains a holder-secret-dependent response; API checks exact context and single-use state.
- Revocation demonstration uses immediate current-root replacement. Issuer must actually remove revoked leaves and redistribute paths; backend cannot inspect hidden membership.
- SQLite and local configured bearer tokens demonstrate separation and persistence, not SSO/MFA or production multi-tenancy certification.
- Root updates need proposer and independent approver; trusted profile provisioning is an operator-controlled local configuration, not a public upload.
- All generated credentials/tokens/keys/database files stay under ignored build/; all fixtures synthetic. No GitHub actions, cloud deployment or real data ingestion.

## Implemented and verified
- New SessionKYC circuit compiled (2,872 total constraints) and real Groth16 development proofs generated.
- Loopback verifier API, SQLite state, issuer/approver/holder/verifier roles, tenant-scoped roots/requests/results and exact body allowlists implemented.
- Root replacement revocation, expiry, request binding, pinned artifacts and atomic request acceptance tested.
- Local prover CLI and browser integration implemented. Browser downloads approved artifacts automatically and sends only proof/publicSignals.
- Real-browser test passed, including request-body checks (fixture secret absent), mobile width, no external HTTP requests or page errors.
- Original seven test groups and original three-module browser proof tests passed. Build passed, with existing bundle-size warning.
- Observed secret-free audit projection and restart persistence; these are not comprehensive logging-security or disaster-recovery certifications.
- Final runbook: docs/workflow-runbook.md. Evidence: docs/review-results/workflow*.json.
- Unimplemented production features are explicitly listed in the runbook. No commit, push or deployment performed.
