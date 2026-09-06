#!/usr/bin/env python3
"""Reject migration changes that would make the previous runtime unsafe."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path


MIGRATIONS_RELATIVE_PATH = Path("apps/admin/drizzle/migrations")
EXCEPTIONS_RELATIVE_PATH = Path("ops/migration-rollback-exceptions.json")
STATE_RELATIVE_PATH = Path(".bric-migrations.json")
RELEASE_MARKER_RELATIVE_PATH = Path(".bric-release.env")
LEGACY_BASELINE_COMMIT = "ab11790b49df28cdf99bde05052993962ad879f2"
LEGACY_BASELINE_COUNT = 88
LEGACY_BASELINE_PREFIX_SHA256 = (
    "ea6866db8343b826378a050bd1c04c99285f40f2feb0282b5d6ad47cdbfd4455"
)
DESTRUCTIVE_PATTERNS = {
    "drop a relation or type": re.compile(
        r"\bDROP\s+(?:TABLE|SCHEMA|TYPE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|PROCEDURE)\b",
        re.IGNORECASE,
    ),
    "truncate data": re.compile(r"\bTRUNCATE(?:\s+TABLE)?\b", re.IGNORECASE),
    "drop a column": re.compile(
        r"\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+COLUMN\b", re.IGNORECASE
    ),
    "rename a table or column": re.compile(
        r"\bALTER\s+TABLE\b[\s\S]*?\bRENAME\s+(?:COLUMN|TO)\b", re.IGNORECASE
    ),
    "change a column type": re.compile(
        r"\bALTER\s+TABLE\b[\s\S]*?\bALTER\s+COLUMN\b[\s\S]*?"
        r"\b(?:TYPE|SET\s+DATA\s+TYPE)\b",
        re.IGNORECASE,
    ),
    "rename an enum or enum value": re.compile(
        r"\bALTER\s+TYPE\b[\s\S]*?\bRENAME\b", re.IGNORECASE
    ),
    "replace a runtime database object": re.compile(
        r"\bCREATE\s+OR\s+REPLACE\s+(?:VIEW|FUNCTION|PROCEDURE)\b", re.IGNORECASE
    ),
    "add a table constraint": re.compile(
        r"\bALTER\s+TABLE\b[^;]*?\bADD\s+"
        r"(?:CONSTRAINT\s+(?:\"(?:[^\"]|\"\")*\"|[A-Za-z_][A-Za-z0-9_$]*)\s+)?"
        r"(?:CHECK\s*\(|UNIQUE\b|FOREIGN\s+KEY\b|PRIMARY\s+KEY\b|EXCLUDE\b)",
        re.IGNORECASE,
    ),
    "tighten column nullability": re.compile(
        r"\bALTER\s+TABLE\b[^;]*?\bALTER\s+(?:COLUMN\s+)?"
        r"(?:\"(?:[^\"]|\"\")*\"|[A-Za-z_][A-Za-z0-9_$]*)\s+SET\s+NOT\s+NULL\b",
        re.IGNORECASE,
    ),
    "add a required column": re.compile(
        r"\bALTER\s+TABLE\b[^;]*?\bADD\s+(?:COLUMN\s+)?"
        r"(?:\"(?:[^\"]|\"\")*\"|[A-Za-z_][A-Za-z0-9_$]*)\s+[^;]*?\bNOT\s+NULL\b",
        re.IGNORECASE,
    ),
    "create a unique index": re.compile(
        r"\bCREATE\s+UNIQUE\s+INDEX\b", re.IGNORECASE
    ),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sql_files(release: Path) -> dict[str, Path]:
    directory = release / MIGRATIONS_RELATIVE_PATH
    if not directory.is_dir():
        raise ValueError(f"migration directory is missing: {directory}")
    return {path.name: path for path in directory.glob("*.sql") if path.is_file()}


def load_exceptions(candidate_release: Path) -> list[dict[str, str]]:
    path = candidate_release / EXCEPTIONS_RELATIVE_PATH
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read rollback-safety exceptions from {path}: {error}") from error

    if payload.get("version") != 1 or not isinstance(payload.get("exceptions"), list):
        raise ValueError(f"invalid rollback-safety exception manifest: {path}")

    return validate_exceptions(payload["exceptions"])


def strip_sql_comments(sql: str) -> str:
    without_blocks = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    return re.sub(r"--[^\n]*", " ", without_blocks)


def migration_findings(path: Path) -> list[str]:
    sql = strip_sql_comments(path.read_text(encoding="utf-8"))
    return [label for label, pattern in DESTRUCTIVE_PATTERNS.items() if pattern.search(sql)]


def source_entries(release: Path) -> list[dict[str, object]]:
    directory = release / MIGRATIONS_RELATIVE_PATH
    journal_path = directory / "meta/_journal.json"
    try:
        journal = json.loads(journal_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read migration journal from {journal_path}: {error}") from error

    journal_entries = journal.get("entries")
    if not isinstance(journal_entries, list):
        raise ValueError(f"migration journal entries are invalid: {journal_path}")

    entries: list[dict[str, object]] = []
    for expected_index, journal_entry in enumerate(journal_entries):
        if (
            not isinstance(journal_entry, dict)
            or journal_entry.get("idx") != expected_index
            or not isinstance(journal_entry.get("tag"), str)
        ):
            raise ValueError(f"migration journal ordering is invalid at index {expected_index}")
        path = directory / f"{journal_entry['tag']}.sql"
        if not path.is_file():
            raise ValueError(f"journaled migration is missing: {path}")
        entries.append(
            {
                "migration": path.name,
                "sha256": sha256(path),
                "rollbackIncompatible": migration_findings(path),
            }
        )
    return entries


def validate_exceptions(exceptions: object) -> list[dict[str, str]]:
    if not isinstance(exceptions, list):
        raise ValueError("rollback-safety exceptions must be an array")
    validated: list[dict[str, str]] = []
    for entry in exceptions:
        if not isinstance(entry, dict):
            raise ValueError("every rollback-safety exception must be an object")
        migration = entry.get("migration")
        digest = entry.get("sha256")
        reason = entry.get("reason")
        if (
            not isinstance(migration, str)
            or not re.fullmatch(r"[A-Za-z0-9_.-]+\.sql", migration)
            or not isinstance(digest, str)
            or not re.fullmatch(r"[a-f0-9]{64}", digest)
            or not isinstance(reason, str)
            or len(reason.strip()) < 20
        ):
            raise ValueError(
                "rollback-safety exceptions require a migration filename, lowercase SHA-256, "
                "and a review reason of at least 20 characters"
            )
        validated.append(
            {"migration": migration, "sha256": digest, "reason": reason.strip()}
        )
    return validated


def build_state(release: Path, source_commit: str, output: Path) -> None:
    if not re.fullmatch(r"[a-f0-9]{40}", source_commit):
        raise ValueError("migration state requires a full lowercase source commit SHA")
    state = {
        "version": 1,
        "sourceCommit": source_commit,
        "migrations": source_entries(release),
        "exceptions": load_exceptions(release),
    }
    output.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    print(f"wrote migration release state for {len(state['migrations'])} migration(s) to {output}")


def load_state(release: Path) -> dict[str, object]:
    path = release / STATE_RELATIVE_PATH
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read migration release state from {path}: {error}") from error
    if (
        state.get("version") != 1
        or not isinstance(state.get("sourceCommit"), str)
        or not re.fullmatch(r"[a-f0-9]{40}", state["sourceCommit"])
        or not isinstance(state.get("migrations"), list)
    ):
        raise ValueError(f"invalid migration release state: {path}")

    migrations: list[dict[str, object]] = []
    seen: set[str] = set()
    for entry in state["migrations"]:
        if not isinstance(entry, dict):
            raise ValueError(f"invalid migration entry in {path}")
        migration = entry.get("migration")
        digest = entry.get("sha256")
        findings = entry.get("rollbackIncompatible")
        if (
            not isinstance(migration, str)
            or not re.fullmatch(r"[A-Za-z0-9_.-]+\.sql", migration)
            or migration in seen
            or not isinstance(digest, str)
            or not re.fullmatch(r"[a-f0-9]{64}", digest)
            or not isinstance(findings, list)
            or any(finding not in DESTRUCTIVE_PATTERNS for finding in findings)
        ):
            raise ValueError(f"invalid migration entry in {path}: {migration}")
        seen.add(migration)
        migrations.append(
            {
                "migration": migration,
                "sha256": digest,
                "rollbackIncompatible": findings,
            }
        )

    return {
        "sourceCommit": state["sourceCommit"],
        "migrations": migrations,
        "exceptions": validate_exceptions(state.get("exceptions")),
    }


def release_commit(release: Path) -> str:
    marker = release / RELEASE_MARKER_RELATIVE_PATH
    try:
        lines = marker.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise ValueError(f"cannot read release marker from {marker}: {error}") from error
    commits = [line.split("=", 1)[1] for line in lines if line.startswith("BRIC_RELEASE_COMMIT=")]
    if len(commits) != 1 or not re.fullmatch(r"[a-f0-9]{40}", commits[0]):
        raise ValueError(f"release marker has no unique full commit SHA: {marker}")
    return commits[0]


def entry_prefix_sha256(entries: list[dict[str, object]]) -> str:
    pairs = [[entry["migration"], entry["sha256"]] for entry in entries]
    encoded = json.dumps(pairs, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def verify_entries(
    previous: list[dict[str, object]],
    candidate: list[dict[str, object]],
    exceptions: list[dict[str, str]],
) -> None:
    errors: list[str] = []

    for index, previous_entry in enumerate(previous):
        name = str(previous_entry["migration"])
        if index >= len(candidate):
            errors.append(f"historical migration was removed: {name}")
        elif candidate[index]["migration"] != name or candidate[index]["sha256"] != previous_entry["sha256"]:
            errors.append(f"historical migration was edited, removed, or reordered: {name}")

    added = candidate[len(previous) :]
    used_exceptions: set[tuple[str, str]] = set()
    for migration in added:
        name = str(migration["migration"])
        digest = str(migration["sha256"])
        findings = migration["rollbackIncompatible"]
        if not findings:
            continue

        matching = next(
            (
                entry
                for entry in exceptions
                if entry["migration"] == name and entry["sha256"] == digest
            ),
            None,
        )
        if matching is None:
            errors.append(
                f"new migration {name} contains rollback-incompatible DDL "
                f"({', '.join(findings)}); use an expand/contract release sequence or add an "
                "exact-hash reviewed exception"
            )
        else:
            used_exceptions.add((name, digest))
            print(
                f"warning: reviewed rollback-safety exception for {name}: {matching['reason']}",
                file=sys.stderr,
            )

    for entry in exceptions:
        key = (entry["migration"], entry["sha256"])
        if key not in used_exceptions:
            errors.append(
                f"unused or stale rollback-safety exception: {entry['migration']} {entry['sha256']}"
            )

    if errors:
        raise ValueError("\n".join(errors))

    print(
        f"migration rollback safety verified: {len(previous)} historical and {len(added)} new migration(s)"
    )


def verify_source_releases(previous_release: Path, candidate_release: Path) -> None:
    previous_files = sql_files(previous_release)
    candidate_files = sql_files(candidate_release)
    previous = [
        {
            "migration": name,
            "sha256": sha256(path),
            "rollbackIncompatible": migration_findings(path),
        }
        for name, path in sorted(previous_files.items())
    ]
    candidate = [
        {
            "migration": name,
            "sha256": sha256(path),
            "rollbackIncompatible": migration_findings(path),
        }
        for name, path in sorted(candidate_files.items())
    ]
    verify_entries(previous, candidate, load_exceptions(candidate_release))


def verify_state_releases(previous_release: Path, candidate_release: Path) -> None:
    candidate_state = load_state(candidate_release)
    candidate_commit = release_commit(candidate_release)
    if candidate_state["sourceCommit"] != candidate_commit:
        raise ValueError("candidate migration state does not match its release commit")
    candidate = candidate_state["migrations"]

    if (previous_release / STATE_RELATIVE_PATH).is_file():
        previous_state = load_state(previous_release)
        if previous_state["sourceCommit"] != release_commit(previous_release):
            raise ValueError("previous migration state does not match its release commit")
        previous = previous_state["migrations"]
    else:
        previous_commit = release_commit(previous_release)
        if previous_commit != LEGACY_BASELINE_COMMIT:
            raise ValueError(
                "previous release has no migration state and is not the hash-pinned legacy baseline"
            )
        if len(candidate) < LEGACY_BASELINE_COUNT:
            raise ValueError("candidate migration state is shorter than the legacy baseline")
        previous = candidate[:LEGACY_BASELINE_COUNT]
        if entry_prefix_sha256(previous) != LEGACY_BASELINE_PREFIX_SHA256:
            raise ValueError("candidate migration prefix does not match the legacy baseline")

    verify_entries(previous, candidate, candidate_state["exceptions"])


def verify(previous_release: Path, candidate_release: Path) -> None:
    if (previous_release / MIGRATIONS_RELATIVE_PATH).is_dir() and (
        candidate_release / MIGRATIONS_RELATIVE_PATH
    ).is_dir():
        verify_source_releases(previous_release, candidate_release)
    else:
        verify_state_releases(previous_release, candidate_release)


def main() -> None:
    if len(sys.argv) == 5 and sys.argv[1] == "--build-state":
        try:
            build_state(Path(sys.argv[2]).resolve(), sys.argv[3], Path(sys.argv[4]).resolve())
        except ValueError as error:
            print(f"migration state generation failed:\n{error}", file=sys.stderr)
            raise SystemExit(1) from error
        return
    if len(sys.argv) != 3:
        raise SystemExit(
            "usage: verify-migration-rollback-safety.py <previous-release> <candidate-release>\n"
            "   or: verify-migration-rollback-safety.py --build-state <source-release> "
            "<source-commit> <output>"
        )
    try:
        verify(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
    except ValueError as error:
        print(f"migration rollback safety verification failed:\n{error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
