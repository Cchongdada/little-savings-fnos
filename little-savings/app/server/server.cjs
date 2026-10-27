'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DATA=process.env.DATA_DIR;
if(!DATA||!path.isAbsolute(DATA))throw Error('DATA_DIR 必须指向飞牛创建的应用共享文件夹。');
fs.mkdirSync(DATA,{recursive:true});const BACKUPS=path.join(DATA,'backups');fs.mkdirSync(BACKUPS,{recursive:true});
const FILE=path.join(DATA,'ledger.json'),AUTH=path.join(DATA,'auth.json'),FXFILE=path.join(DATA,'exchange-rate.json');
function atomic(file,data){const tmp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';let fd;try{fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(tmp,file);const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function passwordConfig(password){if(typeof password!=='string'||password.length<8||password.length>128)throw Error('访问密码须为8至128个字符。');const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:crypto.scryptSync(password,salt,64).toString('hex')};}
function passwordMatches(password,cfg){if(typeof password!=='string'||password.length>128)return false;const expected=Buffer.from(cfg.hash,'hex');return expected.length===64&&crypto.timingSafeEqual(crypto.scryptSync(password,cfg.salt,64),expected);}
if(process.argv.includes('--init-password')){if(!process.env.wizard_password)throw Error('未收到访问密码，请在安装或配置向导中填写。');atomic(AUTH,passwordConfig(process.env.wizard_password));process.exit(0);}
if(!fs.existsSync(AUTH))throw Error('请先在应用安装向导设置访问密码。');
function validNum(n,positive=false){return typeof n==='number'&&Number.isFinite(n)&&n<1e10&&(positive?n>0:n>=0);}
function validate(s){if(!s||![1,2].includes(s.version)||!s.goal||typeof s.goal.name!=='string'||!s.goal.name.trim()||s.goal.name.length>80||!validNum(s.goal.target,true)||!(s.goal.rate===null||validNum(s.goal.rate,true))||!Array.isArray(s.records)||s.records.length>10000)throw Error('账本格式或目标金额无效。');const ids=new Set();const records=s.records.map(r=>{if(!r||typeof r.id!=='string'||!r.id||r.id.length>200||ids.has(r.id))throw Error('记录编号无效或重复。');ids.add(r.id);if(!validNum(r.face,true)||!validNum(r.paid)||r.paid>r.face||!(r.cny===null||validNum(r.cny))||!(r.rate===null||validNum(r.rate,true))||typeof r.date!=='string'||(r.date&&!/^\d{4}-\d{2}-\d{2}$/.test(r.date))||typeof r.note!=='string'||r.note.length>180)throw Error('购券记录金额或格式无效。');return {id:r.id,date:r.date,face:r.face,paid:r.paid,cny:r.cny,rate:r.rate,note:r.note};});return {version:2,goal:{name:s.goal.name.trim(),target:s.goal.target,rate:s.goal.rate},records};}
const seed={version:2,goal:{name:'Apple Watch S12',target:3298,rate:null},records:[{id:'opening-voucher',date:'',face:120,paid:80,cny:null,rate:null,note:'两张满60减20消费券；购买日期、人民币扣款待补填。'}]};
let ledger;
if(fs.existsSync(FILE)){const disk=JSON.parse(fs.readFileSync(FILE,'utf8'));if(!Number.isSafeInteger(disk.revision)||disk.revision<0)throw Error('账本修订号无效，请从备份恢复。');ledger={revision:disk.revision,state:validate(disk.state)};}else{ledger={revision:0,state:seed};atomic(FILE,ledger);}
const sessions=new Map(),attempts=new Map();
function respond(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(data));}
function authed(req){const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('little_savings_session='));if(!cookie)return false;const token=cookie.slice(cookie.indexOf('=')+1),expiry=sessions.get(token);return !!expiry&&expiry>Date.now();}
async function body(req){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw Object.assign(Error('需要 JSON 数据。'),{status:415});let chunks=[],length=0;for await(const chunk of req){length+=chunk.length;if(length>5*1024*1024)throw Object.assign(Error('数据超过5MB。'),{status:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Object.assign(Error('JSON 格式不正确。'),{status:400});}}
function writeState(data){if(!Number.isSafeInteger(data.revision)||data.revision!==ledger.revision)throw Object.assign(Error('账本已在另一页面更新。请刷新后重新操作，本次未覆盖NAS数据。'),{status:409});const clean=validate(data.state),next={revision:ledger.revision+1,state:clean};const backup=path.join(BACKUPS,'ledger-'+String(ledger.revision).padStart(10,'0')+'-'+Date.now()+'.json');atomic(backup,ledger.state);atomic(FILE,next);ledger=next;try{const names=fs.readdirSync(BACKUPS).filter(n=>/^ledger-\d+-\d+\.json$/.test(n)).sort();for(const name of names.slice(0,Math.max(0,names.length-50)))fs.unlinkSync(path.join(BACKUPS,name));}catch(e){console.error('旧备份清理失败：',e.message);}return ledger;}
let fx=null,fxPending=null;try{const d=JSON.parse(fs.readFileSync(FXFILE,'utf8'));if(validNum(d.rate,true)&&Number.isFinite(d.asOf)&&d.asOf>0&&Number.isFinite(d.fetchedAt))fx=d;}catch{}
async function getFx(force=false){if(fx&&!force&&Date.now()-fx.fetchedAt<3600000)return {...fx,cached:true};if(fxPending)return fxPending;fxPending=(async()=>{try{const response=await fetch('https://open.er-api.com/v6/latest/MOP',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('汇率源暂不可用');const d=await response.json(),asOf=d.time_last_update_unix*1000;if(d.result!=='success'||d.base_code!=='MOP'||!validNum(d.rates?.CNY,true)||!Number.isFinite(asOf)||asOf<=0||asOf>Date.now()+86400000)throw Error('汇率数据无效');const next={rate:d.rates.CNY,asOf,fetchedAt:Date.now()};atomic(FXFILE,next);fx=next;return fx;}catch(e){if(fx)return {...fx,stale:true};throw Object.assign(Error('联网获取汇率失败，可填写备用汇率。'),{status:503});}finally{fxPending=null;}})();return fxPending;}
const publicDir=path.join(__dirname,'public'),assets={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/nas.js':'nas.js','/icon.png':'icon.png','/manifest.webmanifest':'manifest.webmanifest'};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost');
 if(!['GET','HEAD','POST','PUT'].includes(req.method))return respond(res,405,{error:'请求方式不支持。'});
 if(u.pathname==='/api/health')return respond(res,200,{ok:true,app:'little-savings',version:'1.1.2'});
 if(u.pathname==='/api/auth/status')return respond(res,200,{authenticated:authed(req)});
 if(u.pathname==='/api/auth/login'&&req.method==='POST'){
  const ip=req.socket.remoteAddress,now=Date.now(),a=attempts.get(ip)||{count:0,until:now+600000};if(a.until<now){a.count=0;a.until=now+600000;}if(a.count>=10)return respond(res,429,{error:'密码尝试过多，请十分钟后再试。'});
  const data=await body(req);a.count++;attempts.set(ip,a);const cfg=JSON.parse(fs.readFileSync(AUTH,'utf8'));if(!passwordMatches(data.password,cfg))return respond(res,401,{error:'访问密码不正确。'});
  attempts.delete(ip);const token=crypto.randomBytes(32).toString('hex');sessions.set(token,now+7*86400000);return respond(res,200,{ok:true},{'Set-Cookie':'little_savings_session='+token+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800'+(req.socket.encrypted?'; Secure':'')});
 }
 if(u.pathname.startsWith('/api/')){
  if(!authed(req))return respond(res,401,{error:'请先输入账本访问密码。'});
  if(u.pathname==='/api/state'&&req.method==='GET')return respond(res,200,{...ledger,savedAt:fs.statSync(FILE).mtime.toISOString()});
  if(u.pathname==='/api/auth/change-password'&&req.method==='POST'){
   const data=await body(req),key='change:'+req.socket.remoteAddress,now=Date.now(),a=attempts.get(key)||{count:0,until:now+600000};if(a.until<now){a.count=0;a.until=now+600000;}if(a.count>=10)return respond(res,429,{error:'密码尝试过多，请十分钟后再试。'});
   const cfg=JSON.parse(fs.readFileSync(AUTH,'utf8'));if(!passwordMatches(data.currentPassword,cfg)){a.count++;attempts.set(key,a);return respond(res,401,{error:'当前密码不正确。'});}
   if(data.newPassword===data.currentPassword)return respond(res,400,{error:'新密码不能与当前密码相同。'});
   atomic(AUTH,passwordConfig(data.newPassword));sessions.clear();attempts.delete(key);
   return respond(res,200,{ok:true},{'Set-Cookie':'little_savings_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});
  }
  if(u.pathname==='/api/state'&&req.method==='PUT'){const data=await body(req);return respond(res,200,{...writeState(data),savedAt:new Date().toISOString()});}
  if(u.pathname==='/api/fx'&&req.method==='GET')return respond(res,200,await getFx(u.searchParams.get('refresh')==='1'));
  if(u.pathname==='/api/info'&&req.method==='GET')return respond(res,200,{dataDir:DATA,port:server.address().port,backupCount:fs.readdirSync(BACKUPS).filter(n=>n.endsWith('.json')).length});
  if(u.pathname==='/api/auth/logout'&&req.method==='POST'){const c=String(req.headers.cookie||'').match(/little_savings_session=([^;]+)/);if(c)sessions.delete(c[1]);return respond(res,200,{ok:true},{'Set-Cookie':'little_savings_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});}
  return respond(res,404,{error:'接口不存在。'});
 }
 if(!['GET','HEAD'].includes(req.method))return respond(res,405,{error:'请求方式不支持。'});
 const asset=assets[u.pathname];if(!asset)return respond(res,404,{error:'页面不存在。'});const bytes=fs.readFileSync(path.join(publicDir,asset));res.writeHead(200,{'Content-Type':types[path.extname(asset)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(e){console.error(e.message);if(!res.headersSent)respond(res,e.status||400,{error:e.status?e.message:e.message.startsWith('E')?'保存失败，请检查应用共享文件夹权限和剩余空间。':e.message});else res.end();}});
server.requestTimeout=15000;server.headersTimeout=12000;
const port=Number(process.env.PORT||18760);server.listen(port,process.env.BIND_HOST||'0.0.0.0',()=>console.log('小小攒已启动，端口 '+server.address().port+'，数据目录 '+DATA));
const sweep=setInterval(()=>{const now=Date.now();for(const [k,t]of sessions)if(t<now)sessions.delete(k);for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);},60000);sweep.unref();
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();});
