#!/bin/bash
set -euo pipefail

folders="INBOX Archive Drafts Sent Trash Junk"

postfix start-fg &
dovecot -F &

until doveadm mailbox create -u "$E2E_IMAP_USER" -s Archive Drafts Sent Trash Junk 2>/dev/null; do :; done
for folder in $folders; do
  doveadm mailbox update -u "$E2E_IMAP_USER" --uid-validity "$UID_VALIDITY" "$folder"
done

wait -n
exit 1
