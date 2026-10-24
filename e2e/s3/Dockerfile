FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a AS unzip

ENV DEBIAN_FRONTEND=noninteractive
COPY debian.sources /etc/apt/sources.list.d/debian.sources
RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip=6.0-29+deb13u1 \
  && rm -rf /var/lib/apt/lists/*

FROM unzip AS fetch-amd64
ADD --checksum=sha256:2d5059501745682664c3d345b22274b66079c952fbec7e1ce66980ef4515cd42 \
  https://github.com/rustfs/rustfs/releases/download/1.0.0/rustfs-linux-x86_64-gnu-v1.0.0.zip /tmp/rustfs.zip

FROM unzip AS fetch-arm64
ADD --checksum=sha256:780e832d68e0148dc042f05647796056fe014e7cf1a8f195e3e83b22a3bb988f \
  https://github.com/rustfs/rustfs/releases/download/1.0.0/rustfs-linux-aarch64-gnu-v1.0.0.zip /tmp/rustfs.zip

FROM fetch-${TARGETARCH} AS fetch
RUN unzip -j /tmp/rustfs.zip rustfs -d /out

FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a

COPY --from=fetch --chmod=755 /out/rustfs /usr/local/bin/rustfs
USER nobody
HEALTHCHECK --interval=2s --timeout=3s --retries=30 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/9000 && printf "GET /health HTTP/1.0\r\n\r\n" >&3 && read -r status <&3 && [[ $status == *" 200 "* ]]'
CMD ["rustfs"]
