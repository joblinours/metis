#!/usr/bin/env bash
set -euo pipefail

changelog="$1"
version="$2"

section=$(awk -v heading="## ${version} - " '
  index($0, heading) == 1 { found = 1; next }
  found && /^## / { exit }
  found { print }
' "$changelog" | sed -e '/./,$!d')

if [[ -z "${section//[[:space:]]/}" ]]; then
  echo "::error::$changelog has no entries under '## $version - YYYY-MM-DD'" >&2
  exit 1
fi
printf '%s\n' "$section"
