#!/bin/sh
set -eu

id "$E2E_SFTP_USER" >/dev/null 2>&1 || useradd --create-home --shell /usr/sbin/nologin "$E2E_SFTP_USER"
echo "$E2E_SFTP_USER:$E2E_SFTP_PASS" | chpasswd

root="/home/$E2E_SFTP_USER/$E2E_SFTP_ROOT"
mkdir -p "$root"
chown "$E2E_SFTP_USER" "$root"
echo "outside the sftp root" > /etc/metis-outside.txt
ln -sfn /etc "$root/escape-dir"
ln -sfn /etc/metis-outside.txt "$root/escape-file"
chown -h "$E2E_SFTP_USER" "$root/escape-dir" "$root/escape-file"

mkdir -p /run/sshd
exec /usr/sbin/sshd -D -e
