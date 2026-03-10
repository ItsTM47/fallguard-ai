# FallGuard AI - Setup Guide (Step-by-Step)

คู่มือนี้เขียนแบบพาทำจริง ตั้งแต่ clone repo, ตั้งค่า env, เปิดระบบ, ผูก LINE, ตรวจ DB/MLflow และ deploy ขึ้น Cloud VM

## 0) คู่มือนี้ครอบคลุมอะไร

- Local development ด้วย Docker Compose
- Cloud deployment แบบ manual (VM + Docker Compose)
- การเชื่อม LINE ผ่าน relay (`/line-webhook`)
- การตรวจว่าข้อมูลเข้า PostgreSQL, pgAdmin, MLflow ครบ
- วิธีแก้ปัญหาที่เจอบ่อยในการเดโมจริง

## 1) Prerequisites

### 1.1 เครื่อง Local

- Git
- Docker Desktop (หรือ Docker Engine + Compose plugin)
- (ทางเลือก) Node.js 20+ ถ้าจะรันแบบ non-Docker

ตรวจเวอร์ชัน:

```bash
git --version
docker --version
docker compose version
```

### 1.2 บัญชี LINE Messaging API

ต้องมีอย่างน้อย:
- `LINE_CHANNEL_ACCESS_TOKEN` (long-lived token)
- `LINE_TARGET_USER_ID` (ผู้รับที่ต้องการ push)

## 2) Clone Project

```bash
git clone <YOUR_REPO_URL>
cd fallguard-ai
```

ถ้าทีมกำหนด branch เฉพาะ ให้ checkout ก่อน:

```bash
git checkout main
```

## 3) เตรียม Environment (.env.local)

สร้างไฟล์จาก template:

```bash
cp .env.relay.example .env.local
```

### 3.1 ค่าขั้นต่ำที่ต้องแก้

```env
LINE_CHANNEL_ACCESS_TOKEN=YOUR_LINE_CHANNEL_ACCESS_TOKEN
LINE_TARGET_USER_ID=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_ENABLED=true
```

### 3.2 ค่าที่แนะนำสำหรับใช้งานจริง

```env
LINE_RELAY_SECRET=your-secret
VITE_LINE_RELAY_SECRET=your-secret
MLFLOW_EXPERIMENT_NAME=fallguard-alerts
LLM_TIMEZONE=Asia/Bangkok
```

### 3.3 ถ้าต้องการส่ง "รูปภาพ" ไป LINE

ตั้ง `LINE_PUBLIC_BASE_URL` เป็น URL สาธารณะที่เข้ารูปได้จริง (ต้องเป็น `https`):

```env
LINE_PUBLIC_BASE_URL=https://34-142-149-101.sslip.io
```

ทดสอบ URL รูปหลังระบบรันแล้ว:

```bash
curl -I https://34-142-149-101.sslip.io/images/<filename>.jpg
```

## 4) รันระบบ Local ด้วย Docker

```bash
docker compose up --build -d
```

ดูสถานะ:

```bash
docker compose ps
```

ควรเห็น services หลัก:
- `web`
- `relay`
- `postgres`
- `pgadmin`
- `mlflow`

## 5) ตรวจความพร้อมบริการ (Health Check)

```bash
curl -s http://localhost:8787/health
```

ควรได้ JSON ลักษณะนี้:

```json
{
  "success": true,
  "message": "ok",
  "databaseEnabled": true,
  "databaseInitialized": true,
  "mlflowEnabled": true
}
```

เปิดหน้าเว็บ:
- Web: `http://localhost:5173`
- pgAdmin: `http://localhost:5050`
- MLflow: `http://localhost:5001`

## 6) ตั้งค่า Web UI ให้ใช้งานได้จริง

เข้าเว็บ > `Settings`:

1. เลือกแท็บ `Webhook`
2. ตั้ง `Webhook URL` เป็น `/line-webhook` (แนะนำ)
3. กด Save
4. เปิด `Auto notify`

หมายเหตุ:
- สำหรับ cloud/demo จากหลายเครื่อง ให้ใช้โหมด Webhook ผ่าน relay เท่านั้น
- ไม่ควรเรียก LINE Messaging API ตรงจาก browser (จะเจอ CORS)

## 7) ทดสอบ End-to-End (ข้อความ + บันทึก DB + MLflow)

### 7.1 ยิง test event ด้วย curl

```bash
curl -i -X POST http://localhost:8787/line-webhook \
  -H 'Content-Type: application/json' \
  --data '{"message":"test from setup guide","metadata":{"eventType":"test_alert","location":"บ้าน","personLabel":"บุคคล 1","confidence":88}}'
```

ถ้าสำเร็จควรได้ `HTTP 200` และ:

```json
{"success":true,"message":"Message sent to LINE successfully"}
```

### 7.2 เช็กข้อมูลเหตุการณ์ผ่าน API

```bash
curl -s "http://localhost:8787/api/events?limit=3"
```

### 7.3 เช็กข้อมูลใน PostgreSQL (CLI)

```bash
docker exec -i fallguard-ai-postgres-1 psql -U fallguard -d fallguard -c "select count(*) from event_records;"
```

ดูแถวล่าสุด:

```bash
docker exec -i fallguard-ai-postgres-1 psql -U fallguard -d fallguard -c "select id,event_type,occurred_at,created_at,line_status_code,image_public_url from event_records_latest limit 10;"
```

### 7.4 เช็กข้อมูลใน MLflow API

```bash
curl -s -X POST http://localhost:5001/api/2.0/mlflow/runs/search \
  -H 'Content-Type: application/json' \
  --data '{"experiment_ids":["1"],"max_results":5}'
```

## 8) ใช้งาน pgAdmin ให้เห็น DB ทันที

### 8.1 Login

- URL: `http://localhost:5050`
- Email: `admin@admin.com`
- Password: `admin`

### 8.2 ถ้าไม่เห็น server `fallguard-postgres`

```bash
docker compose exec pgadmin sh -lc '/venv/bin/python3 /pgadmin4/setup.py load-servers /pgadmin4/servers.json --user "$PGADMIN_DEFAULT_EMAIL"'
```

### 8.3 Query ที่แนะนำ

ใช้ view `event_records_latest` เพื่อดูข้อมูลล่าสุด (หลีกเลี่ยง `ORDER BY id`):

```sql
SELECT id, event_type, person_label, location_name, confidence_pct, occurred_at, created_at
FROM public.event_records_latest
LIMIT 50;
```

## 9) Deploy ขึ้น Cloud VM (Manual)

ส่วนนี้คือ flow จริงที่ใช้บ่อย: Git pull + Docker compose + reverse proxy

### 9.1 เตรียม VM

บน Ubuntu VM:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Logout/Login ใหม่ 1 รอบเพื่อให้กลุ่ม docker มีผล

### 9.2 Clone และตั้งค่า env บน VM

```bash
git clone <YOUR_REPO_URL>
cd fallguard-ai
cp .env.relay.example .env.local
```

แก้ `.env.local` อย่างน้อย:

```env
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_TARGET_USER_ID=...
DATABASE_ENABLED=true
DOCKER_DATABASE_URL=postgresql://fallguard:fallguard@postgres:5432/fallguard
```

ถ้าใช้ URL สาธารณะเดียว เช่น `https://34-142-149-101.sslip.io`:

```env
LINE_PUBLIC_BASE_URL=https://34-142-149-101.sslip.io
VITE_LINE_WEBHOOK_URL=https://34-142-149-101.sslip.io/line-webhook
VITE_LLM_ANALYTICS_URL=https://34-142-149-101.sslip.io/analytics/insight
```

### 9.3 Build และรันบน VM

```bash
docker compose up -d --build
```

หรือถ้าจะ build เฉพาะ web หลังแก้ค่า `VITE_*`:

```bash
docker compose up -d --build web
```

### 9.4 เช็กจาก VM

```bash
docker compose ps
curl -s http://localhost:8787/health
curl -s http://localhost:8787/api/events?limit=3
```

## 10) ตั้ง HTTPS ด้วย Caddy (Optional แต่แนะนำ)

ถ้าต้องการให้เว็บ/relay เข้าด้วย HTTPS:

1. ให้ web ไปอยู่พอร์ตภายใน เช่น `8080`
2. ให้ Caddy ฟัง `80/443` และ reverse proxy

ตัวอย่าง Caddyfile:

```caddy
34-142-149-101.sslip.io {
  @relay path /line-webhook* /api/line-webhook* /analytics/insight* /api/analytics/insight* /health* /api/events* /events* /images*
  handle @relay {
    reverse_proxy 127.0.0.1:8787
  }
  handle {
    reverse_proxy 127.0.0.1:8080
  }
}
```

หลังแก้ Caddyfile:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

## 11) Smoke Test หลัง Deploy

รันจากเครื่องภายนอก VM:

```bash
curl -I https://34-142-149-101.sslip.io
curl -s https://34-142-149-101.sslip.io/health
curl -s "https://34-142-149-101.sslip.io/api/events?limit=3"
```

ทดสอบ webhook ผ่าน public URL:

```bash
curl -i -X POST https://34-142-149-101.sslip.io/line-webhook \
  -H 'Content-Type: application/json' \
  --data '{"message":"public test","metadata":{"eventType":"test_alert"}}'
```

## 12) Troubleshooting (ปัญหาจริงที่เจอบ่อย)

### 12.1 ฝั่งเพื่อนเปิดเว็บแล้ว error `localhost:8787 ... ERR_CONNECTION_REFUSED`

สาเหตุ:
- frontend ถูก build ด้วยค่า `VITE_*` เป็น localhost

วิธีแก้:
1. ตั้งค่า `VITE_LINE_WEBHOOK_URL` และ `VITE_LLM_ANALYTICS_URL` เป็น public URL
2. build web ใหม่

```bash
docker compose up -d --build web
```

### 12.2 LINE ส่งไม่ออก (401 Authentication failed)

ตรวจ:
- `LINE_CHANNEL_ACCESS_TOKEN` ถูกต้อง/ยังไม่หมดอายุ
- `LINE_TARGET_USER_ID` ถูกคน
- relay รับค่าจริงหรือไม่:

```bash
docker compose exec relay sh -lc 'printenv LINE_CHANNEL_ACCESS_TOKEN | wc -c'
```

### 12.3 MLflow หน้า UI ขึ้น Request error / 403 Invalid Host header

สาเหตุหลัก:
- ค่า `MLFLOW_ALLOWED_HOSTS` หรือ CORS ไม่ตรงกับ host ที่เรียกจริง

แก้เบื้องต้น (demo mode):

```env
MLFLOW_ALLOWED_HOSTS=*
MLFLOW_CORS_ALLOWED_ORIGINS=*
MLFLOW_DISABLE_SECURITY_MIDDLEWARE=true
MLFLOW_WORKERS=1
```

แล้ว restart:

```bash
docker compose up -d --build mlflow
```

### 12.4 รูปไม่ขึ้นใน LINE

ตรวจทีละข้อ:
1. `LINE_PUBLIC_BASE_URL` เป็น `https` และเข้าถึงจากภายนอก
2. URL รูปต้องเปิดได้จริง (`HTTP 200`)
3. ใน DB (`event_records`) มี `image_public_url`

### 12.5 pgAdmin เหมือนข้อมูลไม่เข้า

สาเหตุ:
- query แบบ `ORDER BY id ASC` ทำให้เห็นข้อมูลเก่าก่อน

แก้:
- ใช้ `event_records_latest` หรือ `ORDER BY occurred_at DESC`

### 12.6 `event_records_latest does not exist`

ให้รัน migration:

```bash
docker compose exec relay node backend/database/migrate.mjs
```

### 12.7 `deadlock detected` ตอน migrate

```bash
docker compose stop relay
docker compose run --rm relay node backend/database/migrate.mjs
docker compose up -d relay
```

### 12.8 Build ล้มเพราะ `no space left on device`

```bash
docker builder prune -af
docker image prune -af
docker system df
```

ถ้ายังไม่พอ ให้เพิ่ม disk VM แล้วค่อย build ใหม่

## 13) คำสั่งดูแลระบบประจำวัน

```bash
# ดูสถานะ

docker compose ps

# ดู log รวม

docker compose logs -f --tail=200

# restart เฉพาะบริการ

docker compose restart relay

# update จาก Git และ deploy ใหม่

git pull origin main
docker compose up -d --build
```

## 14) Security & Privacy Checklist

- ห้าม commit `.env.local`
- อย่าเก็บ token ใน frontend code
- จำกัดพอร์ตที่เปิด public เท่าที่จำเป็น
- ถ้าใช้งาน production จริง ควร:
  - จำกัด `MLFLOW_ALLOWED_HOSTS` เป็นโดเมนจริง
  - จำกัด `MLFLOW_CORS_ALLOWED_ORIGINS`
  - ใช้ HTTPS ทุก endpoint ที่รับ webhook/public API

## 15) Demo Script (5-6 นาที)

ใช้สคริปต์นี้ตอน present ได้เลย:

1. (30 วินาที) เปิดหน้าเว็บ + อธิบายระบบ
2. (30 วินาที) เข้า Settings > Webhook URL เป็น `/line-webhook` และเปิด Auto notify
3. (60 วินาที) เปิดกล้อง/trigger fall detection ให้เกิด 1 เหตุการณ์
4. (30 วินาที) โชว์ LINE ว่ามี alert เข้า (ข้อความ + รูป)
5. (60 วินาที) โชว์หน้า history/calendar บนเว็บว่ามี event ล่าสุด
6. (60 วินาที) โชว์ pgAdmin ตาราง `event_records_latest`
7. (60 วินาที) โชว์ MLflow runs ของ event ล่าสุด

จบด้วยคำสรุป:
- แจ้งเตือนเข้า LINE สำเร็จ
- ข้อมูลเข้า Postgres สำเร็จ
- มี trace/run ใน MLflow สำเร็จ
