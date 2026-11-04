#!/usr/bin/env python3
"""Read-only diagnostic: replay the exact captured dashboard query at the exact
captured window (2026-10-05T19:55:17Z .. 2026-11-04T19:55:17Z) three times and
print the results to the workflow log.

Purpose: measure how much the public-API total for the identical query and
identical frozen window varies between executions right now. This is evidence
about run-to-run variability; it does not by itself prove or exclude any single
root cause.

Prints only the run log: zone name (if the token can read it), per-replay
totals and sampleInterval, and per-day rows. It never changes stats.json,
writes no files, and never prints the API token or zone ID.
Runs only on manual workflow_dispatch (see update-stats.yml).
"""
import json
import math
import os
import sys
import time
import urllib.request
from pathlib import Path

START = '2026-10-05T19:55:17Z'
END = '2026-11-04T19:55:17Z'
REPEATS = 3


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError()
    return value


def graphql(token, body):
    req = urllib.request.Request(
        'https://api.cloudflare.com/client/v4/graphql',
        data=json.dumps(body).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as response:
        payload = json.load(response)
    if payload.get('errors'):
        raise ValueError('graphql error')
    return payload['data']['viewer']


def main():
    token = os.environ.get('CF_API_TOKEN')
    zone = os.environ.get('CF_ZONE_ID')
    if not token or not zone:
        print('Diagnostic skipped: required credentials are not configured.')
        return 1

    print('Read-only exact-window replay. stats.json is not changed; no files are written.')
    print('Window under test (UTC):', START, 'to', END)

    try:
        viewer = graphql(token, {
            'query': 'query ($zoneTag: string) { viewer { zones(filter: {zoneTag: $zoneTag}) { name } } }',
            'variables': {'zoneTag': zone}})
        print('Zone name seen by this token:', viewer['zones'][0].get('name'))
    except Exception:
        print('Zone name: unavailable with this token (expected for an analytics-only token).')

    body = json.loads(Path(__file__).with_name('dashboard-stats-query.json').read_text(encoding='utf-8'))
    for key, value in body['variables'].items():
        if key.endswith('zoneTag'):
            body['variables'][key] = zone
        elif isinstance(value, dict):
            value['datetime_geq'] = START
            value['datetime_lt'] = END

    totals = []
    try:
        for i in range(REPEATS):
            scope = graphql(token, body)['scope_0'][0]
            c0 = scope['c0_total']
            if not isinstance(c0, list) or len(c0) != 1:
                raise ValueError()
            visits = number(c0[0]['sum']['visits'] or 0)
            sample_interval = number(c0[0]['avg']['sampleInterval'])
            totals.append(visits)
            print('Replay %d of %d: visits=%s sampleInterval=%s' % (i + 1, REPEATS, visits, sample_interval))
            if i == 0:
                print('Per-day rows (date, visits) from replay 1:')
                for entry in scope['c0_sparkline']:
                    print('  %s %s' % (entry['dimensions']['ts'], number(entry['sum']['visits'] or 0)))
            if i + 1 < REPEATS:
                time.sleep(2)
    except Exception:
        print('Diagnostic incomplete after %d of %d replays: API/network/schema check failed; no raw response or credentials logged.' % len(totals))
        if not totals:
            return 1

    if len(totals) > 1:
        print('Spread across completed replays: %s (min %s, max %s)' % (max(totals) - min(totals), min(totals), max(totals)))
    print('End of diagnostic. Production stats.json was not read or modified.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
