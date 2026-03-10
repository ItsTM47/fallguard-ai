# Database (PostgreSQL)

โฟลเดอร์นี้เก็บ schema และ logic สำหรับบันทึกข้อมูลจาก relay ลง PostgreSQL

## ไฟล์หลัก

- `schema.sql` โครงสร้างตารางทั้งหมด
- `connection.mjs` การเชื่อมต่อ DB (`pg` pool)
- `init.mjs` apply schema อัตโนมัติเมื่อ relay start
- `migrate.mjs` สั่ง apply schema แบบ manual
- `eventStore.mjs` เขียน event/webhook/LINE/MLflow/audit ลง DB

## ตารางที่เก็บข้อมูล

- `sites` ข้อมูลองค์กร/สถานที่
- `cameras` กล้องหรือจุดติดตั้ง
- `person_profiles` โปรไฟล์บุคคลที่ระบบระบุได้ (`personId`/`personLabel`)
- `notification_targets` เป้าหมายแจ้งเตือน (เช่น LINE user)
- `event_records` เหตุการณ์หลัก (ล้ม/near_fall/test/manual/webhook)
- `event_images` ไฟล์ภาพของเหตุการณ์ (ชื่อไฟล์, path, hash, size)
- `alert_deliveries` ผลการส่งแจ้งเตือนแต่ละครั้ง (success/status/latency/response)
- `mlflow_run_logs` ความเชื่อมโยงกับ MLflow run + metrics/params/tags
- `relay_audit_logs` request-level audit log
- `system_settings` ค่าคอนฟิกที่ต้องเก็บใน DB

## วิธีใช้งาน

1. ตั้งค่า `.env.local`
   - `DATABASE_ENABLED=true`
   - `DATABASE_URL=postgresql://...`
2. รัน migration
   - `npm run db:migrate`
3. หรือรัน relay ตามปกติ
   - relay จะ apply `schema.sql` ให้อัตโนมัติผ่าน `init.mjs`
