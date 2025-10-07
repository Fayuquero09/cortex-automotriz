#!/usr/bin/env python3
"""
Bootstrap a global superadmin user in Supabase and the local DB.

Usage:
    python tools/scripts/bootstrap_superadmin.py \
        --org-name "Cortex Master" \
        --email admin@example.com \
        --password "TempPass123!"
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict

import psycopg
import requests

FEATURE_LEVELS = {"none", "view", "edit"}

DEFAULT_FEATURE_FLAGS: Dict[str, str] = {
    "compare": "edit",
    "insights": "edit",
    "dashboard": "edit",
    "catalog_admin": "edit",
    "prompt_edit": "edit",
    "body_style_edit": "edit",
    "openai_keys": "edit",
}


class BootstrapError(RuntimeError):
    pass


def env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise BootstrapError(f"Missing required environment variable: {name}")
    return value


def create_organization(conn: psycopg.Connection, name: str, package: str) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into cortex.organizations (name, package)
            values (%s, %s)
            returning id
            """,
            (name, package),
        )
        org_id = cur.fetchone()[0]
    conn.commit()
    return str(org_id)


def create_supabase_user(
    supabase_url: str,
    service_key: str,
    email: str,
    password: str,
    app_metadata: Dict[str, Any],
    user_metadata: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    endpoint = supabase_url.rstrip("/") + "/auth/v1/admin/users"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    payload: Dict[str, Any] = {
        "email": email,
        "password": password,
        "email_confirm": True,
        "app_metadata": app_metadata,
    }
    if user_metadata:
        payload["user_metadata"] = user_metadata
    resp = requests.post(endpoint, headers=headers, json=payload, timeout=15)
    if resp.status_code >= 300:
        raise BootstrapError(
            f"Auth admin create failed ({resp.status_code}): {resp.text}"
        )
    return resp.json()


def insert_app_user(
    conn: psycopg.Connection,
    user_id: str,
    org_id: str,
    feature_flags: Dict[str, Any],
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into cortex.app_users (id, organization_id, role, feature_flags)
            values (%s::uuid, %s::uuid, 'superadmin_global', %s::jsonb)
            on conflict (id) do update
            set organization_id = excluded.organization_id,
                role = excluded.role,
                feature_flags = excluded.feature_flags,
                updated_at = now()
            """,
            (user_id, org_id, json.dumps(feature_flags)),
        )
    conn.commit()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bootstrap global superadmin")
    parser.add_argument("--org-name", required=True, help="Organization name")
    parser.add_argument(
        "--package",
        choices=["marca", "black_ops"],
        default="marca",
        help="Subscription package for organization",
    )
    parser.add_argument("--email", required=True, help="Superadmin email")
    parser.add_argument("--password", required=True, help="Temporary password")
    parser.add_argument(
        "--features",
        help="JSON object with feature flags to override defaults",
    )
    return parser.parse_args()


def merge_features(custom: str | None) -> Dict[str, Any]:
    features: Dict[str, Any] = dict(DEFAULT_FEATURE_FLAGS)
    if not custom:
        return features
    try:
        data = json.loads(custom)
        if not isinstance(data, dict):
            raise ValueError("Expected JSON object")
        for key, value in data.items():
            if isinstance(value, str) and value.lower() in FEATURE_LEVELS:
                features[key] = value.lower()
            else:
                features[key] = "edit" if bool(value) else "none"
    except Exception as exc:  # noqa: BLE001
        raise BootstrapError(f"Invalid --features JSON: {exc}") from exc
    return features


def main() -> int:
    try:
        args = parse_args()
        supabase_url = env("SUPABASE_URL")
        service_key = env("SUPABASE_SERVICE_KEY")
        db_url = env("SUPABASE_DB_URL")

        feature_flags = merge_features(args.features)
        feature_flags["black_ops"] = args.package == "black_ops"
        feature_flags["dealer_admin"] = False

        with psycopg.connect(db_url) as conn:
            org_id = create_organization(conn, args.org_name, args.package)
            app_metadata = {
                "role": "superadmin_global",
                "org_id": org_id,
                "package": args.package,
                "allowed_brands": [],
                "dealer_location_ids": [],
                "features": feature_flags,
            }
            user = create_supabase_user(
                supabase_url,
                service_key,
                args.email,
                args.password,
                app_metadata=app_metadata,
            )
            user_id = user.get("id")
            if not user_id:
                raise BootstrapError(
                    "Supabase user created but response missing 'id': " + json.dumps(user)
                )
            insert_app_user(conn, user_id, org_id, feature_flags)

        print("\n✅ Superadmin global creado correctamente")
        print(f"  Organización ID: {org_id}")
        print(f"  Usuario ID:      {user_id}")
        print(f"  Email:           {args.email}")
        print("\nPara obtener un JWT de prueba, ejecuta:")
        payload = json.dumps({"email": args.email, "password": args.password})
        curl_cmd = (
            "curl -s -X POST "
            f"'{supabase_url.rstrip('/')}/auth/v1/token?grant_type=password' "
            f"-H 'apikey: {service_key}' "
            "-H 'Content-Type: application/json' "
            f"-d '{payload}'"
        )
        print(curl_cmd)
        print("\nEl access_token devuelto incluirá los claims role/org/features en app_metadata.")
        return 0
    except BootstrapError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR inesperado: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
