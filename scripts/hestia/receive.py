#!/usr/bin/env python3
"""Forced-command static release receiver. Runs as ONE unprivileged Hestia user."""
import base64, fcntl, hashlib, json, os, re, sys
from pathlib import Path

LIMIT = 8 * 1024 * 1024

def checked_release(data):
    files = data.get('files')
    if not isinstance(files, list) or not 1 <= len(files) <= 100:
        raise ValueError('Invalid files')
    seen, result = set(), []
    for row in files:
        path, content = row.get('path'), row.get('content')
        if not isinstance(path, str) or not (re.fullmatch(r'[A-Za-z0-9_/-]+\.(?:html|css|js|mjs|json|svg|txt)', path) or path == 'sitemap.xml' or re.fullmatch(r'assets/[a-f0-9]{64}\.(?:jpg|png|webp)', path)):
            raise ValueError('Invalid static path')
        if any(p in ('', '.', '..') or p.startswith('.') for p in path.split('/')) or path.startswith('/') or path.casefold() in seen:
            raise ValueError('Duplicate or unsafe path')
        seen.add(path.casefold())
        if not isinstance(content, str): raise ValueError('Text files required')
        if path.startswith('assets/'):
            if row.get('encoding') != 'base64': raise ValueError('Image encoding required')
            raw = base64.b64decode(content, validate=True)
            valid = (path.endswith('.jpg') and raw.startswith(b'\xff\xd8\xff') or path.endswith('.png') and raw.startswith(b'\x89PNG\r\n\x1a\n') or path.endswith('.webp') and raw.startswith(b'RIFF') and raw[8:12] == b'WEBP')
            if not valid or len(raw) > 400000 or hashlib.sha256(raw).hexdigest() != path.split('/')[1].split('.')[0]: raise ValueError('Invalid image')
        else:
            if row.get('encoding') is not None: raise ValueError('Text encoding must be UTF-8')
            raw = content.encode('utf-8')
        digest = hashlib.sha256(raw).hexdigest()
        if len(raw) > 512 * 1024 or row.get('sha256') != digest:
            raise ValueError('File hash mismatch')
        result.append((path, raw, digest))
    if 'index.html' not in seen: raise ValueError('index.html required')
    result.sort()
    manifest = ''.join(p + '\0' + d + '\n' for p, _, d in result)
    release = hashlib.sha256(manifest.encode()).hexdigest()
    if data.get('releaseId') != release: raise ValueError('Release hash mismatch')
    return release, result

def apply(base, domain, data):
    if not isinstance(data, dict): raise ValueError('Object required')
    releases = base / '.tzsvtav-releases'
    public = base / 'web' / domain / 'public_html'
    if releases.is_symlink() or not releases.is_dir() or not public.is_symlink():
        raise ValueError('Target not provisioned')
    current = releases / 'current'
    if not current.is_symlink() or public.readlink() != current: raise ValueError('Fixed webroot link required')
    if not public.resolve().is_relative_to(releases.resolve()): raise ValueError('Foreign current release')
    previous = public.resolve().name
    if data.get('operation') == 'inspect':
        receipt = json.loads((public.resolve() / '.receipt.json').read_text())
        if receipt.get('releaseId') != previous: raise ValueError('Current receipt mismatch')
        return {'status': 'inspected', 'domain': domain, 'releaseId': previous, 'files': receipt['files']}
    expected = data.get('expectedPreviousReleaseId')
    if expected is not None and (not isinstance(expected, str) or not re.fullmatch('[a-f0-9]{64}', expected) or expected != previous):
        raise ValueError('Current release changed; prepare a new plan')
    rid = data.get('releaseId', '')
    if not isinstance(rid, str) or not re.fullmatch('[a-f0-9]{64}', rid): raise ValueError('Invalid release')
    target = releases / rid
    if target.is_symlink(): raise ValueError('Unsafe release')
    previous = public.resolve().name
    if data.get('operation') == 'publish':
        _, files = checked_release(data)
        if not target.exists():
            target.mkdir(mode=0o755)
            try:
                for path, raw, _ in files:
                    dest = target / path
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with dest.open('xb') as f: f.write(raw)
                    dest.chmod(0o644)
                (target / '.receipt.json').write_text(json.dumps({'releaseId': rid, 'files': [{'path': p, 'sha256': d} for p, _, d in files]}))
            except Exception:
                # Partial directory deliberately retained, never activated or overwritten.
                raise
    elif data.get('operation') != 'rollback':
        raise ValueError('Unknown operation')
    receipt_path = target / '.receipt.json'
    if receipt_path.is_symlink(): raise ValueError('Unsafe receipt')
    receipt = json.loads(receipt_path.read_text())
    if receipt.get('releaseId') != rid: raise ValueError('Receipt mismatch')
    for row in receipt['files']:
        dest = target / row['path']
        if dest.is_symlink() or not dest.resolve().is_relative_to(target.resolve()) or hashlib.sha256(dest.read_bytes()).hexdigest() != row['sha256']:
            raise ValueError('Stored content mismatch')
    link = releases / '.tzsvtav-next'
    if link.exists() or link.is_symlink(): raise ValueError('Pending switch needs inspection')
    link.symlink_to(target)
    os.replace(link, current)
    return {'status': 'activated', 'domain': domain, 'releaseId': rid, 'previousReleaseId': previous, 'files': receipt['files']}

def main():
    base, domain = Path(sys.argv[1]), sys.argv[2]
    raw = sys.stdin.buffer.read(LIMIT + 1)
    if len(raw) > LIMIT: raise ValueError('Request too large')
    with (base / '.tzsvtav-release.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        print(json.dumps(apply(base, domain, json.loads(raw))))

if __name__ == '__main__':
    try: main()
    except Exception:
        print(json.dumps({'error': 'Release not activated; inspect target before retrying.'}))
        sys.exit(1)
