import { mkdirSync, writeFileSync, statSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { compile, calculator, credential } from '../tests/helpers.mjs';
const rows = [];
for (const depth of [3,8,16,20]) {
  const name = `kyc_depth_${depth}`;
  const source = `circuits/${name}.circom`;
  writeFileSync(source, `pragma circom 2.1.6;\ninclude "kyc_template.circom";\ncomponent main {public [issuerRoot,currentDay]} = PrivateKYC(${depth});\n`, {flag:'wx'});
  let output;
  const start = performance.now();
  try { output = compile(name,source); } finally { unlinkSync(source); }
  const compileMs = performance.now()-start;
  const wc = await calculator(name);
  const input = credential(depth);
  await wc.calculateWitness(input,true);
  const timings=[];
  for (let i=0;i<5;i++) {const t=performance.now(); await wc.calculateWitness(input,true); timings.push(performance.now()-t);}
  timings.sort((a,b)=>a-b);
  const nonlinear = Number(output.match(/non-linear constraints: (\d+)/)[1]);
  const linear = Number(output.match(/\nlinear constraints: (\d+)/)[1]);
  rows.push({depth, theoreticalLeafCapacity:2**depth, nonlinearConstraints:nonlinear, linearConstraints:linear, totalConstraints:nonlinear+linear, compileMs:Math.round(compileMs), medianWitnessMs:Number(timings[2].toFixed(2)), wasmBytes:statSync(`build/${name}/${name}_js/${name}.wasm`).size, r1csBytes:statSync(`build/${name}/${name}.r1cs`).size});
}
mkdirSync('build/review',{recursive:true});
const report = {node:process.version, platform:process.platform, arch:process.arch, cpu:os.cpus()[0].model, ramBytes:os.totalmem(), rows, limitations:'Synthetic Merkle paths only, NOT populated registries. Five warm witness runs per depth, single compile. No larger-depth Groth16 setup/proving, registry build/update, peak memory, concurrency or network benchmark.'};
writeFileSync('build/review/kyc-benchmark.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exit(0);
