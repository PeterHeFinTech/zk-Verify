# Methodology and design decisions

## Research approach

This is a development project with a functional and performance evaluation stage. The three compliance claims are translated into explicit arithmetic constraints, implemented as separate Circom circuits, then exposed through a browser workbench. The prototype deliberately uses bounded inputs to make circuit behaviour inspectable.

## Participants and trust assumptions

The KYC issuer controls the approved Merkle root. The watchlist authority controls the approved watchlist commitment. The financial prover supplies asset and liability records. A verifier must obtain trusted roots or commitments from an authenticated source and choose the correct verification key. The prototype interface lets users load these files themselves; it is a technical workbench rather than an enforcement layer.

## Statements

1. **KYC:** a private leaf `Poseidon(secret, verified, expiryDay)` with `verified = 1` belongs to the supplied three-level Merkle root, and `expiryDay >= currentDay`.
2. **Screening:** the two private eight-slot vectors hash to their supplied commitments, their inactive slots are zero, and no active customer identifier equals an active watchlist identifier.
3. **Solvency:** the private eight-slot vectors hash to their supplied commitments, all values are 32-bit non-negative integers, inactive slots are zero, and `sum(assets) >= sum(liabilities)`.

## Testing and evaluation

For each module, test one valid witness and several invalid witnesses: changed public root, changed private value, expired credential, matching customer identifier, and liabilities greater than assets. Include boundary values and ensure modified proof bytes or public signals are rejected. Measure proof generation, verification, memory, constraint counts, key sizes, and proof size on one documented hardware setup. The current code has not yet been run through this test plan.

## Scope limitations

The circuit statements are narrower than legal compliance. KYC needs issuer governance, credential revocation, and identity binding. Screening needs authentic and current lists, matching beyond exact equality, and complete customer records. Solvency needs independently established assets, liabilities, prices, and reporting periods. An accepted ZKP only establishes that the particular circuit relation is satisfied for the committed inputs.
