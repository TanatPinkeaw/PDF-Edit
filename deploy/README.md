# Deploy บน HomeLab (Docker Compose + Nginx)

Stack นี้รัน 3 บริการ: `web` (Nginx เสิร์ฟ SPA + proxy `/api`), `api` (Fastify) และ `db` (PostgreSQL 17)

## เริ่มครั้งแรก

```bash
cp deploy/.env.deploy.example deploy/.env.deploy
# แก้ POSTGRES_PASSWORD และ APP_ORIGIN ให้ตรงโดเมนจริง

docker compose -f deploy/docker-compose.yml --env-file deploy/.env.deploy up -d --build

# สร้างตาราง (รันซ้ำได้ ไม่มีผลข้างเคียง)
docker compose -f deploy/docker-compose.yml exec api node server/src/db/migrate.ts
```

เปิด `http://<homelab-ip>:8080` — ตรวจว่า `/api/health` ตอบ `{"ok":true,"db":"up"}`

## อัปเดตเวอร์ชัน

```bash
git pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.deploy up -d --build
```

## ทำไมต้องมี nginx.conf ของเราเอง

`pdfjs-dist` ในโปรเจกต์นี้ถูกบันเดิลผ่าน Vite worker pipeline จนออกมาเป็น `.js`
โดยตั้งใจ — ก่อนหน้านี้มันถูกเสิร์ฟเป็น `.mjs` และ Nginx มาตรฐานไม่มี MIME ของ `.mjs`
ใน `mime.types` ทำให้เบราว์เซอร์ปฏิเสธ module worker แล้วหน้าตัวอย่าง PDF ทุกหน้าขึ้น
"แสดงตัวอย่างไม่ได้"

`deploy/nginx.conf` จึงทำสองอย่าง:
- เติม `application/javascript mjs`
- ตั้ง CSP ที่มี `worker-src 'self' blob:` และ `script-src 'self'`

ถ้าใช้ reverse proxy อีกชั้น (Traefik / Caddy) ต้องส่ง header พวกนี้ต่อ และห้ามแก้
`Content-Security-Policy` จนตัด `worker-src` ออก

## ตรวจสอบว่าติดตั้งถูก

1. เปิด `#/diagnostics` บนโดเมนจริง — ทุกข้อต้องเขียว
2. อัปโหลด PDF แล้วเห็นภาพหน้าครบ (ไม่ใช่ "แสดงตัวอย่างไม่ได้")
3. ปิด API (`docker compose stop api`) แล้วเปิดหน้าเว็บใหม่ — เครื่องมือยังใช้ได้
   และป้ายโควตาขึ้นว่าเชื่อมต่อไม่ได้

## Backup / กู้คืน

```bash
# สำรอง
docker compose -f deploy/docker-compose.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%F).sql

# กู้คืน
cat backup-2026-01-31.sql | docker compose -f deploy/docker-compose.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

ตั้ง cron บน HomeLab ทำ `pg_dump` รายวันและเก็บ 14 วัน

## หมายเหตุ

- ไฟล์ PDF ไม่เคยถูกส่งเข้า container เหล่านี้ — ประมวลผลในเบราว์เซอร์ทั้งหมด
  ฐานข้อมูลเก็บเฉพาะ metadata ของงาน, โควตา และลิงก์แชร์
- ถ้าจะเปิด Word ↔ PDF ต้องเพิ่มบริการแปลงไฟล์ (LibreOffice) ตามที่ระบุใน README หลัก
