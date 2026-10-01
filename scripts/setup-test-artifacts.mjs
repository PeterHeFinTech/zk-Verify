// DEVELOPMENT ONLY. Local, single-party setup is not a production ceremony.
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { compile, credential, vectors } from '../tests/helpers.mjs';
function cli(args) {
  const r = spawnSync(process.execPath, ['node_modules/snarkjs/build/cli.cjs', ...args], {stdio:'inherit', timeout:240000});
  if (r.status !== 0) throw new Error(`snarkjs failed: ${args.join(' ')}`);
}
mkdirSync('build/test-setup', {recursive:true});
writeFileSync('build/test-setup/README.txt', 'LOCAL DEVELOPMENT KEYS ONLY. DO NOT DEPLOY OR TRUST FOR REAL CLAIMS.\n');
for (const name of ['kyc','aml','solvency']) console.log(compile(name));
cli(['powersoftau','new','bn128','12','build/test-setup/pot0.ptau']);
cli(['powersoftau','contribute','build/test-setup/pot0.ptau','build/test-setup/pot1.ptau','--name=local-test', `-e=${randomBytes(32).toString('hex')}`]);
cli(['powersoftau','prepare','phase2','build/test-setup/pot1.ptau','build/test-setup/final.ptau']);
for (const name of ['kyc','aml','solvency']) {
  const dest = `build/test-setup/${name}`;
  mkdirSync(dest, {recursive:true});
  cli(['groth16','setup',`build/${name}/${name}.r1cs`,'build/test-setup/final.ptau',`${dest}/initial.zkey`]);
  cli(['zkey','contribute',`${dest}/initial.zkey`,`${dest}/proving_key.zkey`,'--name=local-test',`-e=${randomBytes(32).toString('hex')}`]);
  cli(['zkey','export','verificationkey',`${dest}/proving_key.zkey`,`${dest}/verification_key.json`]);
  copyFileSync(`build/${name}/${name}_js/${name}.wasm`,`${dest}/circuit.wasm`);
  writeFileSync(`${dest}/input.private.json`,JSON.stringify(name === 'kyc' ? credential() : vectors(name)), {mode:0o600});
}
console.log('Development-only artifacts generated in build/test-setup; existing contracts/public artifacts were NOT overwritten.');
process.exit(0);
