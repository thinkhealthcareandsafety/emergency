# ERT Live — Emergency Response Team availability board

A live wall-screen dashboard that shows **which ERT members are on site right now**, driven automatically by the
hotel's existing **HONO HR** attendance punches. It replaces the manual "who's available" list.

- Staff punch in/out in HONO as they already do → the screen updates within seconds.
- Each ERT role (Fire Warden, First Aider, …) has a **minimum on duty**. Screens turn **red** when a role is short.
- **Missed punch-outs** are detected and shown as "Unconfirmed" instead of silently counting as available.
- Supervisors can **override** status with a reason ("Escorting guest to hospital", 1 hour).
- **Emergency mode**: one click turns every screen at that property red and starts a live **headcount (muster)** of
  everyone punched in, with tick-off at the assembly point.
- Multi-property: one URL per hotel, any number of screens per hotel, all in sync.

## How it works

```
 HONO HR ──(A) pull API every 60s ───┐
         ──(B) webhook push ─────────┤
         ──(C) CSV export upload ────┤
 Supervisor manual punch/override ───┤
                                     ▼
                       Node/Express API ── MongoDB
                       (dedupe, status rules)
                                     │ Socket.IO "changed"
                                     ▼
         Smart screen /display/MAIN   ·   Admin console /admin
```

Availability rules (`server/src/services/availability.js`), in priority order:

1. Active supervisor override → that status.
2. Last punch **IN** → **On duty**; last punch **OUT** → **Off duty**.
3. Punched IN more than `STALE_AFTER_HOURS` ago → **Unconfirmed** (not counted towards coverage, still in the muster list).

Punches are idempotent (same employee + timestamp stored once) and out-of-order punches never roll status backwards,
so re-syncs and overlapping CSV uploads are safe.

## Run it locally

```bash
npm run install:all
npm run demo          # builds the React app and starts on http://localhost:4000
```

There is no sample data. A fresh database gets one empty property (`MAIN`, rename it in Admin → Properties), the
admin login and the six default ERT roles. Add staff in Admin → Team or Import.

With no `MONGO_URI` the server uses an in-memory MongoDB, so **everything is lost on restart**. Set `MONGO_URI`
for anything you want to keep.

| What | URL |
|---|---|
| Wall screen | http://localhost:4000/display/MAIN?key=display-dev-key |
| Admin | http://localhost:4000/admin (admin / admin123) |

For development with hot reload: `npm run dev:server` and `npm run dev:client` (Vite on :5173, proxied to :4000).

## Live demo with real people (QR punching)

For client demos before HONO is connected: people in the room scan a QR code on the wall screen, type their
name, pick an ERT role and tap **Punch in** on their phone. The screen updates in about a second. Punches go through
the same punch pipeline HONO data uses (`processPunch`), so it is the real system, just with a different source.

```bash
npm run demo:public        # public https address + QR card on screen
```

The script (Windows, `scripts/start-public-demo.ps1`) installs `cloudflared` if needed, opens a free Cloudflare quick
tunnel, generates **fresh random secrets for that session**, and prints:

- the wall-screen link with the QR card (`/display/MAIN?key=...&qr=1`)
- the admin login
- the webhook URL + key you can hand to the client's HONO admin to test real punches immediately

The address changes on every start. Admin → **Live demo** shows the QR large, and **Remove demo visitors** cleans up
afterwards. Turn QR punching off in production (`DEMO_PUNCH=false`, the default with a real database).

Same Wi-Fi alternative without a tunnel: open `http://<laptop-wifi-ip>:4000/display/MAIN?key=...&qr=1` on the
screen (allow Node through Windows Firewall when asked).

## Permanent public address

On a cloud VM with Docker: point a domain's DNS at the server, set `DOMAIN`, `PUBLIC_URL` and all secrets in `.env`,
then:

```bash
docker compose --profile https up -d --build   # Caddy adds automatic HTTPS (Let's Encrypt)
```

This gives HONO a stable webhook address: `https://<domain>/api/ingest/punch`.

## Connecting HONO HR — what to ask HONO for

HONO's integration API details are tenant-specific and not public, so the system supports every route. Ask the client's
HONO (SequelOne) account manager for **one** of these, in order of preference:

1. **Webhook / real-time push of attendance punches** to our URL
   `POST https://<server>/api/ingest/punch` with header `x-api-key: <INGEST_API_KEY>`.
   Body can be one punch, an array, or `{ "punches": [...] }`. Field names are matched loosely
   (`employeeCode`/`empId`/`Employee Code`, `punchTime`/`timestamp`, `punchType`/`direction`/`IN`/`Check-In`).
2. **REST API to read the punch / attendance log** for a time range. Then set in `.env`:
   `HONO_ENABLED=true`, `HONO_BASE_URL`, `HONO_PUNCH_PATH`, `HONO_API_KEY`, and map the response with
   `HONO_RECORDS_PATH` and `HONO_FIELD_*`. No code changes needed. The poller re-reads a 60-minute overlap every cycle
   because biometric devices often sync into HONO late.
3. **Scheduled export** (CSV/Excel) of the punch log. Upload under Admin → Import (works today, but not real-time).

Questions to send HONO:

- Can you push each punch to a webhook URL as it happens? If not, which API endpoint returns raw punches for a date/time range?
- Auth method (API key / OAuth client credentials) and rate limits?
- Field names for employee code, punch time (with timezone?), direction (IN/OUT or numeric code), and location/branch.
- How quickly do biometric/geo punches appear in HONO after the employee punches?

If the hotels' biometric devices (eSSL/ZKTeco etc.) feed HONO, a small bridge can also read the devices directly and
post to `/api/ingest/punch` for near-instant updates.

## Go-live checklist

1. Copy `.env.example` → `.env`, set **all secrets** (the server refuses to start in production with defaults).
2. `docker compose up -d --build` (app + MongoDB with a persistent volume). Put it behind HTTPS (nginx/Caddy/cloud LB).
3. Admin → **Properties**: add each hotel, its assembly point and emergency numbers.
4. Admin → **Import**: upload the staff list with ERT roles. **Employee codes must match HONO exactly.**
5. Admin → **Roles & rules**: set minimum on duty per role and the missing punch-out threshold (just above the longest shift).
6. Connect HONO (above). Check Admin → HONO integration shows "Connected".
7. Screens: open `https://<server>/display/<CODE>?key=<DISPLAY_KEY>` full-screen.

### Smart screen setup

- **Android TV / smart TV**: install a kiosk browser (e.g. Fully Kiosk Browser), set the display URL as start page,
  enable auto-start on boot and "keep screen on".
- **Mini PC / stick PC**: Chrome `--kiosk --noerrdialogs --disable-session-crashed-bubble "<display URL>"` on startup.
- Double-click the screen to toggle fullscreen; the cursor hides after 4s; the page keeps the screen awake.
- If the network drops, the screen keeps the last data and shows an amber "Connection lost" bar, then recovers on its own.

## Project layout

```
server/src
  index.js                 Express + Socket.IO bootstrap
  config.js                All env configuration
  models/index.js          Property, Employee, PunchEvent, Settings, User, Emergency
  services/availability.js The availability rules
  services/punches.js      Punch ingestion (dedupe, ordering, auto-create)
  services/parse.js        Loose field matching + Indian date formats
  services/snapshot.js     Screen + muster data
  integrations/hono.js     HONO pull poller (config-driven)
  routes/                  auth, display (screen), ingest (webhook), admin
client/src
  pages/Display.jsx        The wall screen
  admin/*                  Team, Emergency, Roles, Import, Integration, Properties
```

## Security notes

- Screens use a read-only `DISPLAY_KEY`; the socket only broadcasts "changed", never staff data.
- Webhook requires `INGEST_API_KEY`; admin uses JWT (12h) with login rate limiting.
- The screen shows staff names and mobile numbers. Place it in staff-only areas (security room, back office, ERT
  room), not guest-facing areas.
