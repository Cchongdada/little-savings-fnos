import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';
const root=path.resolve('little-savings/app/server'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'little-savings-test-')),password='disposable-test-password';let child,url;
const env={...process.env,DATA_DIR:dir,PORT:'0',BIND_HOST:'127.0.0.1'};
let checks=0;function check(v){assert.ok(v);checks++;}
function start(){return new Promise((resolve,reject)=>{child=spawn(process.execPath,[path.join(root,'server.cjs')],{env,stdio:['ignore','pipe','pipe']});let out='';const timer=setTimeout(()=>reject(Error('startup timeout')),8000);child.stdout.on('data',b=>{out+=b;const m=out.match(/端口 (\d+)/);if(m){url='http://127.0.0.1:'+m[1];clearTimeout(timer);resolve();}});child.stderr.on('data',b=>{out+=b});child.on('exit',c=>{if(!url){clearTimeout(timer);reject(Error(out));}});});}
async function stop(){await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM')});url=null;}
let cookie='';async function call(p,options={},auth=true){const r=await fetch(url+p,{...options,headers:{'Content-Type':'application/json',...(auth&&cookie?{Cookie:cookie}:{}),...options.headers}});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
try{
 const init=spawnSync(process.execPath,[path.join(root,'server.cjs'),'--init-password'],{env:{...env,wizard_password:password},encoding:'utf8'});check(init.status===0);check(!fs.readFileSync(path.join(dir,'auth.json'),'utf8').includes(password));
 await start();check((await call('/api/health',{},false)).data.version==='1.1.2');check((await call('/api/state',{},false)).status===401);check((await call('/api/auth/status')).data.authenticated===false);
 check((await call('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:password,newPassword:'another-password'})},false)).status===401);
 check((await call('/api/auth/login',{method:'POST',body:JSON.stringify({password:'wrong'})},false)).status===401);
 const login=await call('/api/auth/login',{method:'POST',body:JSON.stringify({password}),headers:{Origin:'https://remote.proxy.invalid'}},false);check(login.status===200);check(login.cookie.includes('HttpOnly')&&login.cookie.includes('SameSite=Lax'));cookie=login.cookie.split(';')[0];
 const initial=await call('/api/state');check(initial.data.state.records[0].face===120);check(initial.data.state.records[0].paid===80);check(initial.data.revision===0);
 const state=initial.data.state;state.records[0].cny=66.21;
 const saved=await call('/api/state',{method:'PUT',body:JSON.stringify({revision:0,state})});check(saved.status===200);check(saved.data.revision===1);check(saved.data.state.records[0].cny===66.21);
 check((await call('/api/state',{method:'PUT',body:JSON.stringify({revision:0,state})})).status===409);
 const bad=structuredClone(state);bad.records[0].paid=121;check((await call('/api/state',{method:'PUT',body:JSON.stringify({revision:1,state:bad})})).status===400);
 check((await call('/api/state',{method:'PUT',body:JSON.stringify({revision:1,state}),headers:{Origin:'https://remote.proxy.invalid'}})).status===200);
 check((await call('/api/state',{method:'PUT',body:JSON.stringify({revision:1,state})})).status===409);
 const preflight=await fetch(url+'/api/state',{method:'OPTIONS',headers:{Origin:'https://untrusted.invalid','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type'}});check(preflight.status===405&&!preflight.headers.has('access-control-allow-origin'));
 check((await call('/ledger.json')).status===404);check((await call('/auth.json')).status===404);check((await call('/../ledger.json')).status===404);
 check(JSON.parse(fs.readFileSync(path.join(dir,'ledger.json'))).state.records[0].cny===66.21);const backups=fs.readdirSync(path.join(dir,'backups'));check(backups.length===2);check(JSON.parse(fs.readFileSync(path.join(dir,'backups',backups[0]))).records[0].cny===null);
 await stop();fs.writeFileSync(path.join(dir,'exchange-rate.json'),JSON.stringify({rate:.827681,asOf:Date.now(),fetchedAt:Date.now()}));await start();
 check((await call('/api/state')).status===401);cookie=(await call('/api/auth/login',{method:'POST',body:JSON.stringify({password})},false)).cookie.split(';')[0];check((await call('/api/state')).data.state.records[0].cny===66.21);check((await call('/api/fx')).data.rate===.827681);
 const responses=await Promise.all([1,2].map(()=>call('/api/state',{method:'PUT',body:JSON.stringify({revision:2,state})})));check(responses.filter(r=>r.status===200).length===1);check(responses.filter(r=>r.status===409).length===1);
 const backupState=JSON.parse(fs.readFileSync(path.join(dir,'backups',backups[0]),'utf8'));const restored=await call('/api/state',{method:'PUT',body:JSON.stringify({revision:3,state:backupState})});check(restored.status===200);check(restored.data.state.records[0].cny===null);
 const migrated={...state,version:1,records:[{...state.records[0],used:50,coupon:0}]};check((await call('/api/state',{method:'PUT',body:JSON.stringify({revision:4,state:migrated})})).data.state.version===2);
 check((await call('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:'wrong',newPassword:'another-password'})})).status===401);
 check((await call('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:password,newPassword:'short'})})).status===400);
 const changedPassword='another-password';
 check((await call('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:password,newPassword:changedPassword})})).status===200);
 check((await call('/api/state')).status===401);check((await call('/api/auth/login',{method:'POST',body:JSON.stringify({password})},false)).status===401);
 check(!fs.readFileSync(path.join(dir,'auth.json'),'utf8').includes(changedPassword));
 cookie=(await call('/api/auth/login',{method:'POST',body:JSON.stringify({password:changedPassword})},false)).cookie.split(';')[0];
 check((await call('/api/state')).data.revision===5);
 check((await call('/api/auth/logout',{method:'POST',body:'{}'})).status===200);check((await call('/api/state')).status===401);
 await stop();console.log(checks+' backend checks passed: auth, disk persistence, restart, conflicts, validation, backups, migration, FX cache, logout.');
}finally{if(child&&child.exitCode===null)child.kill();fs.rmSync(dir,{recursive:true,force:true});}
