#!/usr/bin/env bash
# Copies the compiled ZK artifacts into public/ so the browser can fetch them.
# FetchZkConfigProvider looks for <base>/keys/<circuit>.{prover,verifier} and
# <base>/zkir/<circuit>.bzkir, so the layout under managed/ is preserved.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/managed"
dest="$root/public/zk/counter"

if [ ! -d "$src/keys" ] || [ ! -d "$src/zkir" ]; then
  echo "managed/ has no compiled artifacts. Run 'npm run compile' first." >&2
  exit 1
fi

rm -rf "$dest"
mkdir -p "$dest/keys" "$dest/zkir"
cp "$src"/keys/*.prover "$src"/keys/*.verifier "$dest/keys/"
cp "$src"/zkir/*.bzkir "$dest/zkir/"

echo "ZK artifacts published to public/zk/counter:"
find "$dest" -type f | sed "s|$root/||" | sort
