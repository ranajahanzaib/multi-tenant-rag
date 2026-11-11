"""Run deterministic answer and refusal checks against the seeded local API."""

import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_DNS, uuid5

from dotenv import load_dotenv

load_dotenv()
BASE_URL = os.getenv("MULTI_TENANT_RAG_API_URL", "http://localhost:8000").rstrip("/")
EMAIL = os.getenv("DEMO_EMAIL", "admin@northstar.example")
PASSWORD = os.getenv("DEMO_PASSWORD", "")
DATASET = Path("fixtures/evaluations/smoke.json")
REPORT = Path("reports/evaluations/latest.json")


def send(
    opener: urllib.request.OpenerDirector,
    route: str,
    *,
    data: Any = None,
    headers: dict[str, str] | None = None,
    method: str | None = None,
) -> Any:
    body = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(
        BASE_URL + route,
        data=body,
        headers=headers or {},
        method=method or ("POST" if body is not None else "GET"),
    )
    with opener.open(request, timeout=30) as response:
        return json.load(response)


def main() -> int:
    if not PASSWORD:
        raise RuntimeError("Set DEMO_PASSWORD to the seeded local demo password")
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    try:
        send(
            opener,
            "/api/auth/login",
            data={"email": EMAIL, "password": PASSWORD},
            headers={"Content-Type": "application/json"},
        )
        identity = send(opener, "/api/auth/me")
        organizations = identity.get("organizations", [])
        if not organizations:
            raise RuntimeError("The demo user has no active organization membership")
        tenant_id = organizations[0]["id"]
        cases = json.loads(DATASET.read_text(encoding="utf-8"))
        results = []
        for case in cases:
            if "request" in case:
                selected_tenant = uuid5(NAMESPACE_DNS, "tenantground.example:summit")
                response: dict[str, Any] = {}
                try:
                    response = send(
                        opener,
                        case["request"],
                        data=case.get("data"),
                        method=case.get("method"),
                        headers={"X-Tenant-ID": str(selected_tenant)},
                    )
                    actual_status = 200
                except urllib.error.HTTPError as exc:
                    actual_status = exc.code
                passed = actual_status == case["expected_http_status"]
                expected_status = case.get("expected_status")
                if expected_status:
                    status_check = response.get("status") == expected_status
                    passed = passed and status_check
                else:
                    status_check = True
                results.append(
                    {
                        "id": case["id"],
                        "passed": passed,
                        "checks": {
                            "http_status": actual_status == case["expected_http_status"],
                            "scenario_status": status_check,
                        },
                        "observed_http_status": actual_status,
                    }
                )
                continue
            answer = send(
                opener,
                "/api/assistant/ask",
                data={"question": case["question"]},
                headers={"Content-Type": "application/json", "X-Tenant-ID": tenant_id},
            )
            checks = {
                "status": answer.get("status") == case["expected_status"],
            }
            phrase = case.get("expected_phrase")
            if phrase:
                checks["expected_phrase"] = phrase.casefold() in answer.get("answer", "").casefold()
            citation_type = case.get("expected_citation_type")
            if citation_type:
                checks["citation"] = any(
                    item.get("type") == citation_type for item in answer.get("citations", [])
                )
            results.append(
                {
                    "id": case["id"],
                    "passed": all(checks.values()),
                    "checks": checks,
                    "citation_count": len(answer.get("citations", [])),
                }
            )
        passed = sum(bool(item["passed"]) for item in results)
        report = {
            "generated_at": datetime.now(UTC).isoformat(),
            "dataset": str(DATASET),
            "api_url": BASE_URL,
            "passed": passed,
            "total": len(results),
            "pass_rate": passed / len(results) if results else 0,
            "cases": results,
        }
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 0 if passed == len(results) else 1
    except (
        urllib.error.URLError,
        urllib.error.HTTPError,
        OSError,
        ValueError,
        KeyError,
        RuntimeError,
    ) as exc:
        print(f"Evaluation could not complete: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
