// Verifier-owned policy must arrive independently of the prover's bundle.
// This checks context but does NOT add session binding, revocation or signatures.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { groth16 } from 'snarkjs';
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const SCHEMAS = {kyc:['issuerRoot','currentDay'], aml:['customerCount','watchlistCount','customerRoot','watchlistRoot'], solvency:['assetCount','liabilityCount','assetRoot','liabilityRoot']};
export async function verifyWithPolicy({proof, publicSignals, verificationKeyBytes, policy, now = Date.now()}) {
  if (!policy || policy.version !== 1 || !SCHEMAS[policy.module]) throw new Error('Unsupported verifier policy');
  const expiry = Date.parse(policy.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) throw new Error('Verifier policy expired or missing expiry');
  if (!/^[a-f0-9]{64}$/.test(policy.verificationKeySha256 || '')) throw new Error('Missing pinned verification-key SHA-256');
  const digest = createHash('sha256').update(verificationKeyBytes).digest('hex');
  if (digest !== policy.verificationKeySha256) throw new Error('Verification key does not match verifier policy');
  const fields = SCHEMAS[policy.module];
  if (!Array.isArray(publicSignals) || publicSignals.length !== fields.length) throw new Error('Public signal length mismatch');
  const expected = policy.expected;
  if (!expected || Object.keys(expected).length !== fields.length) throw new Error('Policy must specify every public signal');
  for (const [index, field] of fields.entries()) {
    for (const value of [publicSignals[index], expected[field]]) {
      if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) >= FIELD) throw new Error(`Noncanonical field: ${field}`);
    }
    if (publicSignals[index] !== expected[field]) throw new Error(`Policy mismatch: ${field}`);
    if (field.endsWith('Count') && (BigInt(publicSignals[index]) < 1n || BigInt(publicSignals[index]) > 8n)) throw new Error(`Count outside profile: ${field}`);
  }
  if (policy.module === 'kyc' && expected.currentDay !== String(Math.floor(now / 86400000))) throw new Error('KYC currentDay must equal verifier UTC day');
  const vk = JSON.parse(verificationKeyBytes.toString('utf8'));
  if (vk.protocol !== 'groth16' || vk.curve !== 'bn128' || vk.nPublic !== fields.length) throw new Error('Verification-key profile mismatch');
  if (!await groth16.verify(vk, publicSignals, proof)) throw new Error('Cryptographic proof invalid');
  return {accepted:true, module:policy.module, verificationKeySha256:digest, warning:'Accepted under this verifier policy only; no regulatory certification, session binding, underlying-data audit or policy authenticity check is implied.'};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [proofPath,signalsPath,keyPath,policyPath] = process.argv.slice(2);
    if (!policyPath) throw new Error('Usage: node scripts/verify-proof.mjs <proof.json> <signals.json> <verification_key.json> <verifier-policy.json>');
    const result = await verifyWithPolicy({proof:JSON.parse(await readFile(proofPath,'utf8')),publicSignals:JSON.parse(await readFile(signalsPath,'utf8')),verificationKeyBytes:await readFile(keyPath),policy:JSON.parse(await readFile(policyPath,'utf8'))});
    console.log(JSON.stringify(result,null,2)); process.exit(0);
  } catch (error) {console.error(`Rejected: ${error.message}`); process.exit(1);}
}
