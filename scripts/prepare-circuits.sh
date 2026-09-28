#!/usr/bin/env bash
set -euo pipefail

# This script does not install dependencies. Run it only after installing
# circom, snarkjs, and circomlib according to README.md.
command -v circom >/dev/null || { echo 'circom is not installed' >&2; exit 1; }
command -v snarkjs >/dev/null || { echo 'snarkjs is not installed' >&2; exit 1; }
test -f node_modules/circomlib/circuits/poseidon.circom || { echo 'circomlib is missing from node_modules' >&2; exit 1; }

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
mkdir -p build public/artifacts contracts

if [ ! -f build/pot16_final.ptau ]; then
  snarkjs powersoftau new bn128 16 build/pot16_0000.ptau
  snarkjs powersoftau contribute build/pot16_0000.ptau build/pot16_0001.ptau --name="local development"
  snarkjs powersoftau prepare phase2 build/pot16_0001.ptau build/pot16_final.ptau
fi

for circuit_name in kyc aml solvency; do
  circuit_dir="build/$circuit_name"
  mkdir -p "$circuit_dir" "public/artifacts/$circuit_name"
  circom "circuits/$circuit_name.circom" --r1cs --wasm --sym -l node_modules -o "$circuit_dir"
  snarkjs groth16 setup "$circuit_dir/$circuit_name.r1cs" build/pot16_final.ptau "$circuit_dir/initial.zkey"
  snarkjs zkey contribute "$circuit_dir/initial.zkey" "$circuit_dir/final.zkey" --name="local development"
  snarkjs zkey export verificationkey "$circuit_dir/final.zkey" "public/artifacts/$circuit_name/verification_key.json"
  snarkjs zkey export solidityverifier "$circuit_dir/final.zkey" "contracts/${circuit_name}_verifier.sol"
  cp "$circuit_dir/${circuit_name}_js/$circuit_name.wasm" "public/artifacts/$circuit_name/circuit.wasm"
  cp "$circuit_dir/final.zkey" "public/artifacts/$circuit_name/proving_key.zkey"
done

echo 'Artifacts generated in public/artifacts/. These keys are for local demonstration only.'
