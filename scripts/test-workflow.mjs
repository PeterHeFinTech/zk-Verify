import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { groth16 } from 'snarkjs';
import { createService } from '../server/service.mjs';
import { hash } from '../tests/helpers.mjs';
const config=JSON.parse(readFileSync('build/workflow/config.json'));
const tokens=JSON.parse(readFileSync('build/workflow/credentials.json'));
const fixture=JSON.parse(readFileSync('build/workflow/issuer-snapshot.json'));
const witness=JSON.parse(readFileSync('build/workflow/holder.private.json'));
let clock=Date.now(),app,base;
const database=`build/workflow/test-${randomUUID()}.sqlite`;
const checks=[],timings=[];
async function start(){app=createService({config,database,now:()=>clock});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}/api/v1/`;}
async function api(path,who='holder',body,extra={}){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+(tokens[who]||'invalid'),...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
const expect=async(p,status,label)=>{const r=await p;assert.equal(r.status,status,`${label}: ${JSON.stringify(r.data)}`);checks.push(label);return r.data;};
async function publish(root,epoch){const p=await expect(api('root-proposals','issuer',{issuer:fixture.issuer,root,epoch,validUntil:clock+86400000}),201,'root proposal');await expect(api(`root-proposals/${p.id}/approve`,'issuer',{}),403,'issuer cannot approve');await expect(api(`root-proposals/${p.id}/approve`,'approver',{}),200,'independent approval');}
const request=()=>api('requests','holder',{issuer:fixture.issuer,purpose:'account-opening'});
async function proof(r){const t=performance.now();const result=await groth16.fullProve({...witness,issuerRoot:r.root,currentDay:r.day,context:r.context},'build/workflow/circuit.wasm','build/workflow/proving_key.zkey');timings.push(performance.now()-t);assert.deepEqual(result.publicSignals,[hash(['20261001',witness.secret,r.context]),r.root,r.day,r.context]);return result;}
try{
 await start();
 await expect(api('profile','invalid'),401,'missing authentication');
 await expect(api('profile','holder',undefined,{Origin:'https://untrusted.example'}),403,'unapproved origin');
 await expect(request(),409,'unknown root fails closed');
 await expect(api('issuers','holder',{issuer:fixture.issuer}),403,'holder cannot register issuer');
 await expect(api('issuers','issuer',{issuer:fixture.issuer}),201,'issuer registration');
 await publish(fixture.root,1);
 await expect(api('roots/'+fixture.issuer,'other-holder'),404,'tenant root isolation');
 const r=await expect(request(),201,'request creation');
 await expect(api('requests/'+r.id,'other-holder'),404,'cross-tenant request isolation');
 const p=await proof(r);
 const wrong={proof:p.proof,publicSignals:[...p.publicSignals]};wrong.publicSignals[3]='0';
 await expect(api(`requests/${r.id}/proof`,'holder',wrong),422,'context substitution rejected');
 await expect(api(`requests/${r.id}/proof`,'holder',{...p,secret:witness.secret}),400,'private fields rejected by schema');
 const forged={proof:{...p.proof,pi_a:['0','0','1']},publicSignals:p.publicSignals};
 await expect(api(`requests/${r.id}/proof`,'holder',forged),422,'forged proof rejected');
 const r2=await expect(request(),201,'second request');
 await expect(api(`requests/${r2.id}/proof`,'holder',p),422,'proof cannot move to another request');
 const changed={proof:p.proof,publicSignals:[p.publicSignals[0],r2.root,r2.day,r2.context]};
 await expect(api(`requests/${r2.id}/proof`,'holder',changed),422,'editing signals cannot rebind proof');
 const pair=await Promise.all([api(`requests/${r.id}/proof`,'holder',p),api(`requests/${r.id}/proof`,'holder',p)]);
 assert.equal(pair.filter(v=>v.status===200).length,1);assert.ok(pair.some(v=>[409,503].includes(v.status)));checks.push('concurrent duplicate accepts exactly once');
 await expect(api(`requests/${r.id}/proof`,'holder',p),409,'replay rejected');
 const decision=await expect(api('results/'+r.id,'auditor'),200,'relying-party result retrieval');assert.equal(decision.status,'accepted');
 await expect(api('results/'+r.id,'holder'),403,'result role separation');
 await expect(api(`requests/${r2.id}/proof`,'holder',{proof:{...p.proof,witness:'not-allowed'},publicSignals:p.publicSignals.map((v,i)=>i===3?r2.context:v)}),400,'nested proof extras rejected');
 await app.close();await start();
 const persisted=await expect(api('requests/'+r.id),200,'restart recovery');assert.equal(persisted.status,'accepted');
 await expect(api(`requests/${r.id}/proof`,'holder',p),409,'replay rejected after restart');
 const expiring=await expect(request(),201,'expiring request');clock+=300001;
 await expect(api(`requests/${expiring.id}/proof`,'holder',p),410,'expired request rejected');
 const stale=await expect(request(),201,'pre-revocation request');const oldProof=await proof(stale);
 await publish(fixture.revokedRoot,2);
 await expect(api(`requests/${stale.id}/proof`,'holder',oldProof),409,'root rotation invalidates pending proof');
 const revoked=await expect(request(),201,'request uses replacement root');
 await assert.rejects(()=>proof(revoked));checks.push('removed credential cannot prove replacement root');
 const audit=await expect(api('audit','auditor'),200,'authorized audit access');
 assert.ok(audit.some(x=>x.event==='proof.accept'));
 const encoded=JSON.stringify(audit);assert.ok(!encoded.includes(witness.secret));assert.ok(!encoded.includes(tokens.holder));checks.push('audit excludes credential secret and token');
 await expect(api('audit','holder'),403,'audit role separation');
 // Artifact trust is checked before the service starts.
 const bad=structuredClone(config);bad.profile.artifacts['verification_key.json'].sha256='0'.repeat(64);
 assert.throws(()=>createService({config:bad,database:'build/workflow/unused.sqlite'}),/integrity/);checks.push('unapproved key fails startup');
 mkdirSync('docs/review-results',{recursive:true});
 const result={suite:'request-bound KYC integration',checks,proofGenerationMs:timings.map(Math.round),node:process.version,peakProcessRssBytes:process.resourceUsage().maxRSS*1024,limitations:'Synthetic fixture; local single-party setup. RSS is combined test/verifier/prover process, not isolated worker. Two proof timing samples are not p95/throughput. No forced power-loss recovery, TLS or production authentication tested.'};
 writeFileSync('docs/review-results/workflow-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{if(app)await app.close();}
process.exit(0);
