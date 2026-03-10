# FallGuard AI - Setup Guide

คู่มือนี้เป็นขั้นตอนตั้งค่าระบบตั้งแต่เริ่มต้นจนพร้อมใช้งานจริง ทั้งแบบ Local และ Cloud

## 1) Prerequisites

- Git
- Docker + Docker Compose
- Node.js 20+ (กรณีรัน dev แบบไม่ใช้ Docker)
- บัญชี LINE Messaging API (มี Channel Access Token + Target User ID)

## 2) Clone และตั้งค่า Environment

```bash
git clone <YOUR_REPO_URL>
cd fallguard-ai
cp .env.relay.example .env.local
```

แก้ไฟล์ `.env.local` อย่างน้อย:

- `LINE_CHANNEL_ACCESS_TOKEN=...`
- `LINE_TARGET_USER_ID=...`
- `DATABASE_ENABLED=true`
- `DOCKER_DATABASE_URL=postgresql://fallguard:fallguard@postgres:5432/fallguard`

ถ้าต้องการส่งรูปไป LINE:

- `LINE_PUBLIC_BASE_URL=https://<your-domain-or-sslip>`

## 3) Run Local (Docker)

```bash
docker compose up --build -d
```

ตรวจสถานะ:

```bash
docker compose ps
curl -s http://localhost:8787/health
```

บริการหลัก:

- Web: `http://localhost:5173`
- Relay: `http://localhost:8787`
- MLflow: `http://localhost:5001`
- pgAdmin: `http://localhost:5050`

## 4) ตั้งค่าในหน้าเว็บ (สำคัญ)

ในหน้า Settings:

1. เลือกแท็บ `Webhook`
2. ตั้ง `Webhook URL` เป็น `/line-webhook` หรือ URL relay ที่เข้าถึงได้จริง
3. Save แล้วกดทดสอบแจ้งเตือน

หมายเหตุ:

- ถ้าเปิดเว็บจากโดเมนภายนอก ควรใช้ Webhook เท่านั้น
- หลีกเลี่ยงยิง LINE API ตรงจาก browser เพราะ CORS และความปลอดภัยของ token

## 5) Cloud Deployment (VM + Docker Compose)

บน VM:

```bash
cd ~/fallguard-ai
git pull origin main
docker compose up -d --build
```

ตรวจ:

```bash
docker compose ps
curl -s http://localhost:8787/health
```

ถ้าเปิดใช้งาน public HTTPS แบบเร็ว:

- ใช้ `https://<EXTERNAL-IP>.sslip.io`
- ตั้ง `LINE_PUBLIC_BASE_URL` ให้เป็นโดเมนเดียวกัน

## 6) PostgreSQL + pgAdmin

เข้า pgAdmin:

- URL: `http://<HOST>:5050`
- user: `admin@admin.com`
- password: `admin`

ถ้าไม่เห็น server `fallguard-postgres` ให้ import:

```bash
docker compose exec pgadmin sh -lc '/venv/bin/python3 /pgadmin4/setup.py load-servers /pgadmin4/servers.json --user "$PGADMIN_DEFAULT_EMAIL"'
```

เช็กข้อมูลล่าสุด:

```sql
SELECT id, event_type, person_label, occurred_at, created_at
FROM public.event_records_latest
LIMIT 20;
```

## 7) MLflow

เข้า:

- `http://<HOST>:5001`

ตรวจ run ผ่าน API:

```bash
curl -s -X POST http://localhost:5001/api/2.0/mlflow/runs/search \
  -H 'Content-Type: application/json' \
  --data '{"experiment_ids":["1"],"max_results":5}'
```

## 8) Migration / Schema Update

รัน migration:

```bash
docker compose exec relay node backend/database/migrate.mjs
```

ถ้าเจอ deadlock:

```bash
docker compose stop relay
docker compose run --rm relay node backend/database/migrate.mjs
docker compose up -d relay
```

## 9) End-to-End Test

ยิง test event:

```bash
curl -i -X POST https://<YOUR_DOMAIN>/line-webhook \
  -H 'Content-Type: application/json' \
  --data '{"message":"demo alert","metadata":{"eventType":"test_alert","location":"บ้าน","personLabel":"บุคคล 1","confidence":88}}'
```

ตรวจครบ 3 จุด:

1. LINE ได้ข้อความ
2. Postgres มีแถวใหม่ (`event_records_latest`)
3. MLflow มี run ใหม่

## 10) Troubleshooting (Quick)

- `LINE API กดไม่ได้/ส่งไม่ได้`:
  ใช้ Webhook mode

- `ERR_CONNECTION_REFUSED localhost:8787` จากเครื่องอื่น:
  frontend ยังชี้ localhost ให้ deploy build ใหม่และใช้ URL public

- `MLflow 403 Invalid Host header`:
  ตรวจ `MLFLOW_ALLOWED_HOSTS`, `MLFLOW_CORS_ALLOWED_ORIGINS`

- `no space left on device` ตอน build:
  ```bash
  docker builder prune -af
  docker image prune -af
  ```
  แล้ว build เฉพาะ service ที่ต้องใช้

- `event_records_latest does not exist`:
  รัน migration ก่อน

## 11) Security Checklist

- ห้าม commit `.env.local`
- หมุน token ทันทีหากเผลอเผยแพร่
- production ควรจำกัด firewall เฉพาะพอร์ตที่จำเป็น
- production ควรใช้ HTTPS และตั้งค่าค่า CORS/Allowed Hosts แบบ strict
