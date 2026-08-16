#!/usr/bin/env python3
"""Render the production Nginx template without maintaining a second config copy."""

from __future__ import annotations

import os
from pathlib import Path
import re
import sys
import tempfile


def required_arguments() -> tuple[Path, Path, str]:
    if len(sys.argv) != 4:
        raise SystemExit("usage: render-nginx-config.py <template> <output> <blue|green>")

    slot = sys.argv[3]
    if slot not in {"blue", "green"}:
        raise SystemExit(f"invalid slot: {slot}")

    return Path(sys.argv[1]), Path(sys.argv[2]), slot


def unique_server_names(*names: str) -> str:
    return " ".join(dict.fromkeys(name for name in names if name))


template_path, output_path, active_slot = required_arguments()
storefront_domain = os.environ.get("BRIC_STOREFRONT_DOMAIN", "www.example.com")
storefront_apex_domain = os.environ.get("BRIC_STOREFRONT_APEX_DOMAIN", "example.com")
values = {
    "BRIC_ACTIVE_SLOT": active_slot,
    "BRIC_API_DOMAIN": os.environ.get("BRIC_API_DOMAIN", "api.example.com"),
    "BRIC_API_CERT_NAME": os.environ.get("BRIC_API_CERT_NAME", "api.example.com"),
    "BRIC_ADMIN_DOMAIN": os.environ.get("BRIC_ADMIN_DOMAIN", "admin.example.com"),
    "BRIC_ADMIN_CERT_NAME": os.environ.get("BRIC_ADMIN_CERT_NAME", "admin.example.com"),
    "BRIC_STOREFRONT_SERVER_NAMES": unique_server_names(
        storefront_domain, storefront_apex_domain
    ),
    "BRIC_STOREFRONT_CERT_NAME": os.environ.get(
        "BRIC_STOREFRONT_CERT_NAME", "www.example.com"
    ),
}

rendered = template_path.read_text(encoding="utf-8")
for key, value in values.items():
    rendered = rendered.replace(f"${{{key}}}", value)

unresolved = sorted(set(re.findall(r"\$\{([A-Z0-9_]+)\}", rendered)))
if unresolved:
    raise SystemExit(f"unresolved Nginx template variables: {', '.join(unresolved)}")

output_path.parent.mkdir(parents=True, exist_ok=True)
with tempfile.NamedTemporaryFile(
    "w", encoding="utf-8", dir=output_path.parent, delete=False
) as temporary:
    temporary.write(rendered)
    temporary_path = Path(temporary.name)

temporary_path.replace(output_path)
