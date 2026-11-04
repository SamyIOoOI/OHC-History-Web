import json
import math
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


def main():
    token = os.environ.get('CF_API_TOKEN')
    zone = os.environ.get('CF_ZONE_ID')
    if not token or not zone:
        print('Diagnostic skipped: required credentials are not configured.')
        return 1
    try:
        snapshot = json.loads(Path('stats.json').read_text(encoding='utf-8'))
        end = datetime.strptime(snapshot['updated'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
        production = number(snapshot['visits'])
        start = end - timedelta(days=30)
        stamp = lambda dt: dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        print('Read-only dashboard-query comparison. Production stats.json is not changed.')
        print('UTC window:', stamp(start), 'to', stamp(end))
        print('Metric: sum(visits); requestSource: eyeball; start inclusive, end exclusive.')
        print('Existing production snapshot:', production)

        def request(body):
            req = urllib.request.Request('https://api.cloudflare.com/client/v4/graphql',
                data=json.dumps(body).encode(), headers={
                    'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=60) as response:
                payload = json.load(response)
            if payload.get('errors'):
                raise ValueError()
            return payload['data']['viewer']

        minimal = {'query': '''query ($zoneTag: string, $since: Time, $until: Time) {
          viewer { zones(filter: {zoneTag: $zoneTag}) {
            httpRequestsAdaptiveGroups(limit: 1, filter: {
              requestSource: "eyeball", datetime_geq: $since, datetime_lt: $until
            }) { sum { visits } }
          } }
        }''', 'variables': {'zoneTag': zone, 'since': stamp(start), 'until': stamp(end)}}
        groups = request(minimal)['zones'][0]['httpRequestsAdaptiveGroups']
        minimal_total = total(groups)
        print('Minimal production-shaped query visits:', minimal_total)
        body = json.loads(Path(__file__).with_name('dashboard-stats-query.json').read_text(encoding='utf-8'))
        for key, value in body['variables'].items():
            if key.endswith('zoneTag'):
                body['variables'][key] = zone
            elif isinstance(value, dict):
                value['datetime_geq'] = stamp(start)
                value['datetime_lt'] = stamp(end)
        result = request(body)['scope_0'][0]
        dashboard_total = total(result['c0_total'])
        sparkline_total = total(result['c0_sparkline'], single=False)
        samples = [number(row['avg']['sampleInterval']) for row in result['c0_total']]
        print('Captured dashboard-shaped total visits:', dashboard_total)
        print('Dashboard total avg sampleInterval:', samples)
        print('Dashboard sparkline visits sum:', sparkline_total)
        print('Dashboard sparkline rows:', len(result['c0_sparkline']))
        print('Dashboard total minus minimal query:', dashboard_total - minimal_total)
        print('Dashboard total minus sparkline sum:', dashboard_total - sparkline_total)
        print('Dashboard total minus production snapshot:', dashboard_total - production)
        print('Production formula/count unchanged. This tests query shape, not unsampled exactness.')
        print('Compare with the dashboard at the same interval; later traffic can change its display.')
        return 0
    except Exception:
        print('Diagnostic incomplete: API/network/schema check failed; no raw response or credentials logged.')
        print('Production stats.json remains unchanged by this diagnostic.')
        return 1


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError()
    return value


def total(groups, single=True):
    if not isinstance(groups, list) or (single and len(groups) > 1):
        raise ValueError()
    return sum(number(row['sum']['visits'] or 0) for row in groups)


if __name__ == '__main__':
    sys.exit(main())
