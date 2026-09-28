import { readFile, writeFile } from 'node:fs/promises';
import { buildPoseidon } from 'circomlibjs';

const [kind, sourcePath, outputPath] = process.argv.slice(2);
if (!['kyc', 'aml', 'solvency'].includes(kind) || !sourcePath || !outputPath) {
  console.error('Usage: node scripts/prepare-input.mjs <kyc|aml|solvency> <source.json> <private-input.json>');
  process.exit(1);
}

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const poseidon = await buildPoseidon();
const F = poseidon.F;
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const MAX32 = 2n ** 32n;

function field(value, label) {
  if (!/^(0|[1-9][0-9]*)$/.test(String(value))) throw new Error(`${label} must be a non-negative decimal integer`);
  const number = BigInt(value);
  if (number >= FIELD) throw new Error(`${label} exceeds the circuit field`);
  return number;
}

function u32(value, label) {
  const number = field(value, label);
  if (number >= MAX32) throw new Error(`${label} must be less than 2^32`);
  return number;
}

function hash(values) {
  return F.toObject(poseidon(values)).toString();
}

function fixedArray(values, label, range = field) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 8) {
    throw new Error(`${label} must contain between 1 and 8 values`);
  }
  const parsed = values.map((value, index) => range(value, `${label}[${index}]`));
  return [...parsed, ...Array(8 - parsed.length).fill(0n)].map(String);
}

let result;
if (kind === 'aml') {
  const customers = fixedArray(source.customers, 'customers');
  const watchlist = fixedArray(source.watchlist, 'watchlist');
  result = {
    customers,
    watchlist,
    customerCount: String(source.customers.length),
    watchlistCount: String(source.watchlist.length),
    customerRoot: hash(customers.map(BigInt)),
    watchlistRoot: hash(watchlist.map(BigInt)),
  };
} else if (kind === 'solvency') {
  const assets = fixedArray(source.assets, 'assets', u32);
  const liabilities = fixedArray(source.liabilities, 'liabilities', u32);
  result = {
    assets,
    liabilities,
    assetCount: String(source.assets.length),
    liabilityCount: String(source.liabilities.length),
    assetRoot: hash(assets.map(BigInt)),
    liabilityRoot: hash(liabilities.map(BigInt)),
  };
} else {
  if (!Array.isArray(source.credentials) || source.credentials.length < 1 || source.credentials.length > 8) {
    throw new Error('credentials must contain between 1 and 8 entries');
  }
  const index = Number(source.selectedIndex);
  if (!Number.isInteger(index) || index < 0 || index >= source.credentials.length) {
    throw new Error('selectedIndex must identify an existing credential');
  }
  const credential = source.credentials[index];
  const leaves = source.credentials.map((entry, i) => hash([
    field(entry.secret, `credentials[${i}].secret`),
    field(entry.verified, `credentials[${i}].verified`),
    u32(entry.expiryDay, `credentials[${i}].expiryDay`),
  ]));
  const emptyLeaf = hash([0n, 0n, 0n]);
  while (leaves.length < 8) leaves.push(emptyLeaf);
  const pathElements = [];
  const pathIndices = [];
  let level = leaves;
  let position = index;
  for (let depth = 0; depth < 3; depth++) {
    pathElements.push(level[position ^ 1]);
    pathIndices.push(String(position & 1));
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(hash([BigInt(level[i]), BigInt(level[i + 1])]));
    level = next;
    position = Math.floor(position / 2);
  }
  result = {
    secret: String(field(credential.secret, 'selected secret')),
    verified: String(field(credential.verified, 'selected verified')),
    expiryDay: String(u32(credential.expiryDay, 'selected expiryDay')),
    pathElements,
    pathIndices,
    issuerRoot: level[0],
    currentDay: String(u32(source.currentDay, 'currentDay')),
  };
}

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
console.log(`Prepared ${kind} input in ${outputPath}`);
if (kind === 'kyc') console.log(`Trusted issuer must publish this root: ${result.issuerRoot}`);
else console.log(`Commitments: ${kind === 'aml' ? `${result.customerRoot} ${result.watchlistRoot}` : `${result.assetRoot} ${result.liabilityRoot}`}`);
