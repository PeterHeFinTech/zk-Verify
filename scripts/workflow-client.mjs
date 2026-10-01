// Run INSIDE the holder/institution environment. Private witness is never submitted.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { groth16 } from 'snarkjs';
const [action,argument]=process.argv.slice(2);
const base=process.env.ZK_API||'http://127.0.0.1:8787';
if(!['http://127.0.0.1:8787','http://localhost:8787'].includes(base)) throw new Error('Demo client is restricted to loopback; production transport requires a separate reviewed configuration.');
const credentials=JSON.parse(readFileSync('build/workflow/credentials.json'));
async function api(path,principal,body) {
  const r=await fetch(base+'/api/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+credentials[principal],...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await r.json();if(!r.ok)throw new Error(`${r.status}: ${data.error}`);return data;
}
try {
  const snapshot=JSON.parse(readFileSync('build/workflow/issuer-snapshot.json'));
  if(action==='register') {await api('issuers','issuer',{issuer:snapshot.issuer});console.log('Synthetic issuer registered.');}
  else if(action==='propose'||action==='revoke') {
    const current=action==='revoke'?await api('roots/'+snapshot.issuer,'issuer'):null;
    const proposal=await api('root-proposals','issuer',{issuer:snapshot.issuer,root:action==='revoke'?snapshot.revokedRoot:snapshot.root,epoch:current?current.epoch+1:snapshot.epoch,validUntil:Date.now()+86400000});
    console.log('Proposal created. A separate approver must approve this ID:',proposal.id);
  } else if(action==='approve') {if(!argument)throw new Error('Proposal ID required');console.log(await api(`root-proposals/${argument}/approve`,'approver',{}));}
  else if(action==='prove') {
    const request=await api('requests','holder',{issuer:snapshot.issuer,purpose:'account-opening'});
    const profile=await api('profile','holder');
    // Pin artifact bytes before using local files. A trusted HTTPS/configuration channel is still required in production.
    for(const name of ['circuit.wasm','proving_key.zkey']) {
      const digest=createHash('sha256').update(readFileSync('build/workflow/'+name)).digest('hex');
      if(digest!==profile.artifacts[name].sha256)throw new Error('Artifact mismatch');
    }
    const witness=JSON.parse(readFileSync(argument||'build/workflow/holder.private.json'));
    const result=await groth16.fullProve({...witness,issuerRoot:request.root,currentDay:request.day,context:request.context},'build/workflow/circuit.wasm','build/workflow/proving_key.zkey');
    console.log(await api(`requests/${request.id}/proof`,'holder',{proof:result.proof,publicSignals:result.publicSignals}));
  } else if(action==='audit') console.log(await api('audit','auditor'));
  else throw new Error('Usage: node scripts/workflow-client.mjs register|propose|approve <id>|prove [private-file]|revoke|audit');
  process.exit(0);
} catch(e) {console.error(e.message);process.exit(1);}
