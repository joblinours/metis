FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a

ENV DEBIAN_FRONTEND=noninteractive
COPY debian.sources /etc/apt/sources.list.d/debian.sources
RUN apt-get update \
  && apt-get install -y --no-install-recommends vsftpd=3.0.5-0.2 \
  && rm -rf /var/lib/apt/lists/* /etc/vsftpd.conf \
  && mkdir -p /etc/vsftpd/tls

COPY --chmod=644 ftp/explicit.conf ftp/implicit.conf /etc/vsftpd/
COPY --chmod=644 ftp/tls/ftp.localhost.crt /etc/vsftpd/tls/
COPY --chmod=600 ftp/tls/ftp.localhost.key /etc/vsftpd/tls/
COPY --chmod=755 ftp/start.sh /start.sh
HEALTHCHECK --interval=2s --timeout=3s --retries=30 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/21 && read -r line <&3 && [[ $line == 220* ]] && exec 4<>/dev/tcp/127.0.0.1/990'
CMD ["/start.sh"]
