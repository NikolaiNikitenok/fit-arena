import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).with_name('queue_bridge.py'))
bridge = importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)


class QueueLeaseTests(unittest.TestCase):
    def test_expired_post_is_not_generated_and_cancelled_result_is_ignored(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder); job_id = 'c' * 24
            bridge.write(directory, job_id + '.queued.json', {'id': job_id, 'expiresAt': 1})
            self.assertIsNone(bridge.action(directory, 'claim', {})['job'])
            self.assertTrue((directory / (job_id + '.cancelled.json')).is_file())
            self.assertTrue(bridge.action(directory, 'complete', dict(id=job_id, lease='old', script={}))['ok'])
            self.assertFalse((directory / (job_id + '.ready.json')).exists())

    def test_expired_worker_cannot_complete_reclaimed_job(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            job_id = 'a' * 24
            bridge.write(directory, job_id + '.queued.json', {'id': job_id, 'inputs': {}})
            first = bridge.action(directory, 'claim', {})['job']
            expired = dict(first, startedAt=int(time.time() * 1000) - 16 * 60_000)
            bridge.write(directory, job_id + '.working.json', expired)
            second = bridge.action(directory, 'claim', {})['job']
            self.assertNotEqual(first['lease'], second['lease'])
            with self.assertRaises(ValueError):
                bridge.action(directory, 'complete', dict(id=job_id, lease=first['lease'], script={}))
            request = dict(id=job_id, lease=second['lease'], script={'caption': 'Геймплей'})
            self.assertTrue(bridge.action(directory, 'complete', request)['ok'])
            self.assertTrue(bridge.action(directory, 'complete', request)['ok'])
            self.assertFalse((directory / (job_id + '.working.json')).exists())
            self.assertEqual(json.loads((directory / (job_id + '.ready.json')).read_text(encoding='utf-8'))['script'], request['script'])

    def test_claim_once_and_reject_invalid_payload(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder); job_id = 'b' * 24
            bridge.write(directory, job_id + '.queued.json', {'id': job_id})
            first = bridge.action(directory, 'claim', {})['job']
            self.assertIsNone(bridge.action(directory, 'claim', {})['job'])
            with self.assertRaises(ValueError):
                bridge.action(directory, 'complete', dict(id=job_id, lease=first['lease'], script='bad'))
            self.assertTrue(bridge.action(directory, 'fail', dict(id=job_id, lease=first['lease'], error='limit'))['ok'])
            self.assertTrue((directory / (job_id + '.error.json')).is_file())


if __name__ == '__main__': unittest.main()
