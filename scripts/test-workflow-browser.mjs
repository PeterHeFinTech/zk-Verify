import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createService} from '../server/service.mjs';
const config=JSON.parse(readFileSync('build/workflow/config.json'));
const tokens=JSON.parse(readFileSync('build/workflow/credentials.json'));
const fixture=JSON.parse(readFileSync('build/workflow/issuer-snapshot.json'));
const secret=JSON.parse(readFileSync('build/workflow/holder.private.json')).secret;
config.allowedOrigins.push('http://127.0.0.1:5181');
const app=createService({config,database:`build/workflow/browser-${randomUUID()}.sqlite`});
await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(8787,'127.0.0.1',resolve);});
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5181','--strictPort'],{stdio:'pipe'});
let browser;
async function api(path,who,body){const r=await fetch('http://127.0.0.1:8787/api/v1/'+path,{method:'POST',headers:{Authorization:'Bearer '+tokens[who],'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok);return r.json();}
try{
 await api('issuers','issuer',{issuer:fixture.issuer});
 const proposal=await api('root-proposals','issuer',{issuer:fixture.issuer,root:fixture.root,epoch:1,validUntil:Date.now()+86400000});
 await api(`root-proposals/${proposal.id}/approve`,'approver',{});
 for(let i=0;i<80;i++){if(vite.exitCode!==null)throw new Error('Vite failed');try{if((await fetch('http://127.0.0.1:5181')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage();const requests=[],errors=[];
 page.on('request',r=>{requests.push({url:r.url(),body:r.postData()});});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5181');
 await page.getByRole('button',{name:'Open trusted KYC workflow'}).click();
 await page.getByLabel('Demo holder token').fill(tokens.holder);
 await page.getByLabel('Local session credential').setInputFiles('build/workflow/holder.private.json');
 await expect(page.getByRole('status')).toContainText('loaded locally');
 await page.getByRole('button',{name:'Create verification request'}).click();
 await expect(page.getByRole('status')).toContainText('Request issued');
 await page.getByRole('button',{name:'Prove locally and submit'}).click();
 await expect(page.getByRole('status')).toContainText('Verifier accepted',{timeout:120000});
 const submit=requests.find(r=>r.url.endsWith('/proof'));
 assert.ok(submit);assert.deepEqual(Object.keys(JSON.parse(submit.body)).sort(),['proof','publicSignals']);
 assert.ok(!JSON.stringify(requests).includes(secret));
 assert.equal(requests.filter(r=>/^https?:/.test(r.url)&&!r.url.startsWith('http://127.0.0.1:5181')).length,0);
 assert.deepEqual(errors,[]);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const report={browser:await browser.version(),accepted:true,proofOnlySubmission:true,credentialSecretAbsentFromObservedRequests:true,externalHttpRequests:0,pageErrors:errors,mobileOverflow:false,limitation:'Local synthetic fixture; request-body inspection is not a comprehensive privacy or browser security audit.'};
 writeFileSync('docs/review-results/workflow-browser-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();vite.kill();await app.close();}
process.exit(0);
