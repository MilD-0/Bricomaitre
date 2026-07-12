#!/usr/bin/env python3
import re
import sys


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: extract-static-page-count.py <build-log>", file=sys.stderr)
        return 2

    with open(sys.argv[1], "r", encoding="utf-8", errors="ignore") as handle:
        content = handle.read()

    matches = re.findall(
        r"Generating static pages using \d+ workers? \((\d+)/(\d+)\)[^\n\r]*",
        content,
    )
    if not matches:
        print("unable to find completed static-page generation count", file=sys.stderr)
        return 1

    generated, total = matches[-1]
    if generated != total:
        print(f"static-page generation did not complete: {generated}/{total}", file=sys.stderr)
        return 1

    print(generated)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
