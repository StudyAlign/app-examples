# StudyAlign example apps

Two minimal demo prototypes that show how to instrument an app with the
[`study-align-lib`](https://www.npmjs.com/package/study-align-lib) interaction
logging library. Both wrap a [Quill](https://quilljs.com) rich-text editor and
log mouse clicks, keyboard events, and editor text/selection changes to a
StudyAlign backend:

| App | Stack | Path |
|-----|-------|------|
| `apps/react-app`   | React 18 + Vite + Quill 2 | `/react/` |
| `apps/vanilla-app` | Vanilla JS + Vite + Quill 2 | `/vanilla/` |

Both sit behind a single **nginx reverse proxy** (the one public-facing
container), which also serves a landing page at `/`. The whole thing runs from
one `docker compose` stack, with overlays for development and production.

```
Internet ─▶ Caddy (host, TLS) ─▶ proxy (nginx)  ─┬─▶ react-app   (/react/)
                                                 └─▶ vanilla-app (/vanilla/)
```

## Quick start (development)

Hot-reloading Vite dev servers, source bind-mounted, HMR through the proxy:

```bash
cp .env.example .env      # COMPOSE_FILE already points at the dev overlay
docker compose up --build
```

Then open:

- <http://localhost:8080/>: landing page
- <http://localhost:8080/react/>: React demo
- <http://localhost:8080/vanilla/>: Vanilla JS demo

Change the published port with `PROXY_PORT` in `.env`.

### Seeing interactions logged

Interactions are always echoed to the **browser console**, so the demo works
standalone. To record to a real backend, the app needs the URL parameters a
StudyAlign study passes to a prototype: `study_id`, `condition_id`,
`logger_key`, `participant_token`. Open it via your StudyAlign study, or append
them by hand, e.g.:

```
http://localhost:8080/react/?study_id=2&condition_id=1&logger_key=YOUR_KEY&participant_token=…
```

The backend URL is set with `VITE_STUDY_ALIGN_URL` in `.env` (baked into the
build). It defaults to the public StudyAlign dev backend.

## Production

The base file is prod-shaped: each app is a static build served by its own
small nginx; the `proxy` container is the single public entry point.
`docker-compose.prod.yml` drops the published port and joins Caddy's shared
external `web` network.

Follow `DEPLOYMENT_STRATEGY.template.md`. In short, on the server:

```bash
# one-time
docker network create web                       # if not already created for Caddy
sudo mkdir -p /opt/studyalign-examples && sudo chown "$USER" /opt/studyalign-examples
git clone <repo> /opt/studyalign-examples && cd /opt/studyalign-examples
cp .env.example .env
#   set in .env:  COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
#   set VITE_STUDY_ALIGN_URL to your backend

./deploy-examples.sh                             # first deploy
# add deploy/Caddyfile.example to the host Caddy, reload
# add deploy/webhook.conf.example to /etc/webhook.conf, restart webhook
```

Afterwards a push to `main` deploys itself via the webhook. Files provided for
deployment:

- `docker-compose.prod.yml`: prod overlay (no host port, joins `web`)
- `deploy-examples.sh`: idempotent pull/rebuild/verify script with a rollback hint
- `deploy/Caddyfile.example`: the host Caddy site block
- `deploy/webhook.conf.example`: HMAC-authenticated deploy webhook
- `.env.example`: documented environment template

## Layout

```
docker-compose.yml            base stack: proxy + react-app + vanilla-app
docker-compose.dev.yml        dev overlay: Vite dev servers + source mounts
docker-compose.prod.yml       prod overlay: no host port, join "web"
deploy-examples.sh            deploy script
deploy/proxy/                 reverse-proxy image (nginx config + landing page)
deploy/Caddyfile.example      host Caddy site block
deploy/webhook.conf.example   deploy webhook
apps/react-app/               React + Quill demo
apps/vanilla-app/             Vanilla JS + Quill demo
```

The `study-align/` submodule is the StudyAlign platform itself, included for
reference only. **Do not modify it.** The example apps depend on the published
`study-align-lib` package from npm, not on the submodule.
