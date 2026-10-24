FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a AS fetch-amd64
ADD --checksum=sha256:ecf06ab74752eb0248b430e6e6434b27eb49378a4d1d784938625e9326f675cd \
  https://github.com/hacdias/webdav/releases/download/v5.16.1/linux-amd64-webdav.tar.gz /tmp/webdav.tar.gz

FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a AS fetch-arm64
ADD --checksum=sha256:63036043cd8dad874550b21a27720ec0d4b3b59fd1d57f1cc938de0e34f70af1 \
  https://github.com/hacdias/webdav/releases/download/v5.16.1/linux-arm64-webdav.tar.gz /tmp/webdav.tar.gz

FROM fetch-${TARGETARCH} AS fetch
RUN mkdir /out && tar -xzf /tmp/webdav.tar.gz -C /out webdav

FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a

RUN mkdir /etc/webdav
COPY --from=fetch --chmod=755 /out/webdav /usr/local/bin/webdav
COPY --chmod=644 webdav/config.yml /etc/webdav/config.yml
USER nobody
HEALTHCHECK --interval=2s --timeout=3s --retries=30 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/6065'
CMD ["webdav", "-c", "/etc/webdav/config.yml"]
