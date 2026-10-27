import hashlib
import io
import json
import pathlib
import re
import sys
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
package = pathlib.Path(sys.argv[1])
expected_version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']

with tarfile.open(package, 'r:gz') as outer:
    members = {m.name: m for m in outer.getmembers()}
    required = {
        'app.tgz', 'manifest', 'ICON.PNG', 'ICON_256.PNG',
        'config/resource', 'config/privilege', 'wizard/install', 'wizard/config',
        'cmd/main', 'cmd/install_callback', 'cmd/config_callback',
    }
    assert required <= members.keys(), required - members.keys()
    assert 'wizard/uninstall' not in members and 'wizard/upgrade' not in members
    assert all(not n.startswith('/') and '..' not in pathlib.PurePosixPath(n).parts for n in members)
    assert all(m.isfile() or m.isdir() for m in members.values())
    manifest = outer.extractfile('manifest').read().decode('utf-8')
    fields = dict(re.findall(r'^([a-z_]+)\s*=\s*(.*?)\s*$', manifest, re.M))
    assert fields['appname'] == 'little-savings'
    assert fields['version'] == expected_version
    assert fields['platform'] == 'x86'
    assert fields['service_port'] == '18760'
    assert fields['install_dep_apps'] == 'nodejs_v22'
    app_bytes = outer.extractfile('app.tgz').read()
    assert fields['checksum'] == hashlib.md5(app_bytes).hexdigest()
    for name in ('config/resource', 'config/privilege', 'wizard/install', 'wizard/config'):
        json.loads(outer.extractfile(name).read().decode('utf-8'))
    assert members['cmd/main'].mode & 0o111
    with tarfile.open(fileobj=io.BytesIO(app_bytes), mode='r:gz') as inner:
        app_members = {m.name: m for m in inner.getmembers()}
        assert {'server/server.cjs', 'server/public/index.html', 'server/public/app.js',
                'server/public/nas.js', 'ui/config'} <= app_members.keys()
        assert all(not n.startswith('/') and '..' not in pathlib.PurePosixPath(n).parts for n in app_members)
        assert all(m.isfile() or m.isdir() for m in app_members.values())
        assert expected_version in inner.extractfile('server/server.cjs').read().decode('utf-8')
        json.loads(inner.extractfile('ui/config').read().decode('utf-8'))
        for name in ('server/server.cjs', 'server/public/index.html',
                     'server/public/app.js', 'server/public/nas.js', 'ui/config'):
            assert inner.extractfile(name).read() == (root / 'little-savings' / 'app' / name).read_bytes(), name

print(f'FPK structure passed: {package.name}, version {expected_version}, MD5 payload checksum, JSON and required paths.')
