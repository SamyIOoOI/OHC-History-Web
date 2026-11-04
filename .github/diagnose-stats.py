import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone


def main():
    token = os.environ.get('CF_API_TOKEN')
    zone = os.environ.get('CF_ZONE_ID')
    if not token or not zone:
        print('Diagnostic skipped: required credentials are not configured.')
        return 1
    try:
        with open('stats.json', encoding='utf-8') as fh:
            snapshot = json.load(fh)
        end = datetime.strptime(snapshot['updated'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
        production = snapshot['visits']
        if not isinstance(production, (int, float)) or isinstance(production, bool):
            raise ValueError()
    except Exception:
        print('Diagnostic skipped: no valid production snapshot timestamp/count.')
        return 1
    start = end - timedelta(days=30)
    stamp = lambda dt: dt.strftime('%Y-%m-%dT%H:%M:%SZ')
    print('Read-only visit diagnostic. Production stats.json is not changed.')
    print('Metric: sum(visits); requestSource: eyeball; bounds: start inclusive, end exclusive.')
    print('UTC window:', stamp(start), 'to', stamp(end))
    print('Existing production snapshot:', production)
    query = '''query ($zoneTag: string, $since: Time, $until: Time) {
      viewer { zones(filter: {zoneTag: $zoneTag}) {
        httpRequestsAdaptiveGroups(limit: 1, filter: {
          requestSource: "eyeball", datetime_geq: $since, datetime_lt: $until
        }) { sum { visits } avg { sampleInterval } }
      } }
    }'''

    def fetch(a, b):
        body = json.dumps({'query': query, 'variables': {
            'zoneTag': zone, 'since': stamp(a), 'until': stamp(b)
        }}).encode()
        req = urllib.request.Request('https://api.cloudflare.com/client/v4/graphql', data=body,
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=45) as response:
            payload = json.load(response)
        if payload.get('errors'):
            raise ValueError()
        groups = payload['data']['viewer']['zones'][0]['httpRequestsAdaptiveGroups']
        if not isinstance(groups, list) or len(groups) > 1:
            raise ValueError()
        total = 0
        intervals = []
        for group in groups:
            value = group['sum']['visits']
            if value is None:
                value = 0
            if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
                raise ValueError()
            total += value
            sample = group.get('avg', {}).get('sampleInterval')
            if isinstance(sample, (int, float)) and not isinstance(sample, bool):
                intervals.append(sample)
        return total, intervals

    try:
        aggregate, intervals = fetch(start, end)
        print('Repeat 30-day aggregate:', aggregate, '| avg sampleInterval:', intervals or 'not returned')
        daily_sum = 0
        for day in range(30):
            a = start + timedelta(days=day)
            b = a + timedelta(days=1)
            visits, samples = fetch(a, b)
            daily_sum += visits
            print('Slice', day + 1, stamp(a), stamp(b), '| visits:', visits,
                '| avg sampleInterval:', samples or 'not returned')
        print('Sum of all 30 non-overlapping 24-hour slices:', daily_sum)
        print('Daily sum minus repeat 30-day aggregate:', daily_sum - aggregate)
        print('Repeat aggregate minus production snapshot:', aggregate - production)
        print('No metric selection or production count has been changed.')
        print('Differences alone do not prove dashboard parity or its exact query.')
    except Exception:
        print('Diagnostic incomplete: an API/network/schema check failed. No raw response or credentials logged.')
        print('Production stats.json remains unchanged by this diagnostic.')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
