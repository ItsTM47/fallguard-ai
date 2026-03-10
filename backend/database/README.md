# Database (PostgreSQL)

โฟลเดอร์นี้เก็บ schema และ logic สำหรับบันทึกข้อมูลจาก relay ลง PostgreSQL แบบ minimal

## ไฟล์หลัก

- `schema.sql` โครงสร้างตารางทั้งหมด
- `connection.mjs` การเชื่อมต่อ DB (`pg` pool)
- `init.mjs` apply schema อัตโนมัติเมื่อ relay start
- `migrate.mjs` สั่ง apply schema แบบ manual
- `eventStore.mjs` เขียน event/webhook/LINE/MLflow/audit ลง DB

## ตารางที่เก็บข้อมูล (จำเป็นเท่านั้น)

- `event_records` เหตุการณ์หลัก (เวลา, คน, สถานที่, confidence, message, metadata)
- `event_images` ภาพของเหตุการณ์ (ชื่อไฟล์, path, hash, size)
- `alert_deliveries` ผลการส่งแจ้งเตือน LINE (success/status/error/latency/payload)

## วิธีใช้งาน

1. ตั้งค่า `.env.local`
   - `DATABASE_ENABLED=true`
   - `DATABASE_URL=postgresql://...`
2. รัน migration
   - `npm run db:migrate`
3. หรือรัน relay ตามปกติ
   - relay จะ apply `schema.sql` ให้อัตโนมัติผ่าน `init.mjs`
