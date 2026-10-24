FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a

ENV DEBIAN_FRONTEND=noninteractive
COPY debian.sources /etc/apt/sources.list.d/debian.sources
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    dovecot-core=1:2.4.1+dfsg1-6+deb13u7 \
    dovecot-imapd=1:2.4.1+dfsg1-6+deb13u7 \
    dovecot-lmtpd=1:2.4.1+dfsg1-6+deb13u7 \
    dovecot-submissiond=1:2.4.1+dfsg1-6+deb13u7 \
    postfix=3.10.13-0+deb13u1 \
  && rm -rf /var/lib/apt/lists/* /etc/dovecot/conf.d \
  && useradd --system --no-create-home --home-dir /srv/vmail vmail \
  && postconf -F '*/*/chroot = n'

COPY --chmod=644 mail/dovecot.conf /etc/dovecot/dovecot.conf
COPY --chmod=644 mail/main.cf /etc/postfix/main.cf
COPY --chmod=755 mail/start.sh /start.sh
HEALTHCHECK --interval=2s --timeout=3s --retries=60 \
  CMD bash -c 'case "$(doveadm mailbox status -u "$E2E_IMAP_USER" uidvalidity Junk 2>/dev/null)" in "Junk uidvalidity=$UID_VALIDITY") ;; *) exit 1 ;; esac; exec 3<>/dev/tcp/127.0.0.1/25 && read -r line <&3 && [[ $line == 220* ]]'
CMD ["/start.sh"]
