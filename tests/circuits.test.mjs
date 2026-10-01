import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { compile, calculator, credential, vectors, hash, pad, FIELD } from './helpers.mjs';

const calculators = {};
for (const name of ['kyc', 'aml', 'solvency']) {
  compile(name);
  calculators[name] = await calculator(name);
}
const accept = (name, input) => calculators[name].calculateWitness(input, true);
const reject = (name, input) => assert.rejects(() => accept(name, input));

test('KYC: valid paths, inclusive expiry boundary, invalid root/secret/flag/path/date', async () => {
  const good = credential();
  await accept('kyc', good);
  await accept('kyc', {...good, currentDay: good.expiryDay});
  for (const change of [{issuerRoot: '0'}, {secret: '2'}, {verified: '0'}, {verified: '2'}, {currentDay: '21001'}, {currentDay: '4294967296'}, {expiryDay: '4294967296'}, {pathIndices: ['2', '1', '0']}, {pathElements: ['0', ...good.pathElements.slice(1)]}]) await reject('kyc', {...good, ...change});
});

test('AML: disjoint, overlap, full vectors, active zero and commitment mismatch', async () => {
  await accept('aml', vectors('aml'));
  await accept('aml', vectors('aml', [0], [1]));
  await reject('aml', vectors('aml', [0], [0]));
  await reject('aml', vectors('aml', [1, 2], [3, 2]));
  await accept('aml', vectors('aml', [1,2,3,4,5,6,7,8], [9,10,11,12,13,14,15,16]));
  await reject('aml', {...vectors('aml'), watchlistRoot: '1'});
});

test('Counts: both circuits reject zero, nine, sixteen, field minus one; accept one/eight', async () => {
  for (const name of ['aml', 'solvency']) {
    const keys = name === 'aml' ? ['customerCount', 'watchlistCount'] : ['assetCount', 'liabilityCount'];
    for (const key of keys) for (const count of ['0', '9', '16', (FIELD - 1n).toString()]) await reject(name, {...vectors(name), [key]: count});
    for (const size of [1,8]) await accept(name, vectors(name, Array(size).fill(2), Array(size).fill(1)));
  }
});

test('Padding is constrained even when a matching commitment is supplied', async () => {
  for (const name of ['aml', 'solvency']) {
    const input = vectors(name);
    const [key, root] = name === 'aml' ? ['customers', 'customerRoot'] : ['assets', 'assetRoot'];
    input[key][7] = '123'; input[root] = hash(input[key]);
    await reject(name, input);
  }
});

test('Solvency: equality/zero/max totals pass; deficit/out-of-range values fail', async () => {
  for (const values of [[0], [1], Array(8).fill('4294967295')]) await accept('solvency', vectors('solvency', values, values));
  await reject('solvency', vectors('solvency', [99], [100]));
  await reject('solvency', vectors('solvency', ['4294967296'], [1]));
  await reject('solvency', vectors('solvency', [(FIELD - 1n).toString()], [1]));
  await reject('solvency', {...vectors('solvency'), assetRoot: hash(pad([1]))});
});

test('Deterministic generated vectors agree with plaintext reference (40 cases)', async () => {
  let state = 987654321;
  const next = () => (state = (Math.imul(1664525, state) + 1013904223) >>> 0);
  for (let i = 0; i < 20; i++) {
    const a = Array.from({length: 1 + next() % 8}, () => next() % 30);
    const b = Array.from({length: 1 + next() % 8}, () => next() % 30);
    for (const name of ['aml','solvency']) {
      const valid = name === 'aml' ? !a.some(x => b.includes(x)) : a.reduce((x,y) => x+y,0) >= b.reduce((x,y) => x+y,0);
      if (valid) await accept(name, vectors(name,a,b)); else await reject(name, vectors(name,a,b));
    }
  }
});

test('Input helper rejects lossy numbers and field overflow, and refuses overwrite', () => {
  mkdirSync('build/input-tests', {recursive:true});
  let i = 0;
  for (const [source, valid] of [[{assets:['100'], liabilities:['99']}, true], [{assets:[100], liabilities:['99']}, false], [{assets:['9007199254740993'], liabilities:['99']}, false], [{assets:[FIELD.toString()], liabilities:['99']}, false], [{assets:[], liabilities:['99']}, false]]) {
    const input = `build/input-tests/source-${i}.json`;
    const output = `build/input-tests/result-${i++}.json`;
    rmSync(output, {force:true});
    writeFileSync(input, JSON.stringify(source));
    const run = () => spawnSync(process.execPath, ['scripts/prepare-input.mjs','solvency',input,output], {encoding:'utf8', timeout:30000});
    assert.equal(run().status === 0, valid);
    assert.equal(existsSync(output), valid);
    if (valid) assert.notEqual(run().status, 0);
  }
});
// circomlibjs owns worker threads; explicitly terminate after node:test finishes.
after(async () => { const { getCurveFromName } = await import('ffjavascript'); const curve = await getCurveFromName('bn128'); await curve.terminate(); });
