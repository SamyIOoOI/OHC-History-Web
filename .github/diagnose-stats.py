#!/usr/bin/env python3
"""Read-only comparison of one 30-day request against 30 separate daily requests.
Uses the exact same metric, zone, eyeball filter and fixed half-open UTC window.
Never reads or writes stats.json; credentials and raw responses are not logged.
"""
import json
import math
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

# Matches the production snapshot observed on 5 November, not a moving window.
END = '2026-11-05T00:31:53Z'
START = '2026-10-06T00:31:53Z'
QUERY = '''query ($zoneTag: string, $since: Time, $until: Time) {
  viewer { zones(filter: {zoneTag: $zoneTag}) {
    httpRequestsAdaptiveGroups(limit: 1,
      filter: {requestSource: "eyeball", datetime_geq: $since, datetime_lt: $until}) {
      sum { visits }
      avg { sampleInterval }
    }
  } }
}'''


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError('invalid numeric result')
    return value


def fetch(token, zone, start, end):
    request = urllib.request.Request(
        'https://api.cloudflare.com/client/v4/graphql',
        data=json.dumps({'query': QUERY, 'variables': {
            'zoneTag': zone, 'since': start, 'until': end}}).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    if payload.get('errors'):
        raise ValueError('API returned errors')
    zones = payload['data']['viewer']['zones']
    if not isinstance(zones, list) or len(zones) != 1:
        raise ValueError('expected exactly one zone')
    groups = zones[0]['httpRequestsAdaptiveGroups']
    if not isinstance(groups, list) or len(groups) > 1:
        raise ValueError('unexpected aggregate result')
    if not groups:
        return 0, None
    visits = number(groups[0]['sum']['visits'])
    interval = number(groups[0]['avg']['sampleInterval'])
    if interval < 1:
        raise ValueError('invalid sample interval')
    return visits, interval


def windows():
    start = datetime.strptime(START, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
    end = datetime.strptime(END, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
    while start < end:
        stop = min(start + timedelta(days=1), end)
        yield start.strftime('%Y-%m-%dT%H:%M:%SZ'), stop.strftime('%Y-%m-%dT%H:%M:%SZ')
        start = stop


def main():
    token, zone = os.environ.get('CF_API_TOKEN'), os.environ.get('CF_ZONE_ID')
    if not token or not zone:
        print('Comparison skipped: required credentials are not configured.')
        return 1
    print('READ-ONLY comparison. No files are read or written. Existing production step is unchanged.')
    print('Fixed UTC window, inclusive start / exclusive end:', START, 'to', END)
    print('Metric: httpRequestsAdaptiveGroups sum(visits), requestSource=eyeball.')
    completed = 0
    try:
        before, before_interval = fetch(token, zone, START, END)
        print('Month BEFORE: visits=%s sampleInterval=%s' % (before, before_interval), flush=True)
        rows = []
        for index, (start, end) in enumerate(windows(), 1):
            time.sleep(0.35)
            visits, interval = fetch(token, zone, start, end)
            rows.append((visits, interval))
            completed = index
            print('Day %02d [%s, %s): visits=%s sampleInterval=%s' % (
                index, start, end, visits, interval), flush=True)
        time.sleep(0.35)
        after, after_interval = fetch(token, zone, START, END)
    except Exception:
        # Never print an exception/raw response: either could contain request details.
        print('Comparison INCOMPLETE after %d daily requests. API/network/schema check failed.' % completed)
        print('No production value changed by this diagnostic. Do not use a partial sum.')
        return 1
    total = sum(row[0] for row in rows)
    intervals = [row[1] for row in rows if row[1] is not None]
    print('Month AFTER: visits=%s sampleInterval=%s' % (after, after_interval))
    print('Independent daily requests: %d; SUM visits=%s' % (len(rows), total))
    print('Daily sum minus month BEFORE=%s; minus month AFTER=%s' % (total - before, total - after))
    if intervals:
        print('Daily sampleInterval min=%s max=%s; unsampled nonempty days=%d/%d' % (
            min(intervals), max(intervals), sum(v == 1 for v in intervals), len(intervals)))
    print('sampleInterval is metadata, NOT a multiplier to apply to visits.')
    print('This tests a sampling mitigation, not proof of exact dashboard equality.')
    print('Compare only with a dashboard response using this exact window, metric and filter.')
    print('No files were changed by this diagnostic.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
