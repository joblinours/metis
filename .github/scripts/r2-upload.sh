#!/usr/bin/env bash
set -euo pipefail

directory="$1"
version_path="$2"
latest_path="$3"
shift 3
files=("$@")

endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export AWS_DEFAULT_REGION=auto

cd "$directory"

for f in "${files[@]}"; do
  [[ -f "$f" ]] || { echo "::error::$f is missing"; exit 1; }
done
sha256sum "${files[@]}" > SHA256SUMS
cat SHA256SUMS

if aws s3api head-object --endpoint-url "$endpoint" --bucket "$R2_BUCKET" --key "${version_path}SHA256SUMS" > /dev/null 2>&1; then
  echo "::error::${version_path} is already published"
  exit 1
fi

upload() {
  local path="$1" cache="$2" f
  for f in "${files[@]}"; do
    aws s3 cp "$f" "s3://${R2_BUCKET}/${path}${f}" --endpoint-url "$endpoint" --cache-control "$cache"
  done
  aws s3 cp SHA256SUMS "s3://${R2_BUCKET}/${path}SHA256SUMS" --endpoint-url "$endpoint" \
    --cache-control "$cache" --content-type "text/plain; charset=utf-8"
}

upload "$version_path" "public, max-age=31536000, immutable"
if [[ "$LATEST" == true ]]; then
  upload "$latest_path" "public, max-age=300"
fi
