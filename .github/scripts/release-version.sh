#!/usr/bin/env bash
set -euo pipefail

prefix="$1"
manifest="$2"
field="$3"

if [[ "$GITHUB_EVENT_NAME" != release ]]; then
  printf 'version=\nlatest=true\n' >> "$GITHUB_OUTPUT"
  exit 0
fi

tag=$(jq -r .release.tag_name "$GITHUB_EVENT_PATH")
version="${tag#"$prefix"}"
expected=$(jq -r "$field" "$manifest")
if [[ "$version" != "$expected" ]]; then
  echo "::error::$tag does not match $manifest version $expected"
  exit 1
fi

latest=true
if [[ $(jq -r .release.prerelease "$GITHUB_EVENT_PATH") == true ]]; then
  latest=false
fi
printf 'version=%s\nlatest=%s\n' "$version" "$latest" >> "$GITHUB_OUTPUT"
