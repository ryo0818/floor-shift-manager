"""Exercise deployment order/failure handling with a fake Docker CLI; no daemon needed."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "restart.sh"
DOCKER = r'''#!/usr/bin/env python3
import json, os, sys
args=sys.argv[1:]
with open(os.environ['DOCKER_LOG'], 'a') as f: f.write(json.dumps(args)+'\n')
text=' '.join(args)
fail=os.environ.get('FAIL_MATCH','')
if fail and fail in text: sys.exit(1)
if args[:1]==['inspect']:
 if 'Labels' in text: print('' if os.environ.get('LEGACY') and args[-1]=='frontend' else 'floor-shift-db')
 elif 'Health' in text: print('healthy')
 else: print('true')
elif args==['compose','up','--help']: print('--wait-timeout')
elif 'pg_dump' in text: sys.stdout.buffer.write(b'PGDMP-test-backup')
elif 'pg_restore' in text: sys.stdin.buffer.read()
'''

class RestartTests(unittest.TestCase):
    def run_script(self, fail='', legacy=False):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'backend').mkdir();(root/'bin').mkdir()
            shutil.copy2(SCRIPT,root/'restart.sh')
            for f in ['.env.production','backend/.env','compose.production.yaml']:
                (root/f).write_text('test')
            docker=root/'bin/docker';docker.write_text(DOCKER);docker.chmod(0o755)
            env={**os.environ,'PATH':str(root/'bin')+':'+os.environ['PATH'], 'DOCKER_LOG':str(root/'log'),'FAIL_MATCH':fail}
            if legacy: env['LEGACY']='1'
            result=subprocess.run(['bash',str(root/'restart.sh')],cwd='/tmp',env=env,capture_output=True,text=True)
            calls=[json.loads(line) for line in (root/'log').read_text().splitlines()]
            backups=list((root/'backups').glob('*.dump'))
            return result,[' '.join(a) for a in calls],[(f.read_bytes(),f.stat().st_mode&0o777) for f in backups]

    def test_success_order_and_database_untouched(self):
        r,c,b=self.run_script();self.assertEqual(r.returncode,0,r.stderr)
        tokens=['build backend frontend','stop frontend backend','pg_dump','pg_restore','app.manage migrate','up -d --no-deps --wait','wget','nginx -s reload']
        indexes=[next(i for i,cmd in enumerate(c) if t in cmd) for t in tokens]
        self.assertEqual(indexes,sorted(indexes));self.assertEqual(b,[(b'PGDMP-test-backup',0o600)])
        self.assertFalse(any(' down' in cmd or 'docker rm' in cmd or 'up -d --wait postgres' in cmd for cmd in c))

    def test_build_failure_does_not_stop_apps(self):
        r,c,_=self.run_script('build backend frontend');self.assertNotEqual(r.returncode,0)
        self.assertFalse(any('stop frontend' in cmd for cmd in c))

    def test_legacy_containers_are_rejected_before_build(self):
        r,c,_=self.run_script(legacy=True);self.assertNotEqual(r.returncode,0)
        self.assertIn('移行',r.stderr);self.assertFalse(any('build backend' in cmd for cmd in c))

    def test_dump_failure_prevents_migration(self):
        r,c,_=self.run_script('pg_dump');self.assertNotEqual(r.returncode,0)
        self.assertFalse(any('app.manage migrate' in cmd for cmd in c));self.assertIn('DBバックアップ',r.stderr)

    def test_backup_validation_failure_prevents_migration(self):
        r,c,_=self.run_script('pg_restore');self.assertNotEqual(r.returncode,0)
        self.assertFalse(any('app.manage migrate' in cmd for cmd in c))

    def test_migrate_failure_does_not_start_apps(self):
        r,c,_=self.run_script('app.manage migrate');self.assertNotEqual(r.returncode,0)
        self.assertFalse(any('up -d' in cmd for cmd in c));self.assertIn('DBスキーマ更新',r.stderr)

    def test_start_failure_does_not_reload_nginx(self):
        r,c,_=self.run_script('up -d');self.assertNotEqual(r.returncode,0)
        self.assertFalse(any('nginx -s reload' in cmd for cmd in c))

    def test_proxy_failure_does_not_report_success(self):
        r,c,_=self.run_script('wget');self.assertNotEqual(r.returncode,0)
        self.assertNotIn('更新完了',r.stdout);self.assertFalse(any('nginx -s reload' in cmd for cmd in c))

if __name__=='__main__': unittest.main()
