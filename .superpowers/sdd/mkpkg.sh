#!/bin/sh
# usage: mkpkg.sh <base> <head> <taskno>
cd "$(git rev-parse --show-toplevel)" || exit 1
OUT=".superpowers/sdd/task-$3-review-package.md"
{ echo "# Review package: Task $3 ($1..$2)"; echo
  echo "## Commits"; git log --oneline "$1".."$2"; echo
  echo "## Stat"; git diff --stat "$1".."$2"; echo
  echo "## Diff"; echo '```diff'; git diff -U10 "$1".."$2"; echo '```'
} > "$OUT"
echo "$OUT"
