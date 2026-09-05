# Run the Bricomaitre demo

Install Docker with Compose, extract this release, then run this command in
the extracted directory:

```sh
docker compose up -d
```

The first start downloads the images and builds the demonstration database.
Follow progress with `docker compose logs -f dataset`. Once initialization
finishes, open:

- Storefront: http://127.0.0.1:3402
- Admin: http://127.0.0.1:3400

Click **Enter the demo** for the seeded operator account. The catalog, orders,
customers, analytics, and provider responses are demonstration data. Live AI
is disabled. No production credentials or external service accounts are needed.
Product images are included and served by local object storage.

The bundle runs Linux containers. Use Docker Engine with Compose on Linux or
Docker Desktop with Linux containers on Windows and macOS. The release manifest
records the architectures supplied. Allocate 4 GB of memory to Docker and allow
20 GB of free disk space for images, database initialization, and reset storage.
These are starting allocations, not measured minimum requirements.

The browser URLs and ports above are fixed for these prebuilt images. Keep
ports 3400, 3401, 3402, and 3900 available. Services bind to your machine's
loopback interface. Custom domains and hosted deployments use the source demo
configuration because browser configuration is compiled into the web images.
The release uses its own Compose project and volumes, separate from `./demo`.
Stop the source demo first if it occupies these ports.

## AI assistants

AI assistants are not yet available in the hosted demo, and this bundle keeps
them disabled. To try them with your own OpenRouter account, use the source
checkout and run `./demo up`. In `ops/demo/.runtime/admin.env` and
`ops/demo/.runtime/storefront.env`, set `OPENROUTER_API_KEY`,
`AI_PROVIDER=openrouter`, and `AI_ENABLED=true`. Configure `AI_ADMIN_MODEL` and
`AI_CONTENT_MODEL` for Admin, and `AI_STOREFRONT_MODEL` for Storefront.

Recreate the affected containers without rerunning the seed jobs:

```sh
docker compose --env-file ops/demo/.runtime/compose.env -f ops/demo/compose.yml \
  up -d --no-deps --force-recreate admin admin-worker storefront
```

Enable the shopping assistant and select a valid model in Admin's Storefront
settings too. The `./demo` launcher regenerates these environment files, so
later launcher commands overwrite manual changes. Keep your API key out of Git.

TODO: add local AI model support to the demo.

## Stop and resume

```sh
docker compose stop
docker compose start
```

Ordinary restarts preserve your work. `docker compose down` also preserves data
volumes. Start again with `docker compose up -d`.

## Reset

Run these commands in order. They work in a shell or PowerShell:

```sh
docker compose stop storefront admin admin-worker storefront-api storefront-marketing-worker
docker compose run --rm --no-deps dataset reset
docker compose run --rm --no-deps media reset
docker compose run --rm --no-deps cache-reset
docker compose restart mock-services
docker compose up -d --wait --no-deps mock-services
docker compose run --rm --no-deps mock-state
docker compose start storefront-api storefront-marketing-worker admin admin-worker storefront
```

This discards your demo edits, uploads, and queues, restores the original data,
and adds a fresh operational queue dated relative to the reset. Credentials
survive the reset. A reset on a later date rebuilds historical data first, which
takes several minutes. Resets are manual; no host scheduler or Docker socket is
required.

## Remove or install a different release

```sh
docker compose down --volumes
```

This deletes this installation's containers and data, including its reset
template and generated credentials. Download the new release and start it in
the same way as a first installation. Demo volumes are not an upgrade path for
business data.

Use `docker compose ps -a` and `docker compose logs` to investigate startup
failures. The `NOTICE`, source lock, image manifest, and release manifest bundled
here identify the software and demonstration assets.
