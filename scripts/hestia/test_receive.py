import hashlib, json, tempfile, unittest
from pathlib import Path
from receive import apply, checked_release

def payload(text):
    digest=hashlib.sha256(text.encode()).hexdigest()
    rid=hashlib.sha256(('index.html\0'+digest+'\n').encode()).hexdigest()
    return {'operation':'publish','releaseId':rid,'files':[{'path':'index.html','content':text,'sha256':digest}]}

class ReceiverTests(unittest.TestCase):
    def test_publish_rollback_integrity_and_unknown_release(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp); releases=base/'.tzsvtav-releases'; releases.mkdir()
            old=releases/'bootstrap';old.mkdir()
            public=base/'web'/'test.example'/'public_html';public.parent.mkdir(parents=True);(releases/'current').symlink_to(old);public.symlink_to(releases/'current')
            a,b=payload('<h1>A</h1>'),payload('<h1>B</h1>')
            apply(base,'test.example',a)
            inspected=apply(base,'test.example',{'operation':'inspect'})
            self.assertEqual(inspected['releaseId'],a['releaseId'])
            with self.assertRaises(ValueError):apply(base,'test.example',{**b,'expectedPreviousReleaseId':'0'*64})
            self.assertEqual(public.resolve().name,a['releaseId'])
            apply(base,'test.example',{**b,'expectedPreviousReleaseId':a['releaseId']})
            apply(base,'test.example',{'operation':'rollback','releaseId':a['releaseId']})
            self.assertEqual((public/'index.html').read_text(),'<h1>A</h1>')
            with self.assertRaises(Exception):apply(base,'test.example',{'operation':'rollback','releaseId':'c'*64})
            (releases/b['releaseId']/'index.html').write_text('changed')
            with self.assertRaises(ValueError):apply(base,'test.example',b)
            self.assertEqual(public.resolve().name,a['releaseId'])
    def test_unsafe_paths_and_hashes(self):
        for path in ['../index.html','/index.html','a//index.html','.config.js','file.php','a/../index.html']:
            data=payload('x');data['files'][0]['path']=path
            with self.assertRaises(ValueError):checked_release(data)
        data=payload('x');data['files'][0]['content']='changed'
        with self.assertRaises(ValueError):checked_release(data)
    def test_symlink_release_not_activated(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp);r=base/'.tzsvtav-releases';r.mkdir();(r/'bootstrap').mkdir()
            p=base/'web'/'test.example'/'public_html';p.parent.mkdir(parents=True);(r/'current').symlink_to(r/'bootstrap');p.symlink_to(r/'current')
            data=payload('x');(r/data['releaseId']).symlink_to(base)
            with self.assertRaises(ValueError):apply(base,'test.example',data)

if __name__=='__main__':unittest.main()
