# PDF Studio

เว็บแอปเครื่องมือ PDF ที่ประมวลผลไฟล์ในเบราว์เซอร์ — เปิดไฟล์แล้ว **ลบ · จัดลำดับ · รวม · หมุน ·
ใส่เลขหน้า · ใส่ลายน้ำ · ใส่/ปลดรหัสผ่าน · แยกหน้า · ดาวน์โหลดเป็นภาพ** ได้ในแท็บเดียว

ไฟล์ PDF ไม่ถูกอัปโหลดขึ้นเซิร์ฟเวอร์ เซิร์ฟเวอร์ (Fastify + PostgreSQL) เก็บเฉพาะ
**ประวัติการใช้งาน พรีเซ็ต โควตา และลิงก์แชร์** — ตัวไฟล์จะขึ้นเซิร์ฟเวอร์ก็ต่อเมื่อผู้ใช้กด
"สร้างลิงก์แชร์" เองเท่านั้น

## เครื่องมือที่พร้อมใช้งาน

| เครื่องมือ | ทำอะไร |
| --- | --- |
| Organize | ลบหน้า, ลากสลับลำดับ, เลือกหลายหน้า (คลิก / Shift / Ctrl), undo–redo |
| Split | แยกตามช่วง `1-3, 5, 8-end` เป็นหลายไฟล์ (zip) หรือดึงหน้าที่เลือกออกมาไฟล์เดียว |
| PDF to JPG | เรนเดอร์หน้าเป็น PNG/JPG ที่ 1x/2x/3x (ทุกหน้าหรือเฉพาะที่เลือก) |
| Merge | รวมหลายไฟล์ตามลำดับที่กำหนด |
| Rotate | หมุน 90°/180°/270° ทั้งไฟล์หรือเฉพาะหน้าที่เลือก พร้อมพรีวิวบนการ์ด |
| Page numbers | เทมเพลต `{n} / {total}`, เริ่มเลข, ข้ามหน้าแรก, 9 ตำแหน่ง, ฟอนต์ Sarabun, เลขไทย |
| Watermark | ข้อความหรือรูปภาพ, ความทึบ, มุม, ปูทั้งหน้า, ขอบเขตทุกหน้า/ที่เลือก |
| Protect / Unlock | เข้ารหัส AES-256 พร้อมสิทธิ์การใช้งาน หรือปลดรหัสออกเป็นไฟล์ใหม่ |
| ประวัติ | ดูทุก run ที่เคยรัน, โควตาที่ใช้, ล้างประวัติ หรือลบข้อมูลทั้งหมด |
| พรีเซ็ต | บันทึกค่าที่ใช้บ่อยต่อเครื่องมือ (เก็บใน PostgreSQL) ใช้ซ้ำได้ในคลิกเดียว |
| ลิงก์แชร์ | อัปโหลดผลลัพธ์ขึ้นเซิร์ฟเวอร์ชั่วคราวเพื่อให้คนอื่นดาวน์โหลด (หมดอายุ 7 วัน) |
| Google sign-in | ล็อกอินด้วย Google Identity Services เพื่อใช้งานไม่จำกัด (ถ้าตั้งค่า client id) |

เครื่องมือที่ยังไม่เปิด (Compress, Crop, Redact, Compare, OCR, Office → PDF, PDF/A, Repair,
AI Summarize/Translate, Workflow) แสดงในหน้าแรกเป็น "กำลังจะมา" เพราะต้องใช้ไลบรารีหรือ
ไบนารีเพิ่มบนเซิร์ฟเวอร์ ซึ่งขัดกับแนวทาง "ไฟล์อยู่ในเครื่อง" ของโปรเจกต์นี้

## เริ่มใช้งาน

ต้องมี **Node.js 24+**, **pnpm** และ **PostgreSQL 17** ที่รันอยู่ในเครื่อง

```bash
pnpm install
cp .env.example .env          # แก้ DATABASE_URL ถ้าไม่ใช่ค่าเริ่มต้น
pnpm db:create                # สร้างฐานข้อมูล pdf_studio
pnpm db:migrate               # รัน migration ใน server/migrations
pnpm dev:all                  # Vite (5174) + API (8787) พร้อมกัน
```

เปิด http://127.0.0.1:5174 — ถ้าไม่รัน API หน้าเว็บยังใช้งานเครื่องมือในเบราว์เซอร์ได้
แต่ประวัติ/พรีเซ็ต/แชร์จะแจ้งว่าเชื่อมต่อไม่ได้

### คำสั่ง

| คำสั่ง | หน้าที่ |
| --- | --- |
| `pnpm dev` | Vite dev server (proxy `/api` → `127.0.0.1:8787`) |
| `pnpm dev:api` | API อย่างเดียว (`node --watch`, อ่าน `.env` อัตโนมัติ) |
| `pnpm dev:all` | รันทั้งสองโปรเซส ปิดตัวหนึ่งอีกตัวปิดตาม |
| `pnpm typecheck` | `tsc --noEmit` ทั้ง client และ `server/tsconfig.json` |
| `pnpm test` | Vitest ทั้ง logic ฝั่ง client และ integration test ของ API |
| `pnpm build` | typecheck + build static ลง `dist/` |
| `pnpm db:create` / `db:migrate` / `db:reset` | จัดการฐานข้อมูล dev |
| `pnpm sample` | สร้าง `public/samples/sample-12p.pdf` ใหม่ (ไว้กด "ดูไฟล์ตัวอย่าง") |

## การตั้งค่า (.env)

| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/pdf_studio` | ฐานข้อมูลหลัก |
| `TEST_DATABASE_URL` | `…/pdf_studio_test` | ฐานข้อมูลของ `pnpm test` (สร้าง/migrate อัตโนมัติ) |
| `API_PORT` / `API_HOST` | `8787` / `127.0.0.1` | ที่อยู่ของ API |
| `APP_ORIGIN` | `http://127.0.0.1:5174` | origin ที่อนุญาตสำหรับ request ที่เปลี่ยนข้อมูล |
| `GOOGLE_CLIENT_ID` | ว่าง | เปิด Google sign-in (ว่าง = ปุ่มล็อกอินถูกปิด) |
| `ANON_DAILY_LIMIT` | `3` | จำนวน run ต่อ 24 ชม. ของผู้ใช้ไม่ระบุตัวตน |
| `SHARE_MAX_BYTES` | `26214400` (25 MB) | ขนาดไฟล์สูงสุดของลิงก์แชร์ |
| `SHARE_TTL_DAYS` | `7` | อายุลิงก์แชร์ |
| `SESSION_TTL_DAYS` | `30` | อายุ session cookie |

### เปิด Google sign-in

1. สร้าง OAuth Client ID (Web application) ใน Google Cloud Console
2. เพิ่ม `http://127.0.0.1:5174` ใน **Authorized JavaScript origins**
3. ใส่ client id ใน `.env` แล้วรีสตาร์ท API
4. ปุ่ม "เข้าสู่ระบบด้วย Google" จะเปิดใช้งาน — ID token ถูกตรวจกับ JWKS ของ Google
   ฝั่งเซิร์ฟเวอร์ แล้วออก session cookie แบบ `httpOnly`

## สถาปัตยกรรม

### ฝั่งเบราว์เซอร์

- **Hash router** (`src/lib/router.ts`) — ทุกเครื่องมือมี URL ของตัวเอง (`#/rotate`,
  `#/s/<token>`) และ deploy เป็น static ได้โดยไม่ต้องมี rewrite rule
- **`WorkspaceProvider`** ถือเอกสารที่เปิดอยู่หนึ่งไฟล์ร่วมกันทุกหน้า: `entries`
  (ลำดับหน้า), `selected`, undo/redo stack, bytes ต้นฉบับ — เปิดใน Organize แล้วข้ามไป Rotate
  ต่อได้ทันทีโดยไม่ต้องเลือกไฟล์ใหม่
- **`useToolRun`** ห่อทุกการรัน: เช็กโควตา → บันทึก run (`running` → `succeeded`/`failed`) →
  เก็บผลลัพธ์ล่าสุดไว้ให้ `ShareStrip` แชร์
- **pdf.js 4.10.38** สำหรับ thumbnail/preview/แปลงเป็นภาพ, **@cantoo/pdf-lib** สำหรับ
  แก้โครงสร้างเอกสารและเข้ารหัส, **fflate** สำหรับ zip, **@dnd-kit** สำหรับลากจัดลำดับ
- ไฟล์ทำงานในหน่วยความจำเท่านั้น ไม่มี service worker และไม่มีการอัปโหลดโดยปริยาย

### ฝั่งเซิร์ฟเวอร์ (`server/`)

Fastify + `pg` (raw SQL, ไม่มี ORM) — ไม่มี dependency ของ Node ใน path ที่ต้องใช้
ไฟล์ผู้ใช้ เพราะ bytes ไปถึงเซิร์ฟเวอร์เฉพาะตอนแชร์

| ตาราง | เก็บอะไร |
| --- | --- |
| `app_user` | บัญชี Google (`sub`, email, ชื่อ, รูป) |
| `workspace` | พื้นที่ทำงานต่อเบราว์เซอร์ — เก็บ **sha256 ของ token** ไม่เก็บตัว token |
| `auth_session` | session cookie (sha256, อายุ 30 วัน) |
| `job_run` | ประวัติการรัน: เครื่องมือ, สถานะ, params, ชื่อ/ขนาด/จำนวนหน้า, ระยะเวลา |
| `preset` | พรีเซ็ตต่อ workspace + tool + ชื่อ (upsert) |
| `artifact` | ไฟล์ที่ถูกแชร์ (bytes อยู่ในตารางนี้เท่านั้น) |
| `share_link` | token, วันหมดอายุ, จำนวนดาวน์โหลด |

- ผู้ใช้ไม่ระบุตัวตนได้ workspace จากการ์ด `x-workspace-token` (สร้างใน localStorage)
  เซิร์ฟเวอร์เก็บเฉพาะ hash — ถ้าล้าง storage ก็ได้ workspace ใหม่
- ล็อกอินแล้ว workspace จะถูกผูกกับ user และโควตากลายเป็นไม่จำกัด
- request ที่เปลี่ยนข้อมูล (POST/PATCH/DELETE) ที่มี `Origin` ต้องมาจาก `APP_ORIGIN`
  (หรือ loopback คู่กัน) ไม่งั้นได้ 403
- `DELETE /api/me` ลบ workspace/user และข้อมูลที่ cascading ตามทั้งหมด
- artifact ที่ไม่มี share link เหลืออยู่จะถูกล้างเมื่อเก่ากว่า 8 วัน (ทำงานตอนสร้างลิงก์ใหม่)

### API

| Method | Path | หมายเหตุ |
| --- | --- | --- |
| `GET` | `/api/health` | เช็กว่า API + DB พร้อม |
| `POST` | `/api/bootstrap` | สร้าง/อ่าน workspace, คืน user + โควตา + สถานะ Google |
| `GET` | `/api/me` | สถานะเดิมโดยไม่สร้าง workspace |
| `POST` | `/api/auth/google` | ตรวจ ID token, ผูก workspace, ออก session cookie |
| `POST` | `/api/auth/signout` | ลบ session |
| `DELETE` | `/api/me` | ลบข้อมูลทั้งหมดของ workspace/user |
| `POST` | `/api/runs` | เริ่ม run (เช็กโควตา → 429 `quota_exceeded`) |
| `PATCH` | `/api/runs/:id` | จบ run (`succeeded` / `failed` / `canceled`) |
| `GET` | `/api/runs?limit=` | ประวัติล่าสุด |
| `DELETE` | `/api/runs` | ล้างประวัติ |
| `GET` | `/api/presets?tool=` | พรีเซ็ตของ workspace/user |
| `POST` | `/api/presets` | บันทึก/ทับพรีเซ็ตชื่อเดิม |
| `DELETE` | `/api/presets/:id` | ลบพรีเซ็ต |
| `POST` | `/api/shares` | อัปโหลดผลลัพธ์ (base64) เป็นลิงก์ชั่วคราว |
| `GET` | `/api/shares/:token` | metadata (410 เมื่อหมดอายุ) |
| `GET` | `/api/shares/:token/file` | ดาวน์โหลดไฟล์ (นับจำนวนครั้ง) |
| `DELETE` | `/api/shares/:token` | ยกเลิกลิงก์ |

## การทดสอบ

```bash
pnpm test        # ต้องมี PostgreSQL รันอยู่ — จะสร้าง pdf_studio_test ให้เอง
pnpm typecheck
```

- `tests/` — logic ฝั่ง client: ช่วงหน้า, session reducer, undo/redo, ชื่อไฟล์/zip,
  merge, rotate, page numbers (ฝังฟอนต์ไทย), watermark, protect/unlock, paint
- `server/tests/` — integration ผ่าน `app.inject()` บน PostgreSQL จริง: migration,
  bootstrap/quota, Google flow (verifier ปลอม), runs, presets, shares (หมดอายุ, ขนาด,
  Origin guard, การแยกข้อมูลระหว่าง workspace)
- ไฟล์ทดสอบของ server ใช้ฐานข้อมูลร่วมกัน จึงตั้ง `fileParallelism: false`

การตรวจด้วยเบราว์เซอร์จริง: เปิดตัวอย่าง → ลบหน้า → ดาวน์โหลด → ตรวจไฟล์ผลลัพธ์ด้วย pdf-lib
(จำนวนหน้า/มุมหมุน/ข้อความ) และทดสอบลิงก์แชร์ด้วยการดาวน์โหลดผ่าน `/api/shares/:token/file`

## ข้อจำกัดที่รู้อยู่

- **ไม่แก้เนื้อหาในหน้า** — ทำงานระดับโครงสร้างหน้า/เลเยอร์ทับ (เลขหน้า, ลายน้ำ) เท่านั้น
- bookmark, outline, ฟอร์ม และไฟล์แนบระดับเอกสารอาจหายเมื่อสร้างไฟล์ใหม่ (เนื้อหาหน้าครบ)
- ลายเซ็นดิจิทัลจะถูกยกเลิกเมื่อบันทึกไฟล์ใหม่
- สิทธิ์การใช้งานในไฟล์ที่เข้ารหัสเป็น "คำขอ" ต่อโปรแกรมอ่าน ไม่ใช่การบังคับ — รหัสผ่านคือส่วนป้องกันจริง
- `Protect` ใช้ AES-256 ของ pdf-lib; `Unlock` ต้องรู้รหัสผ่านเดิม และจะสร้างไฟล์ใหม่ที่ไม่มีรหัส
- เอกสารหลักพันหน้ายังสร้าง DOM ต่อการ์ดทุกหน้า (thumbnail เป็น lazy แต่ยังไม่มี virtualization)
- ภาพที่ export เป็น raster: ค้นหา/คัดลอกข้อความไม่ได้ และ 3x บนเอกสารยาวกิน RAM พอสมควร
- โควตานับทุก run ที่เริ่มแล้ว (รวมที่ล้มเหลว/ถูกยกเลิก) ในหน้าต่าง 24 ชม. แบบเลื่อน; ลิงก์แชร์ไม่กินโควตา
- ยังไม่มี rate limit ระดับ IP, CSRF token (ใช้ SameSite=Lax + Origin guard) และยังไม่มี
  ระบบลบ artifact ทันทีเมื่อผู้ใช้ยกเลิกลิงก์ (จะถูกเก็บกวาดตามรอบ)
