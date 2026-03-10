# FallGuard (React + TypeScript + Vite)

## Project Layout

- `frontend/` React + Vite web app
- `backend/api/` Node.js relay API for LINE + MLflow logging
- `backend/uploads/` runtime uploaded snapshots
- `ai/` placeholder for AI/model assets
- `ai_service/` ML/analytics service container files
- `scripts/` local orchestration scripts (`dev:all`, `dev:stop`)
- `docker-compose.yml` full stack (web + relay + mlflow)

## LINE Alert Quick Setup (Webhook Relay)

This project includes a local relay server for sending alerts to LINE Messaging API safely.

1. Copy env template

```bash
cp .env.relay.example .env.local
```

2. Fill values in `.env.local`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_TARGET_USER_ID`
- Optional: `LINE_RELAY_SECRET` and `VITE_LINE_RELAY_SECRET` (must match)
- Optional for sending image: `LINE_PUBLIC_BASE_URL` (must be public HTTPS URL)

3. Run relay server and app

```bash
npm run dev:relay
npm run dev
```

Or run everything (web + relay + ngrok) in one command:

```bash
npm run dev:all
```

Or run everything with MLflow too (starts Docker `mlflow` service first):

```bash
npm run dev:all:with-mlflow
```

Stop everything (local + Docker):

```bash
npm run dev:stop
```

Clean generated local files:

```bash
npm run clean
```

Clean generated files + local MLflow runs:

```bash
npm run clean:all
```

- If `NGROK_DOMAIN` is set in `.env.local`, it will run `ngrok http --domain <NGROK_DOMAIN> <LINE_RELAY_PORT>`.
- If `NGROK_DOMAIN` is empty, it will run `ngrok http <LINE_RELAY_PORT>`.
- If `LINE_PUBLIC_BASE_URL` is empty and `NGROK_DOMAIN` is set, it is auto-filled as `https://<NGROK_DOMAIN>` for that session.
- For `dev:all:with-mlflow`, relay uses `MLFLOW_TRACKING_URI=http://localhost:5001` when unset or set to `http://mlflow:5001`.

4. In the app settings
- Choose `Webhook`
- Use URL: `http://localhost:8787/line-webhook` (or from `VITE_LINE_WEBHOOK_URL`)
- Press `ทดสอบการแจ้งเตือน`

If the app can send test notification, fall alerts will also be pushed to LINE.

### Send real image to LINE

LINE image message requires a public HTTPS image URL.

1. Expose relay with tunnel (example using ngrok)
```bash
ngrok http 8787
```
Or use one command:
```bash
npm run dev:all
```
2. Set `LINE_PUBLIC_BASE_URL` in `.env.local` to your ngrok HTTPS URL
3. Restart relay: `npm run dev:relay`

After this, fall alerts can include screenshot images in LINE.

### Auto cleanup uploaded images

Configure in `.env.local`:

- `LINE_IMAGE_RETENTION_HOURS=24` to delete images older than 24 hours (`0` disables age-based cleanup)
- `LINE_IMAGE_CLEANUP_INTERVAL_SECONDS=300` to run cleanup every 5 minutes (`0` disables periodic cleanup)
- `LINE_IMAGE_MAX_FILES=500` to keep only the newest 500 files (`0` disables max-files cleanup)
- `LINE_IMAGE_STORAGE_DIR=backend/uploads` (recommended path in this repository layout)

### Connect MLflow

Configure in `.env.local`:

- `MLFLOW_TRACKING_URI=http://<mlflow-host>:5001` (or your hosted HTTPS endpoint)
- `MLFLOW_EXPERIMENT_NAME=fallguard-alerts`
- Optional image artifact:
  - `MLFLOW_LOG_IMAGE_ARTIFACT=true`
  - `MLFLOW_IMAGE_ARTIFACT_PATH=event-images`
  - `MLFLOW_IMAGE_ARTIFACT_MAX_BYTES=2000000`
- Optional auth: `MLFLOW_TRACKING_TOKEN` or `MLFLOW_TRACKING_USERNAME` + `MLFLOW_TRACKING_PASSWORD`
- Optional run tags: `RELAY_APP_VERSION`, `RELAY_GIT_SHA`

Then restart relay:

```bash
npm run dev:relay
```

Relay will create/log a run for each webhook event (test + fall alerts) with metrics like:
- `line_push_success`
- `has_image`
- `line_image_message`
- `mlflow_image_artifact`
- `image_payload_kb`
- `confidence_pct` (when available)

And params/tags such as:
- `event_type`, `location`, `person_label`, `line_status_code`
- `image_artifact_path`, `image_artifact_uploaded`, `image_artifact_error`
- tags `app_version`, `git_sha`, `source`

## Docker (Web + Relay + MLflow)

Run everything with Docker Compose:

```bash
docker compose up --build -d
```

Services:
- Web UI: `http://localhost:5173`
- Relay API: `http://localhost:8787/health`
- MLflow UI: `http://localhost:5001`
- Postgres: `localhost:5432`
- pgAdmin: `http://localhost:5050` (default login: `admin@admin.com` / `admin`)

Stop services:

```bash
docker compose down
```

View logs:

```bash
docker compose logs -f --tail=200
```

Notes:
- Compose uses `.env.local` for relay secrets (`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_TARGET_USER_ID`, etc.).
- Inside Docker, relay talks to MLflow via `http://mlflow:5001` by default.
- Inside Docker, relay talks to Postgres via `postgresql://fallguard:fallguard@postgres:5432/fallguard` by default.
- MLflow host validation is enabled. Docker dev default uses `MLFLOW_ALLOWED_HOSTS=*` to avoid local host-header issues. For production, set a strict allow-list.
- If host ports are occupied, override before running:
  - `WEB_PORT=5174 RELAY_PORT=8788 MLFLOW_PORT=5002 POSTGRES_PORT=5433 PGADMIN_PORT=5051 docker compose up --build -d`

### pgAdmin quick connect

1. เปิด `http://localhost:5050`
2. Login ด้วย:
   - Email: `admin@admin.com`
   - Password: `admin`
3. Add New Server:
   - Host: `postgres`
   - Port: `5432`
   - Database: `fallguard`
   - Username: `fallguard`
   - Password: `fallguard`

## PostgreSQL Event Store

Relay จะบันทึกข้อมูลลง Postgres อัตโนมัติทุกครั้งที่เรียก `/line-webhook`

### ตารางที่จัดเก็บ

- `event_records` ข้อมูลเหตุการณ์หลัก (เวลา, person, confidence, location, metadata)
- `event_images` ข้อมูลไฟล์ภาพ (filename/path/public URL/hash/size)
- `alert_deliveries` ผลการส่ง LINE (success/status/error/latency/request payload snapshot)
- `mlflow_run_logs` ความสัมพันธ์กับ MLflow run + metrics/params/tags
- `relay_audit_logs` audit ราย request (path/method/status/ip/body snapshot)
- `sites`, `cameras`, `person_profiles`, `notification_targets` ข้อมูลอ้างอิง

### API สำหรับหน้า Calendar/Timeline

- `GET /api/events?days=120&limit=1500`
- รองรับ query: `days`, `limit`, `from`, `to`, `eventType`
- response มีข้อมูลที่หน้า analytics ใช้ตรงๆ เช่น `timestamp`, `personLabel`, `location`, `confidencePct`, `screenshotUrl`

### การตั้งค่า

กำหนดใน `.env.local`:

- `DATABASE_ENABLED=true`
- `DATABASE_URL=postgresql://fallguard:fallguard@localhost:5432/fallguard`
- `DATABASE_SSL=false`
- `DATABASE_POOL_MAX=10`

รัน migration แบบ manual:

```bash
npm run db:migrate
```

หรือให้ relay apply schema ตอนเริ่มทำงานอัตโนมัติได้เลย.

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
