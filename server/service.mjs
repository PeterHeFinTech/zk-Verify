import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { groth16 } from 'snarkjs';

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const exact = (body, keys) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== [...keys].sort().join(',')) fail(400,'Unexpected or missing fields');
};
const identifier = v => { if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(v)) fail(400,'Invalid identifier'); return v; };
const field = v => { if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/.test(v) || v.length > 77 || BigInt(v) >= FIELD) fail(400,'Invalid field value'); return v; };

export function createService({config, database, now = Date.now}) {
  if (config.profile.id !== 'kyc-session-v1') throw new Error('Unsupported circuit profile');
  const artifacts = {};
  for (const name of ['circuit.wasm','proving_key.zkey','verification_key.json']) {
    const spec = config.profile.artifacts[name];
    const bytes = readFileSync(spec.path);
    if (sha256(bytes) !== spec.sha256) throw new Error(`Artifact integrity failure: ${name}`);
    artifacts[name] = bytes;
  }
  const vk = JSON.parse(artifacts['verification_key.json']);
  if (vk.protocol !== 'groth16' || vk.curve !== 'bn128' || vk.nPublic !== 4) throw new Error('Unexpected verifier profile');
  if (!Array.isArray(config.principals) || !config.principals.length) throw new Error('No principals configured');
  const unique = new Set();
  for (const p of config.principals) {
    identifier(p.id); identifier(p.tenant);
    if (!['issuer','approver','holder','verifier'].includes(p.role) || !/^[a-f0-9]{64}$/.test(p.tokenSha256) || unique.has(p.tokenSha256)) throw new Error('Invalid principal');
    unique.add(p.tokenSha256);
  }
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS issuers(tenant TEXT,id TEXT,PRIMARY KEY(tenant,id));
    CREATE TABLE IF NOT EXISTS roots(tenant TEXT,issuer TEXT,root TEXT,epoch INTEGER,validUntil INTEGER,PRIMARY KEY(tenant,issuer));
    CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY,tenant TEXT,issuer TEXT,root TEXT,epoch INTEGER,validUntil INTEGER,proposer TEXT,approved INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,tenant TEXT,owner TEXT,issuer TEXT,root TEXT,epoch INTEGER,day TEXT,context TEXT,rp TEXT,purpose TEXT,profile TEXT,keyHash TEXT,expires INTEGER,status TEXT);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,time INTEGER,actor TEXT,tenant TEXT,event TEXT,objectId TEXT);`);
  const audit = (p,event,id) => db.prepare('INSERT INTO audit(time,actor,tenant,event,objectId) VALUES(?,?,?,?,?)').run(now(),p.id,p.tenant,event,id);
  const role = (p, allowed) => { if (!allowed.includes(p.role)) fail(403,'Role not permitted'); };
  function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) {db.exec('ROLLBACK'); throw e;} }
  function authenticate(req) {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ') || auth.length > 512) fail(401,'Authentication required');
    const digest = Buffer.from(sha256(auth.slice(7)),'hex');
    const p = config.principals.find(p=>timingSafeEqual(digest,Buffer.from(p.tokenSha256,'hex')));
    if (!p) fail(401,'Authentication required');
    return p;
  }
  async function body(req) {
    if (req.headers['content-type'] !== 'application/json') fail(415,'JSON required');
    let size=0; const chunks=[];
    for await (const chunk of req) {size+=chunk.length; if(size>32768) fail(413,'Body too large'); chunks.push(chunk);}
    try {return JSON.parse(Buffer.concat(chunks).toString());} catch {fail(400,'Invalid JSON');}
  }
  const current = (tenant,issuer) => db.prepare('SELECT * FROM roots WHERE tenant=? AND issuer=?').get(tenant,issuer);
  function owned(p,id) {
    const r=db.prepare('SELECT * FROM requests WHERE id=? AND tenant=? AND owner=?').get(id,p.tenant,p.id);
    if(!r) fail(404,'Request not found'); return r;
  }
  function usable(r) {
    if(r.status !== 'pending') fail(409,'Request already completed');
    if(r.expires <= now() || r.day !== String(Math.floor(now()/86400000))) fail(410,'Request expired');
    const root=current(r.tenant,r.issuer);
    if(!root || root.root!==r.root || root.epoch!==r.epoch || root.validUntil<=now()) fail(409,'Root no longer current');
    if(r.profile!==config.profile.id || r.keyHash!==config.profile.artifacts['verification_key.json'].sha256) fail(409,'Profile no longer approved');
  }
  let verifying=false;
  const server=http.createServer(async (req,res)=> {
    const send = (status,value) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(value));};
    try {
      // No CORS; state-changing browser calls must originate from an explicitly allowed local UI.
      if(req.headers.origin && !config.allowedOrigins.includes(req.headers.origin)) fail(403,'Origin not permitted');
      const p=authenticate(req);
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.search) fail(400,'Query parameters are not accepted');
      const route=url.pathname.replace(/^\/api/,'');
      if(req.method==='GET' && route==='/v1/profile') return send(200,{id:config.profile.id,publicSignals:['response','issuerRoot','currentDay','context'],artifacts:Object.fromEntries(Object.entries(config.profile.artifacts).map(([name,s])=>[name,{sha256:s.sha256,url:`/api/v1/artifacts/${name}`}]))});
      if(req.method==='GET' && route.startsWith('/v1/artifacts/')) {
        const name=route.slice('/v1/artifacts/'.length);
        if(!Object.hasOwn(artifacts,name)) fail(404,'Not found');
        res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); return res.end(artifacts[name]);
      }
      if(req.method==='POST' && route==='/v1/issuers') {
        role(p,['issuer']); const b=await body(req); exact(b,['issuer']); identifier(b.issuer);
        transaction(()=>{if(db.prepare('SELECT 1 FROM issuers WHERE tenant=? AND id=?').get(p.tenant,b.issuer)) fail(409,'Issuer exists'); db.prepare('INSERT INTO issuers VALUES(?,?)').run(p.tenant,b.issuer); audit(p,'issuer.register',b.issuer);});
        return send(201,{issuer:b.issuer});
      }
      if(req.method==='POST' && route==='/v1/root-proposals') {
        role(p,['issuer']); const b=await body(req); exact(b,['issuer','root','epoch','validUntil']); identifier(b.issuer); field(b.root);
        if(!Number.isSafeInteger(b.epoch)||b.epoch<1||!Number.isSafeInteger(b.validUntil)||b.validUntil<=now()||b.validUntil>now()+30*86400000) fail(400,'Invalid epoch or expiry');
        if(!db.prepare('SELECT 1 FROM issuers WHERE tenant=? AND id=?').get(p.tenant,b.issuer)) fail(404,'Unknown issuer');
        const id=randomUUID();
        transaction(()=>{db.prepare('INSERT INTO proposals(id,tenant,issuer,root,epoch,validUntil,proposer) VALUES(?,?,?,?,?,?,?)').run(id,p.tenant,b.issuer,b.root,b.epoch,b.validUntil,p.id); audit(p,'root.propose',id);});
        return send(201,{id});
      }
      const approval=route.match(/^\/v1\/root-proposals\/([a-zA-Z0-9-]+)\/approve$/);
      if(req.method==='POST' && approval) {
        role(p,['approver']); exact(await body(req),[]);
        transaction(()=>{
          const proposal=db.prepare('SELECT * FROM proposals WHERE id=? AND tenant=?').get(approval[1],p.tenant);
          if(!proposal) fail(404,'Proposal not found');
          if(proposal.proposer===p.id) fail(403,'Independent approver required');
          const old=current(p.tenant,proposal.issuer);
          if(proposal.approved || proposal.validUntil<=now() || (old && (old.epoch>=proposal.epoch || old.root===proposal.root))) fail(409,'Stale or unchanged root proposal');
          db.prepare('INSERT OR REPLACE INTO roots VALUES(?,?,?,?,?)').run(p.tenant,proposal.issuer,proposal.root,proposal.epoch,proposal.validUntil);
          db.prepare('UPDATE proposals SET approved=1 WHERE id=?').run(proposal.id); audit(p,'root.approve',proposal.id);
        }); return send(200,{approved:true});
      }
      if(req.method==='GET' && route.startsWith('/v1/roots/')) {
        const r=current(p.tenant,identifier(route.slice('/v1/roots/'.length))); if(!r) fail(404,'Root not found'); return send(200,r);
      }
      if(req.method==='POST' && route==='/v1/requests') {
        role(p,['holder']); const b=await body(req); exact(b,['issuer','purpose']); identifier(b.issuer);
        if(!config.purposes.includes(b.purpose)) fail(400,'Unapproved purpose');
        const r=current(p.tenant,b.issuer); if(!r||r.validUntil<=now()) fail(409,'No current approved root');
        if(db.prepare("SELECT count(*) AS n FROM requests WHERE owner=? AND tenant=? AND status='pending' AND expires>?").get(p.id,p.tenant,now()).n>=20) fail(429,'Too many pending requests');
        const id=randomUUID(), day=String(Math.floor(now()/86400000)), rp=config.relyingParty;
        const keyHash=config.profile.artifacts['verification_key.json'].sha256;
        const digest=sha256(JSON.stringify(['zk-verify-request-v1',randomBytes(32).toString('hex'),id,p.tenant,p.id,rp,b.purpose,r.issuer,r.root,r.epoch,day,config.profile.id,keyHash]));
        const context=(BigInt('0x'+digest)%FIELD).toString();
        const expires=Math.min(now()+300000,r.validUntil,(Number(day)+1)*86400000);
        transaction(()=>{db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,p.tenant,p.id,b.issuer,r.root,r.epoch,day,context,rp,b.purpose,config.profile.id,keyHash,expires,'pending'); audit(p,'request.create',id);});
        return send(201,owned(p,id));
      }
      const match=route.match(/^\/v1\/requests\/([a-zA-Z0-9-]+)(\/proof)?$/);
      if(match && req.method==='GET' && !match[2]) {role(p,['holder']); return send(200,owned(p,match[1]));}
      if(match && req.method==='POST' && match[2]) {
        role(p,['holder']); const b=await body(req); exact(b,['proof','publicSignals']);
        const r=owned(p,match[1]); usable(r);
        if(!Array.isArray(b.publicSignals)||b.publicSignals.length!==4) fail(400,'Invalid public signals');
        b.publicSignals.forEach(field);
        if(b.publicSignals[1]!==r.root||b.publicSignals[2]!==r.day||b.publicSignals[3]!==r.context) fail(422,'Request context mismatch');
        exact(b.proof,['pi_a','pi_b','pi_c','protocol','curve']);
        if(b.proof.protocol!=='groth16'||b.proof.curve!=='bn128') fail(400,'Invalid proof profile');
        const coordinate=v=>{if(typeof v!=='string'||!/^\d{1,78}$/.test(v)) fail(400,'Invalid proof coordinate');};
        for(const name of ['pi_a','pi_c']) {if(!Array.isArray(b.proof[name])||b.proof[name].length!==3) fail(400,'Invalid proof shape'); b.proof[name].forEach(coordinate);}
        if(!Array.isArray(b.proof.pi_b)||b.proof.pi_b.length!==3) fail(400,'Invalid proof shape');
        for(const pair of b.proof.pi_b) {if(!Array.isArray(pair)||pair.length!==2) fail(400,'Invalid proof shape'); pair.forEach(coordinate);}
        if(verifying) fail(503,'Verifier busy; retry later');
        verifying=true; let valid=false;
        try {valid=await groth16.verify(vk,b.publicSignals,b.proof);} catch {valid=false;} finally {verifying=false;}
        if(!valid) {audit(p,'proof.invalid',r.id); fail(422,'Cryptographic proof rejected');}
        transaction(()=>{usable(owned(p,r.id)); const result=db.prepare("UPDATE requests SET status='accepted' WHERE id=? AND status='pending'").run(r.id); if(result.changes!==1) fail(409,'Request already completed'); audit(p,'proof.accept',r.id);});
        return send(200,{id:r.id,status:'accepted',scope:'Current-root, request-bound credential relation only; not regulatory certification'});
      }
      const resultRoute=route.match(/^\/v1\/results\/([a-zA-Z0-9-]+)$/);
      if(req.method==='GET' && resultRoute) {
        role(p,['verifier']);
        const result=db.prepare('SELECT id,status,issuer,epoch,rp,purpose,profile,expires FROM requests WHERE id=? AND tenant=?').get(resultRoute[1],p.tenant);
        if(!result) fail(404,'Result not found');
        return send(200,{...result,scope:'Historical decision for this request; not continuing credential validity'});
      }
      if(req.method==='GET' && route==='/v1/audit') {role(p,['verifier']); return send(200,db.prepare('SELECT time,actor,event,objectId FROM audit WHERE tenant=? ORDER BY id DESC LIMIT 100').all(p.tenant));}
      fail(404,'Not found');
    } catch(e) {send(e.status||500,{error:e.status?e.message:'Internal error'});}
  });
  server.requestTimeout=15000; server.headersTimeout=10000; server.maxHeadersCount=30;
  return {server,close:async()=>{await new Promise(resolve=>server.close(resolve)); db.close();}};
}
