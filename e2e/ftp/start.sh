#!/bin/bash
set -euo pipefail

id "$E2E_FTP_USER" >/dev/null 2>&1 || useradd --no-create-home --home-dir /home/files --shell /bin/sh "$E2E_FTP_USER"
echo "$E2E_FTP_USER:$E2E_FTP_PASS" | chpasswd
chown "$E2E_FTP_USER" /home/files
mkdir -p /run/vsftpd/empty

vsftpd /etc/vsftpd/explicit.conf &
vsftpd /etc/vsftpd/implicit.conf &
wait -n
exit 1
