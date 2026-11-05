#!/usr/bin/env python3
"""Private SSH bridge for the local content worker; no public HTTP endpoint or credentials in jobs."""
import argparse
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import time


def write(directory, name, value):
    path = directory / name
    tmp = directory / (name + '.' + secrets.token_hex(4) + '.tmp')
    with tmp.open('x', encoding='utf-8') as stream: json.dump(value, stream, ensure_ascii=False)
    os.chmod(tmp, 0o600)
    if hasattr(os, 'chown'):
        owner = directory.stat(); os.chown(tmp, owner.st_uid, owner.st_gid)
    os.replace(tmp, path)


def action(directory, command, request):
    directory = Path(directory)
    if not directory.is_dir(): return {'job': None, 'error': 'queue not configured'}
    now = int(time.time() * 1000)
    write(directory, 'worker.json', {'at': now, 'worker': str(request.get('worker', 'local'))[:60]})
    if command == 'heartbeat': return {'ok': True}
    if command == 'claim':
        for source in directory.glob('*.working.json'):
            try:
                job = json.loads(source.read_text(encoding='utf-8'))
                if now - job.get('startedAt', now) > 15 * 60_000:
                    os.replace(source, directory / (job['id'] + '.queued.json'))
            except FileNotFoundError: pass
        for source in sorted(directory.glob('*.queued.json'), key=lambda p: p.stat().st_mtime):
            if not re.fullmatch(r'[0-9a-f]{24}\.queued\.json', source.name): continue
            target = source.with_name(source.name.replace('.queued.', '.working.'))
            try: os.rename(source, target)
            except FileNotFoundError: continue
            job = json.loads(target.read_text(encoding='utf-8'))
            job.update(lease=secrets.token_hex(24), startedAt=now)
            write(directory, target.name, job)
            return {'job': job}
        return {'job': None}
    if command in {'complete', 'fail'}:
        job_id = str(request.get('id', ''))
        if not re.fullmatch(r'[0-9a-f]{24}', job_id): raise ValueError('Invalid job id')
        source = directory / (job_id + '.working.json')
        if not source.exists():
            if any((directory / (job_id + '.' + state + '.json')).exists() for state in ['ready', 'submitted', 'failed', 'dispatching']): return {'ok': True}
            raise ValueError('Job is no longer claimed')
        job = json.loads(source.read_text(encoding='utf-8'))
        if not hmac.compare_digest(str(job.get('lease', '')), str(request.get('lease', ''))): raise ValueError('Worker lease changed')
        job.pop('lease', None)
        if command == 'complete':
            script = request.get('script')
            if not isinstance(script, dict) or len(json.dumps(script).encode()) > 35_000: raise ValueError('Invalid or oversized draft')
            job['script'] = script; state = 'ready'
        else:
            job['error'] = str(request.get('error', 'generation failed'))[:500]; state = 'error'
        write(directory, job_id + '.' + state + '.json', job)
        source.unlink(missing_ok=True)
        return {'ok': True}
    raise ValueError('Unsupported bridge operation')


if __name__ == '__main__':
    import sys
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['claim', 'complete', 'fail', 'heartbeat'])
    parser.add_argument('--dir', default='/opt/arena-server/data/content-jobs')
    args = parser.parse_args()
    raw = sys.stdin.buffer.read(60_001)
    if len(raw) > 60_000: raise ValueError('Request too large')
    request = json.loads(raw or b'{}')
    print(json.dumps(action(args.dir, args.command, request), ensure_ascii=False))
