import hashlib, json, tempfile, unittest
from pathlib import Path
from receive import apply, checked_release

def payload(text):
    digest=hashlib.sha256(text.encode()).hexdigest()
    rid=hashlib.sha256(('index.html\0'+digest+'\n').encode()).hexdigest()
    return {'operation':'publish','releaseId':rid,'files':[{'path':'index.html','content':text,'sha256':digest}]}

class ReceiverTests(unittest.TestCase):
    def provision(self, base, domain):
        releases=base/'.tzsvtav-releases';releases.mkdir(parents=True)
        old=releases/'bootstrap';old.mkdir()
        public=base/'web'/domain/'public_html';public.parent.mkdir(parents=True)
        (releases/'current').symlink_to(old);public.symlink_to(releases/'current')
        return releases, public

    def test_two_tenants_keep_independent_releases_and_rollback(self):
        with tempfile.TemporaryDirectory() as tmp:
            a,b=Path(tmp)/'a',Path(tmp)/'b'
            ra,pa=self.provision(a,'a.example');rb,pb=self.provision(b,'b.example')
            first,second,foreign=payload('A first'),payload('A second'),payload('B private')
            apply(a,'a.example',first);apply(b,'b.example',foreign)
            snapshot={str(p.relative_to(rb)):p.read_bytes() for p in rb.rglob('*') if p.is_file() and not p.is_symlink()}
            apply(a,'a.example',{**second,'expectedPreviousReleaseId':first['releaseId']})
            with self.assertRaises(Exception):
                apply(a,'a.example',{'operation':'rollback','releaseId':foreign['releaseId']})
            self.assertEqual(pa.resolve().name,second['releaseId'])
            apply(a,'a.example',{'operation':'rollback','releaseId':first['releaseId']})
            self.assertEqual((pa/'index.html').read_text(),'A first')
            self.assertEqual((pb/'index.html').read_text(),'B private')
            self.assertFalse((ra/foreign['releaseId']).exists())
            self.assertEqual(snapshot,{str(p.relative_to(rb)):p.read_bytes() for p in rb.rglob('*') if p.is_file() and not p.is_symlink()})

    def test_payload_cannot_override_server_bound_domain_or_base(self):
        with tempfile.TemporaryDirectory() as tmp:
            a,b=Path(tmp)/'a',Path(tmp)/'b'
            _,pa=self.provision(a,'a.example');_,pb=self.provision(b,'b.example')
            apply(b,'b.example',payload('B original'))
            result=apply(a,'a.example',{**payload('A only'),'domain':'b.example','base':str(b),'sshTarget':'root@elsewhere'})
            self.assertEqual(result['domain'],'a.example')
            self.assertEqual((pa/'index.html').read_text(),'A only')
            self.assertEqual((pb/'index.html').read_text(),'B original')

    def test_foreign_current_link_is_rejected_without_changing_other_tenant(self):
        with tempfile.TemporaryDirectory() as tmp:
            a,b=Path(tmp)/'a',Path(tmp)/'b'
            ra,pa=self.provision(a,'a.example');rb,pb=self.provision(b,'b.example')
            original=payload('B original');apply(b,'b.example',original)
            (ra/'current').unlink();(ra/'current').symlink_to(rb/original['releaseId'])
            for operation in [payload('A attempted'),{'operation':'inspect'},{'operation':'rollback','releaseId':original['releaseId']}]:
                with self.assertRaises(ValueError):apply(a,'a.example',operation)
            self.assertEqual((pb/'index.html').read_text(),'B original')
            self.assertFalse((ra/payload('A attempted')['releaseId']).exists())

    def test_foreign_release_directory_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            a,b=Path(tmp)/'a',Path(tmp)/'b'
            ra,_=self.provision(a,'a.example');rb,pb=self.provision(b,'b.example')
            apply(b,'b.example',payload('B original'))
            for p in [ra/'current',ra/'bootstrap']:p.unlink() if p.is_symlink() else p.rmdir()
            ra.rmdir();ra.symlink_to(rb)
            with self.assertRaises(ValueError):apply(a,'a.example',payload('A attempted'))
            self.assertEqual((pb/'index.html').read_text(),'B original')

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
