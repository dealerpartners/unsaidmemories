#!/usr/bin/env python3
"""Print column names/types for trust+support tables. Creds extracted at runtime, never printed."""
import base64, json, re, sys, urllib.request
from pathlib import Path

CREDS = Path.home() / "workspace/user/files/UNSAID_CREDS.md"
raw = CREDS.read_text().replace("\\_", "_")
m = re.search(r"#\s*Supabase(.*?)(?:\n\*\*#|\n#\s|\Z)", raw, re.S | re.I)
section = m.group(1) if m else raw

def find_value(pats):
    for line in section.splitlines():
        s = line.strip().strip("*").strip()
        mm = re.match(r"([^=:\s][^=:]{0,60}?)\s*[=:]\s*(\S.*)$", s)
        if mm:
            label, val = mm.group(1).strip().lower(), mm.group(2).strip()
            for p in pats:
                if p in label:
                    return val.split()[0]
    return None

service_key = find_value(["service_role", "service role"])
if not service_key:
    toks = re.findall(r"eyJ[\w\-.]+" , section)
    service_key = max(toks, key=len) if toks else None
if not service_key:
    print("FATAL: no service key"); sys.exit(1)
payload = service_key.split(".")[1]; payload += "=" * (-len(payload) % 4)
ref = json.loads(base64.urlsafe_b64decode(payload)).get("ref")
BASE = f"https://{ref}.supabase.co/rest/v1"
H = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}

r = urllib.request.Request(BASE + "/", headers=H)
spec = json.load(urllib.request.urlopen(r))
defs = spec.get("definitions", {})
TABLES = sys.argv[1:] or sorted(defs.keys())
for t in TABLES:
    d = defs.get(t)
    if not d:
        print(f"{t}: NOT EXPOSED"); continue
    cols = []
    for name, p in d.get("properties", {}).items():
        typ = p.get("format") or p.get("type") or "?"
        cols.append(f"{name}:{typ}")
    req = d.get("required", [])
    print(f"{t} (required: {','.join(req)})\n  " + "\n  ".join(cols))
