import React, {useRef,useState} from 'react';
import * as snarkjs from 'snarkjs';

export function Workflow() {
  const token=useRef('');
  const witness=useRef(null);
  const [status,setStatus]=useState('Local demonstration: enter the synthetic holder token. Private input is never uploaded.');
  const [busy,setBusy]=useState(false);
  const [request,setRequest]=useState(null);
  const [loaded,setLoaded]=useState(false);
  async function api(path,body) {
    const r=await fetch('/api/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token.current,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const value=await r.json();if(!r.ok)throw new Error(value.error||'API error');return value;
  }
  async function load(file) {
    witness.current=null;setLoaded(false);
    if(!file)return;
    if(file.size>16384){setStatus('Credential file too large.');return;}
    try {
      const value=JSON.parse(await file.text());
      const keys=['secret','verified','expiryDay','pathElements','pathIndices'];
      if(!value||Object.keys(value).sort().join(',')!==keys.sort().join(','))throw new Error('Expected session credential fields only');
      witness.current=value;setLoaded(true);setStatus('Credential loaded locally; it has not been sent to the API.');
    }catch{setStatus('Invalid local credential file.');}
  }
  async function create() {
    setBusy(true);setRequest(null);
    try {const r=await api('requests',{issuer:'demo-issuer',purpose:'account-opening'});setRequest(r);setStatus('Request issued by demo-bank for account-opening; expires '+new Date(r.expires).toISOString());}
    catch(e){setStatus('Request rejected: '+e.message);}finally{setBusy(false);}
  }
  async function prove() {
    if(!request||!witness.current)return;
    setBusy(true);setStatus('Generating proof locally. Only proof and four public signals will be submitted.');
    const urls=[];
    try {
      const profile=await api('profile');
      if(profile.id!==request.profile)throw new Error('Profile changed; create a new request');
      for(const name of ['circuit.wasm','proving_key.zkey']) {
        const a=profile.artifacts[name];
        if(a.url!==`/api/v1/artifacts/${name}`)throw new Error('Unexpected artifact destination');
        const r=await fetch(a.url,{headers:{Authorization:'Bearer '+token.current}});
        if(!r.ok)throw new Error('Artifact download failed');
        const bytes=await r.arrayBuffer();
        const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
        if(digest!==a.sha256)throw new Error('Artifact integrity failure');
        urls.push(URL.createObjectURL(new Blob([bytes])));
      }
      const result=await snarkjs.groth16.fullProve({...witness.current,issuerRoot:request.root,currentDay:request.day,context:request.context},urls[0],urls[1]);
      const accepted=await api(`requests/${request.id}/proof`,{proof:result.proof,publicSignals:result.publicSignals});
      setStatus('Verifier accepted: '+accepted.scope);setRequest(null);
    }catch{setStatus('Verification failed. The credential may be revoked, expired, mismatched, or the request already used. No private input was submitted.');}
    finally{urls.forEach(URL.revokeObjectURL);setBusy(false);}
  }
  return <section className="panel" aria-label="Trusted KYC workflow">
    <h2>Request-bound KYC demonstration</h2>
    <p>Issuer-approved current root · independent verifier · browser-local proof</p>
    <div className="warning">Synthetic local environment only. A separate issuer and approver must publish a root first. No SSO, MFA or regulatory certification. Tokens stay in memory; do not use real credentials.</div>
    <label>Demo holder token <input aria-label="Demo holder token" type="password" autoComplete="off" disabled={busy} onChange={e=>{token.current=e.target.value;setRequest(null);}} /></label>
    <p><label>Local session credential <input aria-label="Local session credential" type="file" accept=".json" disabled={busy} onChange={e=>load(e.target.files?.[0])}/></label></p>
    <button disabled={busy} onClick={create}>Create verification request</button>{' '}
    <button disabled={busy||!request||!loaded} onClick={prove}>Prove locally and submit</button>
    <p role="status">{status}</p>
  </section>;
}
