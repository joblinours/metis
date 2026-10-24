FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a

ENV DEBIAN_FRONTEND=noninteractive
COPY debian.sources /etc/apt/sources.list.d/debian.sources
RUN apt-get update \
  && apt-get install -y --no-install-recommends radicale=3.5.3-1 \
  && rm -rf /var/lib/apt/lists/*

COPY --chmod=644 caldav/config /etc/radicale/config
COPY --chmod=644 caldav/users /etc/radicale/users
USER radicale
HEALTHCHECK --interval=2s --timeout=3s --retries=30 \
  CMD python3 -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:5232/")'
CMD ["radicale", "--config", "/etc/radicale/config"]
