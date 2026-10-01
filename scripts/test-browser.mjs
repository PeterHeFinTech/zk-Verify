import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { groth16 } from 'snarkjs';
import { createHash } from 'node:crypto';
import { verifyWithPolicy } from './verify-proof.mjs';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5179','--strictPort'], {stdio:'pipe'});
let serverLog = ''; server.stderr.on('data', d => serverLog += d);
let browser;
const results = [];
try {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try { if ((await fetch('http://127.0.0.1:5179')).ok) break; } catch {}
    await new Promise(r => setTimeout(r,250));
  }
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch(existsSync(chrome) ? {executablePath:chrome, headless:true} : {headless:true});
  const page = await browser.newPage();
  const external = [], errors = [];
  page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:5179')) external.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5179');
  for (const [name,title] of [['kyc','Private KYC'],['aml','Private screening'],['solvency','Private solvency']]) {
    await page.getByRole('button',{name:new RegExp(title)}).click();
    const uploads = page.locator('input[type=file]');
    assert.equal(await uploads.nth(0).evaluate(el => el.files.length),0);
    for (const [i,file] of ['circuit.wasm','proving_key.zkey','verification_key.json','input.private.json'].entries()) await uploads.nth(i).setInputFiles(`build/test-setup/${name}/${file}`);
    await expect(page.getByRole('status')).toContainText('Loaded');
    const start = performance.now();
    await page.getByRole('button',{name:/Generate proof locally/}).click();
    await expect(page.getByRole('status')).toContainText('Circuit relation verified locally', {timeout:120000});
    const elapsedMs = performance.now()-start;
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button',{name:'Download proof',exact:true}).click();
    const download = await downloadPromise;
    const proof = JSON.parse(readFileSync(await download.path(),'utf8'));
    const signalsPromise = page.waitForEvent('download');
    await page.getByRole('button',{name:'Download public signals',exact:true}).click();
    const signalsDownload = await signalsPromise;
    const signals = JSON.parse(readFileSync(await signalsDownload.path(),'utf8'));
    const vk = JSON.parse(readFileSync(`build/test-setup/${name}/verification_key.json`,'utf8'));
    assert.equal(await groth16.verify(vk,signals,proof),true);
    const fields = name === 'kyc' ? ['issuerRoot','currentDay'] : name === 'aml' ? ['customerCount','watchlistCount','customerRoot','watchlistRoot'] : ['assetCount','liabilityCount','assetRoot','liabilityRoot'];
    const keyBytes = readFileSync(`build/test-setup/${name}/verification_key.json`);
    const now = 20000 * 86400000; // Fixture verifier clock, not real-world freshness.
    const fixture = JSON.parse(readFileSync(`build/test-setup/${name}/input.private.json`,'utf8'));
    assert.deepEqual(signals,fields.map(field=>fixture[field]));
    const policy = {version:1, module:name, expiresAt:new Date(now+86400000).toISOString(), verificationKeySha256:createHash('sha256').update(keyBytes).digest('hex'), expected:Object.fromEntries(fields.map(field=>[field,fixture[field]]))};
    const verify = p => verifyWithPolicy({proof,publicSignals:signals,verificationKeyBytes:keyBytes,policy:p,now});
    assert.equal((await verify(policy)).accepted,true);
    await assert.rejects(()=>verify({...policy,expected:{...policy.expected,[fields[0]]:'0'}}),/Policy mismatch/);
    await assert.rejects(()=>verify({...policy,verificationKeySha256:'0'.repeat(64)}),/does not match/);
    await assert.rejects(()=>verify({...policy,expiresAt:new Date(now-1).toISOString()}),/expired/);
    if (name === 'kyc') await assert.rejects(()=>verifyWithPolicy({proof,publicSignals:signals,verificationKeyBytes:keyBytes,policy:{...policy,expiresAt:new Date(now+3*86400000).toISOString()},now:now+86400000}),/verifier UTC day/);
    const tampered = [...signals]; tampered[0] = (BigInt(tampered[0])+1n).toString();
    assert.equal(await groth16.verify(vk,tampered,proof),false);
    const invalid = JSON.parse(readFileSync(`build/test-setup/${name}/input.private.json`,'utf8'));
    invalid[name === 'kyc' ? 'issuerRoot' : name === 'aml' ? 'watchlistRoot' : 'assetRoot'] = '0';
    await uploads.nth(3).setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
    await expect(page.getByRole('button',{name:'Download proof',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:/Generate proof locally/}).click();
    await expect(page.getByRole('status')).toContainText('Proof failed:',{timeout:60000});
    await expect(page.getByRole('button',{name:'Download proof',exact:true})).toHaveCount(0);
    results.push({module:name, browserProveAndVerifyMs:Math.round(elapsedMs), proofJsonBytes:Buffer.byteLength(JSON.stringify(proof)), publicSignals:signals.length, independentVerify:true, verifierPolicyChecksPassed:true, tamperedSignalsRejected:true, invalidWitnessRejected:true});
  }
  await page.locator('input[type=file]').nth(3).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await expect(page.getByRole('status')).toContainText('Input error:');
  await expect(page.getByRole('button',{name:/Generate proof locally/})).toBeDisabled();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  mkdirSync('build/review',{recursive:true});
  await page.screenshot({path:'build/review/mobile.png',fullPage:true});
  assert.deepEqual(external,[]);
  assert.deepEqual(errors,[]);
  const report = {browser:await browser.version(), results, externalRequests:external, pageErrors:errors, malformedJsonRejected:true, mobileOverflow:false, note:'Single local run, synthetic inputs and development keys. Browser time includes witness + proving + verification + UI overhead.'};
  writeFileSync('build/review/browser-results.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { if (browser) await browser.close(); server.kill(); }
process.exit(0);
