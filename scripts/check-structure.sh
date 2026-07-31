#!/bin/sh
set -eu

required_paths='
contracts/counter.compact
managed
src/components
src/hooks
src/App.tsx
src/main.tsx
tests/counter.test.ts
.github/workflows/ci.yml
PROPOSAL.md
README.md
package.json
'

missing=0
for path in $required_paths; do
  if [ ! -e "$path" ]; then
    printf 'Missing required path: %s\n' "$path" >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  exit 1
fi

echo "Level 3 file structure is complete."
