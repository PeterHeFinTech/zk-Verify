// Synthetic local demonstration only; NEVER production setup or live credentials.
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { compile, hash } from '../tests/helpers.mjs';

const dir='build/workflow';
if(existsSync(`${dir}/config.json`)) throw new Error('Workflow already initialized. Use the existing configuration; do not silently replace its keys.');
mkdirSync(dir,{recursive:true,mode:0o700});
function cli(args) {const r=spawnSync(process.execPath,['node_modules/snarkjs/build/cli.cjs',...args],{stdio:'inherit',timeout:240000}); if(r.status!==0) throw new Error('Development setup failed');}
console.log(compile('kyc_session'));
cli(['powersoftau','new','bn128','12',`${dir}/pot0.ptau`]);
cli(['powersoftau','contribute',`${dir}/pot0.ptau`,`${dir}/pot1.ptau`,'--name=LOCAL-DEV',`-e=${randomBytes(32).toString('hex')}`]);
cli(['powersoftau','prepare','phase2',`${dir}/pot1.ptau`,`${dir}/final.ptau`]);
cli(['groth16','setup','build/kyc_session/kyc_session.r1cs',`${dir}/final.ptau`,`${dir}/initial.zkey`]);
cli(['zkey','contribute',`${dir}/initial.zkey`,`${dir}/proving_key.zkey`,'--name=LOCAL-DEV',`-e=${randomBytes(32).toString('hex')}`]);
cli(['zkey','export','verificationkey',`${dir}/proving_key.zkey`,`${dir}/verification_key.json`]);
copyFileSync('build/kyc_session/kyc_session_js/kyc_session.wasm',`${dir}/circuit.wasm`);
const day=Math.floor(Date.now()/86400000);
const randomField=()=>BigInt('0x'+randomBytes(24).toString('hex')).toString();
const secret=randomField(),expiryDay=String(day+30);
const leaves=Array.from({length:8},()=>hash([randomField(),'0',expiryDay]));
leaves[0]=hash([secret,'1',expiryDay]);
const levels=[leaves];
while(levels.at(-1).length>1) {const a=levels.at(-1),b=[]; for(let i=0;i<a.length;i+=2)b.push(hash([a[i],a[i+1]]));levels.push(b);}
const witness={secret,verified:'1',expiryDay,pathElements:levels.slice(0,3).map(a=>a[1]),pathIndices:['0','0','0']};
// Removing the only verified credential changes the published root.
const revoked=[...leaves]; revoked[0]=hash([randomField(),'0',expiryDay]);
let next=revoked; while(next.length>1) {const b=[];for(let i=0;i<next.length;i+=2)b.push(hash([next[i],next[i+1]]));next=b;}
writeFileSync(`${dir}/holder.private.json`,JSON.stringify(witness,null,2),{mode:0o600,flag:'wx'});
writeFileSync(`${dir}/issuer-snapshot.json`,JSON.stringify({synthetic:true,issuer:'demo-issuer',root:levels.at(-1)[0],revokedRoot:next[0],epoch:1,validUntil:Date.now()+86400000},null,2),{mode:0o600,flag:'wx'});
const credentials={}, principals=[];
for(const [id,tenant,role] of [['issuer','demo','issuer'],['approver','demo','approver'],['holder','demo','holder'],['auditor','demo','verifier'],['other-holder','other','holder']]) {
  const token=randomBytes(32).toString('hex');credentials[id]=token;
  principals.push({id,tenant,role,tokenSha256:createHash('sha256').update(token).digest('hex')});
}
writeFileSync(`${dir}/credentials.json`,JSON.stringify(credentials,null,2),{mode:0o600,flag:'wx'});
const artifacts={};for(const name of ['circuit.wasm','proving_key.zkey','verification_key.json']) artifacts[name]={path:resolve(dir,name),sha256:createHash('sha256').update(readFileSync(`${dir}/${name}`)).digest('hex')};
const config={developmentOnly:true,allowedOrigins:['http://127.0.0.1:5173','http://localhost:5173'],relyingParty:'demo-bank',purposes:['account-opening'],principals,profile:{id:'kyc-session-v1',artifacts}};
writeFileSync(`${dir}/config.json`,JSON.stringify(config,null,2),{mode:0o600,flag:'wx'});
console.log('Created synthetic local workflow in build/workflow. No tokens printed. No public/private data directory is served by the API.');
process.exit(0);
