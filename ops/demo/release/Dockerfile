FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS node
FROM postgres:16-bookworm@sha256:d81f7b51697014367236d07ec58b54153fc28f828b72bf247fe5c7487520bcb0
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/LICENSE /usr/local/share/licenses/node/LICENSE
WORKDIR /bundle
COPY demo ./demo
COPY ops/env/admin-ai-limits.env ./ops/env/admin-ai-limits.env
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
