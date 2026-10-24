FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a

ENV DEBIAN_FRONTEND=noninteractive
COPY debian.sources /etc/apt/sources.list.d/debian.sources
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssh-server=1:10.0p1-7+deb13u4 \
  && rm -rf /var/lib/apt/lists/* /etc/ssh/ssh_host_*

COPY --chmod=600 sftp/keys/ssh_host_ed25519_key sftp/keys/ssh_host_rsa_key /etc/ssh/
COPY --chmod=644 sftp/keys/ssh_host_ed25519_key.pub sftp/keys/ssh_host_rsa_key.pub /etc/ssh/
COPY --chmod=644 sftp/sshd_config /etc/ssh/sshd_config
COPY --chmod=755 sftp/start.sh /start.sh
HEALTHCHECK --interval=2s --timeout=3s --retries=30 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/22 && read -r line <&3 && [[ $line == SSH-* ]]'
CMD ["/start.sh"]
