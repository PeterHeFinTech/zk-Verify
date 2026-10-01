import React, { useRef, useState } from 'react';
import * as snarkjs from 'snarkjs';

const MODULES = {
  kyc: {
    title: 'Private KYC',
    subtitle: 'Prove inclusion in an issuer-controlled credential tree and validity at a stated time.',
    statement: 'The private credential is verified, unexpired, and included under the public issuer root.',
    disclosure: 'Issuer root, current day, and proof. The credential secret and Merkle path remain local.',
    caveat: 'The issuer must construct and publish the root. This circuit does not check an issuer signature or revocation.',
    schema: '{\n  "secret": "...",\n  "verified": "1",\n  "expiryDay": "...",\n  "pathElements": ["...", "...", "..."],\n  "pathIndices": ["0", "1", "0"],\n  "issuerRoot": "...",\n  "currentDay": "..."\n}',
  },
  aml: {
    title: 'Private screening',
    subtitle: 'Check exact identifiers in two committed, fixed-size sets.',
    statement: 'No active customer identifier equals an active watchlist identifier.',
    disclosure: 'Two commitments, two active lengths, and proof. Set members remain local.',
    caveat: 'A bounded exact-match circuit is used here; this is not a production PSI protocol or fuzzy sanctions screening.',
    schema: '{\n  "customers": ["... eight values ..."],\n  "watchlist": ["... eight values ..."],\n  "customerCount": "...",\n  "watchlistCount": "...",\n  "customerRoot": "...",\n  "watchlistRoot": "..."\n}',
  },
  solvency: {
    title: 'Private solvency',
    subtitle: 'Compare bounded totals of committed assets and liabilities.',
    statement: 'The total of the active asset values is at least the total of the active liability values.',
    disclosure: 'Two commitments, active lengths, and proof. Individual values remain local.',
    caveat: 'This does not establish ownership of assets or completeness of liabilities. Independent audit is still required.',
    schema: '{\n  "assets": ["... eight values ..."],\n  "liabilities": ["... eight values ..."],\n  "assetCount": "...",\n  "liabilityCount": "...",\n  "assetRoot": "...",\n  "liabilityRoot": "..."\n}',
  },
};

const FILES = ['circuit.wasm', 'proving_key.zkey', 'verification_key.json'];

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function readJson(file) {
  return JSON.parse(await file.text());
}

export function App() {
  const inputRevision = useRef(0);
  const [moduleId, setModuleId] = useState('kyc');
  const [files, setFiles] = useState({});
  const [input, setInput] = useState(null);
  const [proof, setProof] = useState(null);
  const [publicSignals, setPublicSignals] = useState(null);
  const [status, setStatus] = useState('No private input loaded.');
  const [busy, setBusy] = useState(false);
  const module = MODULES[moduleId];
  const ready = FILES.every((name) => files[name]);

  function switchModule(id) {
    if (busy || id === moduleId) return;
    inputRevision.current += 1;
    setModuleId(id);
    setFiles({});
    setInput(null);
    setProof(null);
    setPublicSignals(null);
    setStatus('No private input loaded.');
  }

  function setArtifact(name, file) {
    if (busy) return;
    setStatus('Artifacts changed. Generate a new proof to verify this selection.');
    setFiles((current) => ({ ...current, [name]: file || undefined }));
    setProof(null);
    setPublicSignals(null);
  }

  async function loadInput(file) {
    if (!file || busy) return;
    const revision = ++inputRevision.current;
    setInput(null);
    setProof(null);
    setPublicSignals(null);
    try {
      const parsed = await readJson(file);
      if (revision !== inputRevision.current) return;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object.');
      setInput(parsed);
      setProof(null);
      setPublicSignals(null);
      setStatus(`Loaded ${file.name} locally. No input has been transmitted.`);
    } catch (error) {
      if (revision !== inputRevision.current) return;
      setInput(null);
      setStatus(`Input error: ${error.message}`);
    }
  }

  async function generate() {
    if (!ready || !input) return;
    setBusy(true);
    setProof(null);
    setPublicSignals(null);
    setStatus('Generating witness and proof in this browser…');
    const urls = {};
    try {
      urls.wasm = URL.createObjectURL(files['circuit.wasm']);
      urls.zkey = URL.createObjectURL(files['proving_key.zkey']);
      const result = await snarkjs.groth16.fullProve(input, urls.wasm, urls.zkey);
      const verificationKey = await readJson(files['verification_key.json']);
      const valid = await snarkjs.groth16.verify(verificationKey, result.publicSignals, result.proof);
      if (!valid) throw new Error('Local proof verification failed.');
      setProof(result.proof);
      setPublicSignals(result.publicSignals);
      setStatus('Circuit relation verified locally with the uploaded key. Issuer/list trust, freshness and regulatory acceptance have NOT been checked.');
    } catch (error) {
      setProof(null);
      setPublicSignals(null);
      setStatus(`Proof failed: ${error.message}`);
    } finally {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">ZK</span><span>zk-Verify</span></div><span className="badge">Research prototype · local processing</span></header>
      <main>
        <section className="hero">
          <p className="eyebrow">COMPLIANCE PROOF WORKBENCH</p>
          <h1>Verify the claim.<br /><em>Keep the evidence private.</em></h1>
          <p className="hero-copy">A three-module research prototype for privacy-preserving KYC, exact-match screening, and solvency checks. Your private JSON stays in the browser during proof generation.</p>
        </section>
        <div className="layout">
          <nav className="module-nav" aria-label="Modules">
            <p className="section-label">MODULES</p>
            {Object.entries(MODULES).map(([id, item], index) => <button key={id} className={`module-link ${moduleId === id ? 'active' : ''}`} disabled={busy} onClick={() => switchModule(id)}><span className="module-number">0{index + 1}</span><span>{item.title}</span><span className="arrow">↗</span></button>)}
            <div className="nav-note"><strong>Current stage</strong><br />Code and circuit definitions are included. No proving artifacts or operational data are bundled.</div>
          </nav>
          <div className="workspace" key={moduleId}>
            <div className="workspace-header"><div><p className="eyebrow">MODULE / {moduleId.toUpperCase()}</p><h2>{module.title}</h2><p>{module.subtitle}</p></div><span className="status-pill">Prototype</span></div>
            <div className="info-grid"><div className="info-card"><span className="section-label">PROVEN STATEMENT</span><p>{module.statement}</p></div><div className="info-card"><span className="section-label">PUBLIC DISCLOSURE</span><p>{module.disclosure}</p></div></div>
            <div className="warning"><strong>Scope:</strong> {module.caveat}</div>
            <section className="panel"><div className="panel-heading"><div><span className="step">01</span><h3>Load proof artifacts</h3></div><span className="muted">Produced by the local circuit setup script</span></div><div className="upload-grid">{FILES.map((name) => <label className="upload" key={name}><span>{name}</span><small>{files[name]?.name || 'Choose file'}</small><input disabled={busy} type="file" accept={name.endsWith('.json') ? '.json' : name.endsWith('.wasm') ? '.wasm' : '.zkey'} onChange={(event) => setArtifact(name, event.target.files?.[0])} /></label>)}</div></section>
            <section className="panel"><div className="panel-heading"><div><span className="step">02</span><h3>Load private input</h3></div><span className="muted">JSON file · processed in your browser</span></div><div className="input-row"><label className="upload input-upload"><span>Witness input</span><small>{input ? 'JSON loaded' : 'Choose JSON file'}</small><input disabled={busy} type="file" accept=".json,application/json" onChange={(event) => loadInput(event.target.files?.[0])} /></label><details><summary>Expected fields</summary><pre>{module.schema}</pre></details></div><p className="subtle">The JSON must use the fixed array lengths defined in the circuit. See README for field bounds and root calculation.</p></section>
            <section className="panel result-panel"><div className="panel-heading"><div><span className="step">03</span><h3>Generate and verify</h3></div></div><button className="primary-button" disabled={!ready || !input || busy} onClick={generate}>{busy ? 'Working…' : 'Generate proof locally'}<span>→</span></button><p className="result-status" role="status">{status}</p>{proof && <div className="result-actions"><button onClick={() => downloadJson(`${moduleId}-proof.json`, proof)}>Download proof</button><button onClick={() => downloadJson(`${moduleId}-public.json`, publicSignals)}>Download public signals</button></div>}</section>
          </div>
        </div>
      </main>
      <footer>zk-Verify · Final year project prototype · No regulatory certification implied</footer>
    </div>
  );
}
