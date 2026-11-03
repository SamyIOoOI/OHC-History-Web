#!/usr/bin/env python3
"""Fetch the zone's rolling 30-day visit total from the Cloudflare GraphQL
Analytics API and write it to stats.json at the repo root.

Runs in GitHub Actions (see .github/workflows/update-stats.yml). Needs two
repository secrets, both read-only:
  CF_API_TOKEN - a Cloudflare API token with Zone > Analytics > Read
  CF_ZONE_ID   - the zone ID for thehistoryweb.org (dashboard overview page)

The token is never printed and never written to the repository.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

token = os.environ.get("CF_API_TOKEN")
zone = os.environ.get("CF_ZONE_ID")
if not token or not zone:
    sys.exit("CF_API_TOKEN and CF_ZONE_ID must be set")

now = datetime.now(timezone.utc)
since = now - timedelta(days=30)

# Same dataset and filter the dashboard's Analytics > Traffic tab uses:
# zone-level edge analytics, end-user traffic only ("eyeball").
query = """
query ($zoneTag: string, $since: Time, $until: Time) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequestsAdaptiveGroups(
        limit: 1
        filter: { requestSource: "eyeball", datetime_geq: $since, datetime_lt: $until }
      ) {
        sum { visits }
      }
    }
  }
}
"""

body = json.dumps({
    "query": query,
    "variables": {
        "zoneTag": zone,
        "since": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "until": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    },
}).encode()

req = urllib.request.Request(
    "https://api.cloudflare.com/client/v4/graphql",
    data=body,
    headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
    },
)
with urllib.request.urlopen(req, timeout=60) as r:
    payload = json.load(r)

if payload.get("errors"):
    sys.exit("GraphQL errors: %s" % json.dumps(payload["errors"])[:500])

groups = payload["data"]["viewer"]["zones"][0]["httpRequestsAdaptiveGroups"]
visits = sum((g["sum"]["visits"] or 0) for g in groups)

out = {
    "visits": visits,
    "updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
}
with open("stats.json", "w") as fh:
    json.dump(out, fh, indent=2)
    fh.write("\n")

print("visits (rolling 30d):", visits)
