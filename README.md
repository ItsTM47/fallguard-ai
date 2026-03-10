# FallGuard AI

ระบบเฝ้าระวังการล้มแบบ real-time พร้อมแจ้งเตือน LINE, เก็บเหตุการณ์ลง PostgreSQL, และบันทึก telemetry ลง MLflow

## สถาปัตยกรรมระบบ

- `frontend/` เว็บแอป (React + Vite)
- `backend/api/` relay API สำหรับ webhook, events, analytics และ image route
- `backend/database/` schema + migrate + event store
- `ai_service/` container สำหรับ MLflow server
- `docker/pgadmin/servers.json` ค่า pre-load server สำหรับ pgAdmin
- `docker-compose.yml` stack สำหรับ web + relay + postgres + pgadmin + mlflow

Data flow:

1. Frontend ส่ง event ไป `relay` (`/line-webhook`)
2. Relay ส่ง LINE push message (text/image)
3. Relay บันทึกเหตุการณ์ลง Postgres (`event_records`, `event_images`, `alert_deliveries`)
4. Relay log metadata/metrics ไป MLflow
5. Frontend ดึง timeline/calendar จาก `GET /api/events`

## Tech Stack

- Frontend: React 19, TypeScript, Vite
- Backend Relay: Node.js (native HTTP), `pg`
- Database: PostgreSQL 16
- DB GUI: pgAdmin 4
- Experiment Tracking: MLflow
- Reverse Proxy/HTTPS (cloud): Caddy (optional, manual setup)
- Container: Docker Compose

## เริ่มต้นใช้งาน (Local)

### 1) เตรียม environment

```bash
cp .env.relay.example .env.local
```

ค่าอย่างน้อยที่ต้องใส่ใน `.env.local`:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_TARGET_USER_ID`
- (แนะนำ) `LINE_RELAY_SECRET` และตั้ง `VITE_LINE_RELAY_SECRET` ให้ตรงกัน
- ถ้าต้องการส่งรูปไป LINE: `LINE_PUBLIC_BASE_URL` ต้องเป็น URL `https` ที่เข้าถึงได้จากภายนอก

### 2) รันด้วย Docker (แนะนำ)

```bash
docker compose up --build -d
```

Endpoints:

- Web UI: `http://localhost:5173`
- Relay Health: `http://localhost:8787/health`
- MLflow: `http://localhost:5001`
- pgAdmin: `http://localhost:5050`
- Postgres: `localhost:5432`

หยุดระบบ:

```bash
docker compose down
```

ดู log:

```bash
docker compose logs -f --tail=200
```

### 3) รันแบบ dev เฉพาะ frontend/relay

```bash
npm install
npm run dev:relay
npm run dev
```

รันชุด dev แบบรวม:

```bash
npm run dev:all
```

## ตั้งค่า LINE ในหน้าเว็บ

ในหน้า Settings:

- เลือกโหมด `Webhook`
- ตั้ง URL เป็น `/line-webhook` หรือ `${VITE_LINE_WEBHOOK_URL}`
- กดทดสอบแจ้งเตือน

หมายเหตุ:

- การยิง LINE Messaging API ตรงจาก browser จะติด CORS ในเครื่องผู้ใช้อื่น
- โหมดที่ถูกต้องสำหรับ deploy คือให้ browser ยิงเข้า relay เท่านั้น

## PostgreSQL และ pgAdmin

Relay จะบันทึกข้อมูลอัตโนมัติเมื่อมีการเรียก `/line-webhook`

ตารางหลัก:

- `event_records`
- `event_images`
- `alert_deliveries`

### pgAdmin login

- URL: `http://localhost:5050`
- Email: `admin@admin.com`
- Password: `admin`

pgAdmin จะ pre-load server ชื่อ `fallguard-postgres` ให้อัตโนมัติ (host: `postgres`)

ถ้าไม่เห็น server ให้ import ซ้ำ:

```bash
docker compose exec pgadmin sh -lc '/venv/bin/python3 /pgadmin4/setup.py load-servers /pgadmin4/servers.json --user "$PGADMIN_DEFAULT_EMAIL"'
```

### Query แนะนำสำหรับดูข้อมูลล่าสุด

```sql
SELECT id, event_type, person_label, location_name, confidence_pct, occurred_at, created_at
FROM public.event_records_latest
LIMIT 20;
```

`event_records_latest` เป็น view ที่เรียงตามเวลาล่าสุดอยู่แล้ว

## Migration

รัน migration:

```bash
npm run db:migrate
```

หรือใน Docker:

```bash
docker compose exec relay node backend/database/migrate.mjs
```

ถ้าเจอ `deadlock detected` ตอน migrate:

```bash
docker compose stop relay
docker compose run --rm relay node backend/database/migrate.mjs
docker compose up -d relay
```

โค้ดปัจจุบันเพิ่ม advisory lock แล้ว เพื่อลดโอกาสชนกันระหว่าง startup migration กับ manual migration

## การ Deploy บน Cloud (แบบ Manual)

แนวทางที่ใช้อยู่ในโปรเจกต์:

1. เตรียม VM (Docker + Compose)
2. `git pull` โค้ดล่าสุด
3. รัน `docker compose up -d --build`
4. เปิด firewall ตามพอร์ตที่ใช้ (`80/443`, `8787`, `5001`, `5050` ตามความจำเป็น)
5. ถ้าต้องการ HTTPS ใช้ reverse proxy (เช่น Caddy) หน้า web/relay

หมายเหตุสำคัญ:

- การใช้งานจากเครื่องอื่นต้องไม่อิง `localhost:8787` ใน frontend build
- ใช้ URL relay แบบ public domain/IP เท่านั้น

## MLflow

MLflow รันใน service `mlflow` โดย default:

- Port `5001`
- Backend store: `sqlite:////mlflow/mlflow.db` (ใน volume `mlflow-data`)

ตัวอย่างเช็ก run ผ่าน API:

```bash
curl -s -X POST http://localhost:5001/api/2.0/mlflow/runs/search \
  -H 'Content-Type: application/json' \
  --data '{"experiment_ids":["1"],"max_results":5}'
```

## สคริปต์ที่ใช้บ่อย

- `npm run dev`
- `npm run dev:relay`
- `npm run dev:all`
- `npm run dev:all:with-mlflow`
- `npm run dev:stop`
- `npm run db:migrate`
- `npm run docker:up`
- `npm run docker:down`
- `npm run docker:logs`
- `npm run clean`
- `npm run clean:all`

## Security/Privacy Notes

- อย่า commit ไฟล์ `.env.local`
- เก็บ `LINE_CHANNEL_ACCESS_TOKEN` และ `LLM_API_KEY` เป็นความลับ
- production ควรตั้งค่า `MLFLOW_ALLOWED_HOSTS` และ `MLFLOW_CORS_ALLOWED_ORIGINS` แบบ strict
- จำกัดการเปิดพอร์ตสาธารณะเฉพาะที่จำเป็น

## Troubleshooting เร็วๆ

1. pgAdmin ไม่มีข้อมูลใหม่:
`ORDER BY id` ไม่ใช่เวลาจริง ให้ใช้ `event_records_latest` หรือ `ORDER BY occurred_at DESC`

2. เวลาใน DB เป็น UTC:
ระบบจัดเก็บ `timestamptz` ปกติ สามารถตั้ง session เป็น `Asia/Bangkok` ใน pgAdmin ได้

3. เปิด MLflow แล้ว `403 Invalid Host header`:
ตรวจค่า `MLFLOW_ALLOWED_HOSTS` และ CORS ใน compose/env

4. LINE ส่งรูปไม่ขึ้น:
ตรวจ `LINE_PUBLIC_BASE_URL` ต้องเป็น `https` และไฟล์ใน `/images/<filename>` ต้องเข้าถึงได้จริง
