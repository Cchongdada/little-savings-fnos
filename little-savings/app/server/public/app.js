 'use strict';
const KEY='little-savings-watch-v1', FXKEY='little-savings-fx-v1', FXURL='/api/fx';
const $=s=>document.querySelector(s), nf=new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const money=n=>nf.format(n), mop=n=>'MOP '+money(n), cny=n=>'¥'+money(n), cents=n=>Math.round(n*100), sum=(a,f)=>a.reduce((s,r)=>s+cents(f(r)),0)/100;
const discount=r=>(cents(r.face)-cents(r.paid))/100;
const seed={version:2,goal:{name:'Apple Watch S12',target:3298,rate:null},records:[{id:'opening-voucher',date:'',face:120,paid:80,cny:null,rate:null,note:'两张满60减20消费券；购买日期、人民币扣款待补填。'}]};
let state,storageBroken=false,fx=null,fxStatus='正在获取网络参考汇率…',fxBusy=false,lastAttempt=0;
function validNum(n,positive=false){return typeof n==='number'&&Number.isFinite(n)&&n<1e10&&(positive?n>0:n>=0);}
function optionalRate(n){return n===null||validNum(n,true);}
function validate(s){
 if(!s||![1,2].includes(s.version)||!s.goal||typeof s.goal.name!=='string'||!s.goal.name.trim()||s.goal.name.length>80||!validNum(s.goal.target,true)||!optionalRate(s.goal.rate)||!Array.isArray(s.records)||s.records.length>10000)throw Error('备份格式不正确或金额无效。');
 const ids=new Set();
 const records=s.records.map(r=>{if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id))throw Error('记录编号重复或缺失。');ids.add(r.id);
 if(![r.face,r.paid].every(n=>validNum(n))||r.face<=0||r.paid>r.face||!(r.cny===null||validNum(r.cny))||!optionalRate(r.rate)||typeof r.note!=='string'||r.note.length>180||typeof r.date!=='string'||(r.date&&!/^\d{4}-\d{2}-\d{2}$/.test(r.date)))throw Error('记录金额、日期或备注格式不正确。');
 return {id:r.id,date:r.date,face:r.face,paid:r.paid,cny:r.cny,rate:r.rate,note:r.note};});
 return {version:2,goal:{name:s.goal.name,target:s.goal.target,rate:s.goal.rate},records};
}
state=validate(window.NAS.state);
async function commit(next){next=validate(next);state=validate(await window.NAS.save(next));render();}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function recordCny(r){return r.cny!==null?r.cny:r.rate!==null?Math.round(r.paid*r.rate*100)/100:null;}
function savingsCny(r){const rate=r.cny!==null&&r.paid>0?r.cny/r.paid:r.rate;return rate===null?null:Math.round(discount(r)*rate*100)/100;}
function partialCny(fn,label){const known=state.records.filter(r=>fn(r)!==null),missing=state.records.length-known.length;if(!state.records.length)return '¥0.00';if(!known.length)return '人民币待补填 · '+missing+' 笔';return (missing?'已知 ':'')+cny(sum(known,fn))+(missing?' · '+missing+' 笔待补':label);}
function currentRate(){return fx?.rate??state.goal.rate;}
function rateTime(t){return new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Macau',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}
function render(updateRecords=true){
 const rs=state.records,balance=sum(rs,r=>r.face),left=Math.max(0,(cents(state.goal.target)-cents(balance))/100),paid=sum(rs,r=>r.paid),saved=sum(rs,discount),pct=Math.min(100,balance/state.goal.target*100),rate=currentRate();
 $('#goalName').textContent=state.goal.name;$('#target').textContent=mop(state.goal.target);$('#targetCny').textContent=rate!==null?'约 '+cny(state.goal.target*rate)+' · 当前汇率参考':'人民币参考价待汇率';$('#balance').textContent=mop(balance);$('#balanceCny').textContent=rate!==null?'已攒面额约 '+cny(balance*rate)+' · 当前汇率参考':'已攒面额人民币参考价待汇率';$('#percent').textContent=pct.toFixed(1)+'%';$('#bar').style.width=pct+'%';$('#remaining').textContent=money(left);$('#remainingLabel').textContent=left?'距离心愿还差':'心愿已攒够，准备兑现';$('#remainingCny').textContent=rate!==null?'约 '+cny(left*rate)+' · 按当前参考汇率':'正在等待参考汇率';$('#goalFoot').textContent=balance>state.goal.target?'已超出目标 '+mop((cents(balance)-cents(state.goal.target))/100):'按已攒代金券面额计算进度 · 目标价格可修改';$('#paid').textContent=mop(paid);$('#saved').textContent=mop(saved);$('#paidCny').textContent='历史人民币成本：'+partialCny(recordCny,'');$('#paidRefCny').textContent=rate!==null?'按当前汇率约 '+cny(paid*rate):'当前汇率参考价待获取';$('#savedCny').textContent=partialCny(savingsCny,'（折算）');$('#fxText').textContent=rate!==null?'1 MOP ≈ '+rate+' CNY'+(!fx?' · 备用参考价':''):'暂无汇率，可填写备用参考价';$('#fxStatus').textContent=fxStatus+(fx?' · 数据时间 '+rateTime(fx.asOf)+'（澳门）':'');$('#count').textContent=rs.length+' 笔';
 if(updateRecords)$('#records').innerHTML=rs.length?[...rs].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(r=>{const rc=recordCny(r);return `<article class="record card"><div class="record-top"><div><h3>新八佰伴代金券</h3><small>${esc(r.date||'购买日期待补填')}</small></div><div class="record-face">+ ${mop(r.face)}</div></div><div class="record-info"><div><span>实付澳门元</span><b>${money(r.paid)}</b></div><div><span>人民币成本</span><b>${rc===null?'待补填':cny(rc)}</b></div><div><span>消费券优惠</span><b>${mop(discount(r))}</b></div></div><p class="record-reference">${rate!==null?'按当前汇率参考：面额约 '+cny(r.face*rate)+' · 实付约 '+cny(r.paid*rate):'人民币参考价待汇率'}</p>${r.note?'<p class="record-note">'+esc(r.note)+'</p>':''}<div class="record-bottom"><p>${r.cny!==null?'采用实际人民币扣款':r.rate!==null?'按本笔汇率 '+r.rate+' 折算':'补填扣款或购买时汇率后计入人民币合计'}</p><div class="record-actions"><button data-edit="${esc(r.id)}">编辑</button><button data-delete="${esc(r.id)}">删除</button></div></div></article>`;}).join(''):'<div class="empty">还没有记录，记下第一笔小进步吧。</div>';
}
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',3200);}
function localDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function parseFx(data){if(!validNum(data?.rate,true)||!Number.isFinite(data.asOf)||data.asOf<=0||data.asOf>Date.now()+86400000)throw Error('汇率数据无效');return {rate:data.rate,asOf:data.asOf,fetchedAt:data.fetchedAt};}
async function refreshFx(force=false){
 if(fxBusy||(!force&&Date.now()-lastAttempt<60000))return;fxBusy=true;lastAttempt=Date.now();fxStatus='正在获取网络参考汇率…';render(false);$('#refreshFxBtn').disabled=true;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),13000);
 try{const response=await fetch(FXURL+(force?'?refresh=1':''),{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('汇率服务暂不可用');const fxData=await response.json();fx=parseFx(fxData);fxStatus=fxData.stale?'联网更新失败 · 暂用飞牛保存的汇率':Date.now()-fx.asOf>48*3600000?'已获取网络汇率 · 数据较旧，仅供参考':'已获取网络参考汇率 · 来源每日更新';
 }catch(e){fxStatus=fx?'联网更新失败 · 暂用上次保存的汇率':state.goal.rate!==null?'联网更新失败 · 暂用备用参考汇率':'联网更新失败 · 请重试或填写备用汇率';}
 finally{clearTimeout(timer);fxBusy=false;$('#refreshFxBtn').disabled=false;render();}
}
function previewDiscount(){const f=$('#entryForm'),face=f.elements.namedItem('face').value,paid=f.elements.namedItem('paid').value;$('#autoSavings').textContent=face===''||paid===''?'待输入金额':Number(paid)>Number(face)?'请核对支付金额':mop(discount({face:Number(face),paid:Number(paid)}));}
for(const k of ['face','paid'])$('#entryForm').elements.namedItem(k).addEventListener('input',previewDiscount);
document.querySelectorAll('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
function openEntry(id){const f=$('#entryForm');f.reset();$('#entryExtras').open=false;$('#entryError').textContent='';const r=id?state.records.find(x=>x.id===id):{id:'',date:'',face:'',paid:'',cny:'',rate:'',note:''};for(const k of Object.keys(r)){if(f.elements.namedItem(k))f.elements.namedItem(k).value=r[k]??'';}
 $('#entryRateHint').textContent=id?(r.rate!==null?'保留购买时的本笔汇率，不随今日汇率更新。':'这笔历史记录尚无汇率，请按购买时汇率或实际扣款补填。'):'仅在知道购买时汇率时填写；当前参考汇率不会自动记为本笔历史成本。';$('#entryTitle').textContent=id?'编辑购券记录':'记一笔购券';previewDiscount();$('#entryDialog').showModal();}
$('#addBtn').onclick=()=>openEntry();
function openSettings(){$('#settingsError').textContent='';const f=$('#settingsForm');for(const k of ['name','target','rate'])f.elements.namedItem(k).value=state.goal[k]??'';$('#settingsDialog').showModal();}
$('#settingsBtn').onclick=openSettings;$('#fxBtn').onclick=openSettings;$('#refreshFxBtn').onclick=()=>refreshFx(true);
$('#accountBtn').onclick=()=>{$('#passwordForm').reset();$('#passwordError').textContent='';$('#logoutError').textContent='';$('#accountDialog').showModal();};
$('#passwordForm').onsubmit=async e=>{e.preventDefault();const f=e.target,currentPassword=f.elements.namedItem('currentPassword').value,newPassword=f.elements.namedItem('newPassword').value,confirmPassword=f.elements.namedItem('confirmPassword').value,button=$('#changePasswordBtn');$('#passwordError').textContent='';
 if(newPassword!==confirmPassword){$('#passwordError').textContent='两次输入的新密码不一致。';return;}
 if(newPassword.length<8||newPassword.length>128){$('#passwordError').textContent='新密码须为8至128个字符。';return;}
 button.disabled=true;try{await window.NAS.api('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});f.reset();window.location.reload();}catch(err){$('#passwordError').textContent=err.message;}finally{button.disabled=false;}};
$('#logoutBtn').onclick=async()=>{const button=$('#logoutBtn');button.disabled=true;$('#logoutError').textContent='';try{await window.NAS.api('/api/auth/logout',{method:'POST',body:'{}'});window.location.reload();}catch(err){$('#logoutError').textContent=err.message;button.disabled=false;}};
$('#entryForm').onsubmit=async e=>{e.preventDefault();try{const f=e.target,val=k=>f.elements.namedItem(k).value.trim(),amount=k=>val(k)===''?null:Number(val(k));
 const r={id:val('id')||(crypto.randomUUID?crypto.randomUUID():'r-'+Date.now()+'-'+Math.random().toString(36).slice(2)),date:val('date'),face:amount('face'),paid:amount('paid'),cny:amount('cny'),rate:amount('rate'),note:val('note')};
 if(r.face===null||r.paid===null)throw Error('请填写代金券面额与实际支付金额。');if(r.paid>r.face)throw Error('实际支付不能超过代金券面额，请核对。');const next=structuredClone(state),i=next.records.findIndex(x=>x.id===r.id);if(i>=0)next.records[i]=r;else next.records.push(r);await commit(next);$('#entryDialog').close();toast('已保存，消费券优惠已自动计算。');}catch(err){$('#entryError').textContent=err.message;}};
$('#settingsForm').onsubmit=async e=>{e.preventDefault();try{const f=e.target,next=structuredClone(state);next.goal={name:f.elements.namedItem('name').value.trim(),target:Number(f.elements.namedItem('target').value),rate:f.elements.namedItem('rate').value===''?null:Number(f.elements.namedItem('rate').value)};await commit(next);$('#settingsDialog').close();toast('目标与备用汇率已更新');}catch(err){$('#settingsError').textContent=err.message;}};
let pendingConfirm=null;function confirmAction(title,text,fn){$('#confirmTitle').textContent=title;$('#confirmText').textContent=text;pendingConfirm=fn;$('#confirmDialog').showModal();}$('#cancelConfirm').onclick=()=>{$('#confirmDialog').close();pendingConfirm=null;};$('#okConfirm').onclick=()=>{const fn=pendingConfirm;pendingConfirm=null;$('#confirmDialog').close();if(fn)fn();};
$('#records').onclick=e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(edit)openEntry(edit.dataset.edit);if(del)confirmAction('删除这笔记录？','删除后会重新计算进度与支出，并在飞牛保留删除前备份。',async()=>{try{const next=structuredClone(state);next.records=next.records.filter(r=>r.id!==del.dataset.delete);await commit(next);toast('记录已删除');}catch(err){toast(err.message);}});};
$('#backupBtn').onclick=()=>{$('#backupError').textContent='';$('#backupDialog').showModal();};
$('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='小小攒-账本备份-'+localDate()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);toast('备份已生成，请保留下载的文件');};
$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5e6)throw Error('备份文件过大，请选择本账本导出的 JSON 文件。');const imported=validate(JSON.parse(await file.text()));confirmAction('恢复备份？','将以备份中的 '+imported.records.length+' 笔记录覆盖当前 '+state.records.length+' 笔记录。',async()=>{try{await commit(imported);$('#backupDialog').close();toast('账本已恢复');}catch(err){$('#backupError').textContent=err.message;}});}catch(err){$('#backupError').textContent='无法恢复：'+err.message;}finally{e.target.value='';}};


async function syncFromNas(){if(document.querySelector('dialog[open]')||document.visibilityState==='hidden')return;try{const fresh=await window.NAS.refresh();if(fresh){state=validate(fresh);render();}}catch(e){$('#nasStatus').textContent='暂时无法连接飞牛 · '+e.message;}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){syncFromNas();refreshFx();}});
window.addEventListener('pageshow',e=>{if(e.persisted){syncFromNas();refreshFx();}});
setInterval(syncFromNas,30000);
render();refreshFx();
