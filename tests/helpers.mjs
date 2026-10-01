import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildPoseidon } from 'circomlibjs';
const require = createRequire(import.meta.url);
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const root = new URL('../', import.meta.url).pathname;
export function compile(name, source = `circuits/${name}.circom`) {
  mkdirSync(`build/${name}`, {recursive: true});
  writeFileSync('build/package.json', '{"type":"commonjs"}\n');
  const result = spawnSync(process.execPath, ['node_modules/circom2/cli.js', source, '--r1cs', '--wasm', '--sym', '-l', 'node_modules', '-l', 'circuits', '-o', `build/${name}`], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  return result.stdout.replace(/\u001b\[[0-9;]*m/g, '');
}
export async function calculator(name) {
  const builder = require(`../build/${name}/${name}_js/witness_calculator.js`);
  return builder(readFileSync(`build/${name}/${name}_js/${name}.wasm`));
}
const poseidon = await buildPoseidon();
export const hash = values => poseidon.F.toObject(poseidon(values.map(BigInt))).toString();
export const pad = values => [...values.map(String), ...Array(8 - values.length).fill('0')];
export function vectors(kind, left = [100, 50], right = [30, 20]) {
  const [a, b, ac, bc, ar, br] = kind === 'aml' ? ['customers', 'watchlist', 'customerCount', 'watchlistCount', 'customerRoot', 'watchlistRoot'] : ['assets', 'liabilities', 'assetCount', 'liabilityCount', 'assetRoot', 'liabilityRoot'];
  return {[a]: pad(left), [b]: pad(right), [ac]: String(left.length), [bc]: String(right.length), [ar]: hash(pad(left)), [br]: hash(pad(right))};
}
// Synthetic authentication path: benchmark path verification, not a populated registry.
export function credential(depth = 3) {
  const input = {secret: '1234567', verified: '1', expiryDay: '21000', currentDay: '20000', pathElements: [], pathIndices: []};
  let node = hash([input.secret, input.verified, input.expiryDay]);
  for (let i = 0; i < depth; i++) {
    const sibling = hash([String(i + 100), '0']);
    const side = i % 2;
    input.pathElements.push(sibling); input.pathIndices.push(String(side));
    node = hash(side ? [sibling, node] : [node, sibling]);
  }
  return {...input, issuerRoot: node};
}
