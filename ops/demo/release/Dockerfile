FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS node
FROM postgres:16-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/LICENSE /usr/local/share/licenses/node/LICENSE
WORKDIR /bundle
COPY demo ./demo
COPY apps/admin/drizzle ./apps/admin/drizzle
COPY ops/demo/data ./ops/demo/data
COPY ops/demo/postgres ./ops/demo/postgres
COPY ops/demo/release ./ops/demo/release
COPY ops/docker/postgres/init-roles.sh ./ops/docker/postgres/init-roles.sh
COPY LICENSE NOTICE ./
COPY third_party/licenses ./third_party/licenses
RUN mkdir -p /runtime && ln -s /runtime ops/demo/.runtime \
  && ln -s /bundle/ops/demo/postgres /seed && ln -s /bundle/ops/demo/data /data \
  && chmod +x /bundle/demo
ARG BRIC_IMAGE_REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/MilD-0/Bricomaitre" \
  org.opencontainers.image.revision="${BRIC_IMAGE_REVISION}" \
  org.opencontainers.image.licenses="AGPL-3.0-only"
ENTRYPOINT ["/bin/bash", "/bundle/ops/demo/release/initialize.sh"]
