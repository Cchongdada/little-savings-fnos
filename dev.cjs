const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
process.env.DATA_DIR=path.join(os.tmpdir(),'little-savings-browser-qa');process.env.PORT='4173';
fs.mkdirSync(process.env.DATA_DIR,{recursive:true});
if(!fs.existsSync(path.join(process.env.DATA_DIR,'auth.json'))){const r=spawnSync(process.execPath,[path.resolve('little-savings/app/server/server.cjs'),'--init-password'],{env:{...process.env,wizard_password:'disposable-preview-password'},stdio:'inherit'});if(r.status)process.exit(r.status);}
require('./little-savings/app/server/server.cjs');
