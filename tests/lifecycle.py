import os,subprocess,tempfile,pathlib,socket,json,urllib.request,http.cookiejar
root=pathlib.Path('little-savings').resolve()
with tempfile.TemporaryDirectory(prefix='little-savings-lifecycle-') as t:
 p=pathlib.Path(t);(p/'data').mkdir();(p/'var').mkdir()
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 env=dict(os.environ,TRIM_APPDEST=str(root/'app'),TRIM_PKGVAR=str(p/'var'),TRIM_DATA_SHARE_PATHS=str(p/'data'),TRIM_SERVICE_PORT=str(port),TRIM_TEMP_LOGFILE=str(p/'error'),wizard_password='disposable-lifecycle-password')
 def run(name,*args):return subprocess.run([str(root/'cmd'/name),*args],env=env,capture_output=True,text=True)
 def ok(r):assert r.returncode==0,(r.returncode,r.stdout,r.stderr,((p/'error').read_text() if (p/'error').exists() else '')+((p/'var'/'app.log').read_text() if (p/'var'/'app.log').exists() else ''))
 try:
  ok(run('install_callback'));ok(run('main','start'));ok(run('main','status'));ok(run('main','start'))
  assert (p/'data'/'ledger.json').exists()
  data=json.load(open(p/'data'/'ledger.json'));assert data['state']['goal']['target']==3298
  ok(run('main','stop'));assert run('main','status').returncode==3
  ok(run('main','start'));ok(run('main','status'));ok(run('config_init'))
  env['wizard_password']='disposable-changed-password';ok(run('config_callback'));ok(run('main','start'))
  old_auth=(p/'data'/'auth.json').read_bytes();env['wizard_password']='installer-dummy-password';ok(run('install_callback'));assert (p/'data'/'auth.json').read_bytes()==old_auth
  ok(run('upgrade_init'));assert (p/'data'/'ledger.json').exists()
  ok(run('main','start'));ok(run('uninstall_init'));ok(run('uninstall_callback'));assert (p/'data'/'ledger.json').exists()
  print('Lifecycle simulation passed: install, start/status, repeat start, stop/restart, password reset, upgrade stop, uninstall preserves data.')
 finally:run('main','stop')
