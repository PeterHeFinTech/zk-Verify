# zk-Verify

zk-Verify is a final-year research prototype for generating and checking three zero-knowledge compliance claims in a browser:

| Module | What the circuit checks |
|---|---|
| KYC | An approved, unexpired credential is included in a supplied issuer Merkle root. |
| AML screening | Two committed sets of exact identifiers have no active member in common. |
| Solvency | The sum of committed asset values is at least the sum of committed liability values. |

The prototype uses React, Circom, `snarkjs`, and Groth16. It does not include customer records, sanctions lists, credentials, financial balances, or deployed contracts. You supply source input files yourself. See [Methodology](docs/methodology.md) for the exact proof statements and trust assumptions.

## Quick start

From the project directory:

```bash
cd /Users/hetianqu/Documents/zk-Verify
bash scripts/install-dependencies.sh
bash scripts/prepare-circuits.sh
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173/`.

The dependency script installs the packages in `package-lock.json` and checks that the separately installed Circom and `snarkjs` commands are available. It does not reinstall Rust, Circom, or the global `snarkjs` CLI. The circuit preparation script compiles all three circuits and generates a development proving key, verification key, WebAssembly witness calculator, and Solidity verifier for each. It may ask for random text several times during Groth16 setup. Enter fresh random text at each prompt and let the script finish.

You can skip `prepare-circuits.sh` when all three module directories already contain these files:

```text
public/artifacts/<module>/circuit.wasm
public/artifacts/<module>/proving_key.zkey
public/artifacts/<module>/verification_key.json
```

Use `kyc`, `aml`, or `solvency` for `<module>`. A partially populated directory does not mean setup has finished. The completion message is `Artifacts generated in public/artifacts/.`

## Prepare your own input

Create a `data/` directory for source and private input files. It is excluded from Git. The input preparation script validates the source and calculates the Poseidon commitments and Merkle path needed by the circuits.

```bash
mkdir -p data
node scripts/prepare-input.mjs kyc data/kyc-source.json data/kyc.private.json
node scripts/prepare-input.mjs aml data/aml-source.json data/aml.private.json
node scripts/prepare-input.mjs solvency data/solvency-source.json data/solvency.private.json
```

Run only the command for the module you are using. The source files must already exist; the script does not create or invent source data. It will not overwrite an existing private input file. Use a different output name or move the old file before preparing a new input.

All numeric values should be JSON strings containing non-negative decimal integers. Each list supports **one to eight entries**.

### KYC source fields

| Field | Meaning |
|---|---|
| `credentials` | Array of 1–8 objects with `secret`, `verified`, and `expiryDay`. |
| `selectedIndex` | Zero-based position of the credential being proved. |
| `currentDay` | Current day count since the Unix epoch. |

`verified` must be `"1"` for the selected credential. `expiryDay` and `currentDay` must be less than `2^32`. The helper constructs an eight-leaf Merkle tree and prints its root. A trusted issuer must independently approve and publish that root. A prover choosing a root for themselves provides no meaningful KYC assurance. This module does not implement issuer signatures, credential revocation, or holder binding.

### AML screening source fields

| Field | Meaning |
|---|---|
| `customers` | Array of 1–8 canonical numeric customer identifiers. |
| `watchlist` | Array of 1–8 canonical numeric watchlist identifiers. |

The circuit performs exact equality checks. It does not normalise names, handle aliases, or perform fuzzy matching. The watchlist commitment must come from an authenticated list provider. Avoid real customer identifiers: the public unsalted commitments may be vulnerable to guessing when values have low entropy. This circuit is a bounded set-disjointness demonstration, **not a full private set intersection protocol**.

### Solvency source fields

| Field | Meaning |
|---|---|
| `assets` | Array of 1–8 non-negative asset amounts. |
| `liabilities` | Array of 1–8 non-negative liability amounts. |

Use the same smallest currency unit throughout. Each amount must be less than `2^32`. The proof checks arithmetic over the supplied amounts; it does not establish asset ownership, correct valuation, or complete liabilities.

## Generate a proof in the web interface

1. Select **Private KYC**, **Private screening**, or **Private solvency**.
2. Load `circuit.wasm`, `proving_key.zkey`, and `verification_key.json` from the matching `public/artifacts/<module>/` directory.
3. Load the matching `data/<module>.private.json` file created by the input preparation script.
4. Click **Generate proof locally**. The browser computes the witness and proof, then verifies the proof using the loaded verification key.
5. If verification succeeds, download the proof and public signals as separate JSON files.

Keep the private input file private. The application has no backend API and does not upload that file. It loads Google Fonts from the web when available; remove the font import in `src/styles.css` if you require fully offline operation. The downloaded proof is meaningful only when a verifier also trusts the verification key and the public issuer root or dataset commitments.

## Project structure

| Path | Purpose |
|---|---|
| `src/` | React interface and browser-side proof generation/verification. |
| `circuits/` | Circom source for the three proof statements. |
| `scripts/install-dependencies.sh` | Install locked npm dependencies and check external tools. |
| `scripts/prepare-circuits.sh` | Compile circuits and generate development proving artifacts. |
| `scripts/prepare-input.mjs` | Validate supplied source JSON and prepare circuit input. |
| `public/artifacts/` | Generated WASM, proving keys, and verification keys; excluded from Git. |
| `contracts/` | Generated Solidity verifiers; nothing is deployed automatically. |
| `docs/methodology.md` | Scope, assumptions, and evaluation approach. |

## Limits and evaluation

Groth16 setup in this repository is for local development. The generated verifier contracts have not been deployed to Sepolia. Cryptographic validity means that a circuit relation holds for the committed inputs; it does not establish that the supplied records are complete or that a regulator accepts the process.

The current circuits use fixed eight-slot arrays. To evaluate larger volumes, the circuit bounds and setup must be changed and the resulting versions measured separately. Record constraint count, witness and proof generation time, verification time, proof size, key size, and memory use on a documented machine. Test both valid claims and deliberately invalid inputs before reporting results.
