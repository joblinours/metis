#!/usr/bin/env bash
set -euo pipefail

image="ghcr.io/${GITHUB_REPOSITORY,,}"
tags=("${image}:${GITHUB_SHA}${SUFFIX}")

if [[ "$GITHUB_REF_TYPE" == tag ]]; then
  if [[ "$GITHUB_REF_NAME" == v* ]]; then
    tags+=("${image}:${GITHUB_REF_NAME#v}${SUFFIX}")
  fi
else
  slug=$(printf '%s' "${GITHUB_REF_NAME,,}" | tr -c 'a-z0-9._-' '-' | sed -E 's/^[-.]+//' | cut -c1-120)
  tags+=("${image}:${slug}${SUFFIX}")
  if [[ "$GITHUB_REF_NAME" == "$DEFAULT_BRANCH" ]]; then
    tags+=("${image}:latest${SUFFIX}")
  fi
fi

{
  echo "tags<<EOF"
  printf '%s\n' "${tags[@]}"
  echo "EOF"
} >> "$GITHUB_OUTPUT"
