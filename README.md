# PDF Studio

เว็บแอปเครื่องมือ PDF ที่ประมวลผลไฟล์ในเบราว์เซอร์ — เปิดไฟล์แล้ว **ลบ · จัดลำดับ · รวม · หมุน ·
ใส่เลขหน้า · ใส่ลายน้ำ · ใส่/ปลดรหัสผ่าน · แยกหน้า · ดาวน์โหลดเป็นภาพ** ได้ในแท็บเดียว

ไฟล์ PDF ไม่ถูกอัปโหลดขึ้นเซิร์ฟเวอร์ เซิร์ฟเวอร์ (Fastify + PostgreSQL) เก็บเฉพาะ
**บัญชี ประวัติการใช้งาน พรีเซ็ต และลิงก์แชร์** — ตัวไฟล์จะขึ้นเซิร์ฟเวอร์ก็ต่อเมื่อผู้ใช้กด
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
| JPG to PDF | รวมภาพ PNG/JPG เป็น PDF, ขนาดหน้าตามภาพ/A4/Letter, ระยะขอบ, เรียงลำดับก่อนสร้าง |
| Sign | วางลายเซ็น PNG ได้หลายอัน (อัปโหลดหรือวางจากคลิปบอร์ด) ลากจัดตำแหน่งอิสระบนหน้า และกำหนดช่วงหน้าเป็นรายลายเซ็น |
| Crop | ครอปขอบทั้ง 4 ด้านแบบ % พร้อมไกด์บนหน้า และใช้กับทุกหน้า |
| Compress | เรนเดอร์หน้าใหม่ที่ 3 ระดับคุณภาพ พร้อมรายงานขนาดก่อน/หลัง |
| Word to PDF / PDF to Word | แปลงผ่าน LibreOffice บนเซิร์ฟเวอร์ของคุณ (`/api/convert/*`) |
| ตรวจระบบ (`#/diagnostics`) | self-test: worker, canvas, ฟอนต์, API — ใช้เวลาหน้าตัวอย่างไม่ขึ้น |
| ประวัติ | ดูทุก run ที่เคยรัน, **กดดาวน์โหลดไฟล์ผลลัพธ์ซ้ำ** จากสำเนาที่เก็บในเบราว์เซอร์ (30 วัน), ดาวน์โหลดประวัติเป็น CSV/JSON, ล้างประวัติ หรือลบข้อมูลทั้งหมด |
| พรีเซ็ต | บันทึกค่าที่ใช้บ่อยต่อเครื่องมือ (เก็บใน PostgreSQL) ใช้ซ้ำได้ในคลิกเดียว |
| ลิงก์แชร์ | อัปโหลดผลลัพธ์ขึ้นเซิร์ฟเวอร์ชั่วคราวเพื่อให้คนอื่นดาวน์โหลด (หมดอายุ 7 วัน) |
| สมัครสมาชิก (`#/signup`) | เข้าสู่ระบบด้วย Google เป็นหลัก หรือสมัครด้วยอีเมล + รหัสผ่าน (scrypt) — ฟรีไม่จำกัด |
| Google sign-in | ทางเข้าหลัก: Google Identity Services (ต้องตั้ง `GOOGLE_CLIENT_ID` ก่อน) |

เครื่องมือที่ยังไม่เปิด (Redact, Compare, OCR, PDF/A, Repair, AI Summarize/Translate, Workflow)
แสดงในหน้าแรกเป็น "กำลังจะมา" เพราะต้องใช้ไลบรารีหรือไบนารีเพิ่มบนเซิร์ฟเวอร์ ซึ่งขัดกับแนวทาง
"ไฟล์อยู่ในเครื่อง" ของโปรเจกต์นี้ — ยกเว้น Word ⇄ PDF ที่เลือกใช้ LibreOffice บน HomeLab
เพราะทำในเบราว์เซอร์ให้แม่นไม่ได้

## เริ่มใช้งาน

ต้องมี **Node.js 24+**, **pnpm** และ **PostgreSQL 17** ที่รันอยู่ในเครื่อง

```bash
pnpm install
cp .env.example .env          # แก้ DATABASE_URL ถ้าไม่ใช่ค่าเริ่มต้น
pnpm db:create                # สร้างฐานข้อมูล pdf_studio
pnpm db:migrate               # รัน migration ใน server/migrations
pnpm dev:all                  # Vite (5174) + API (8787) พร้อมกัน
```

เปิด http://127.0.0.1:5174 — ต้องเข้าสู่ระบบก่อนใช้เครื่องมือ (Google หรืออีเมล/รหัสผ่าน)
ถ้าไม่รัน API หน้าเว็บจะปล่อยให้ใช้เครื่องมือในเบราว์เซอร์ต่อได้ แต่ประวัติ/พรีเซ็ต/แชร์
จะแจ้งว่าเชื่อมต่อไม่ได้

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
| `pnpm credits:grant --email a@b.c --amount 50 --note "top-up"` | (โหมดเครดิต) แอดมินเติมเครดิตให้บัญชี (เขียน ledger ด้วย) |
| `pnpm credits:codes --count 10 --credits 20 [--uses 1] [--expires 2026-12-31]` | (โหมดเครดิต) สร้างโค้ดเติมเครดิต — แสดงโค้ดครั้งเดียว เก็บแค่ hash |
| `pnpm credits:balance --email a@b.c` | (โหมดเครดิต) ดูยอดเครดิตและจำนวนโค้ดที่ใช้ไปของบัญชี |
| `pnpm sample` | สร้าง `public/samples/sample-12p.pdf` ใหม่ (ไว้กด "ดูไฟล์ตัวอย่าง") |
| `node scripts/serve-dist-hostile.mjs` | เสิร์ฟ `dist` แบบจำลอง Nginx ที่ MIME ผิด (`.mjs` → `text/plain`) |
| `node scripts/check-worker-bundle.mjs` | CI guard: worker ของ pdf.js ต้องออกมาเป็น `.js` เท่านั้น |
| `node scripts/fetch-fonts.mjs` | ดาวน์โหลดฟอนต์ (Noto Sans Thai / Krub / Cascadia Code) มา self-host |

## การตั้งค่า (.env)

| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/pdf_studio` | ฐานข้อมูลหลัก |
| `TEST_DATABASE_URL` | `…/pdf_studio_test` | ฐานข้อมูลของ `pnpm test` (สร้าง/migrate อัตโนมัติ) |
| `API_PORT` / `API_HOST` | `8787` / `127.0.0.1` | ที่อยู่ของ API |
| `APP_ORIGIN` | `http://127.0.0.1:5174` | origin ที่อนุญาตสำหรับ request ที่เปลี่ยนข้อมูล |
| `GOOGLE_CLIENT_ID` | ว่าง | ทางเข้าหลักของระบบ — ว่าง = ปุ่ม Google ถูกซ่อน (ยังล็อกอินด้วยอีเมลได้) |
| `CREDITS_ENABLED` | `false` | `false` = ใช้ฟรีไม่หักเครดิต และซ่อน UI เครดิต; `true` = กลับไปหักเครดิตแบบเดิม |
| `REQUIRE_SIGN_IN` | `true` | `true` = ต้องล็อกอินก่อนรันเครื่องมือ (โหมดฟรี) |
| `ANON_CREDITS` | `3` | ใช้เฉพาะเมื่อ `CREDITS_ENABLED=true` — เครดิตครั้งเดียวของผู้ไม่ระบุตัวตน |
| `SIGNUP_BONUS_CREDITS` | `20` | ใช้เฉพาะเมื่อ `CREDITS_ENABLED=true` — เครดิตเริ่มต้นของสมาชิกใหม่ |
| `SHARE_MAX_BYTES` | `26214400` (25 MB) | ขนาดไฟล์สูงสุดของลิงก์แชร์ |
| `SHARE_TTL_DAYS` | `7` | อายุลิงก์แชร์ |
| `HISTORY_TTL_DAYS` | `30` | เก็บประวัติการใช้งานย้อนหลังกี่วัน (แถวเก่ากว่านี้ถูกลบตอนเปิดหน้าประวัติ) |
| `SESSION_TTL_DAYS` | `30` | อายุ session cookie |
| `SOFFICE_PATH` | `soffice` | ไบนารี LibreOffice ที่ใช้ใน `/api/convert/*` |
| `SMTP_URL` | ว่าง | `smtp://user:pass@host:587` หรือ `smtps://…:465` สำหรับส่งรหัสยืนยันอีเมล |
| `MAIL_FROM` | `PDF Studio <no-reply@localhost>` | ชื่อ/ที่อยู่ผู้ส่งของอีเมลยืนยัน |

### โหมดใช้งานปัจจุบัน: ฟรี + ล็อกอิน

- `CREDITS_ENABLED=false` (ค่าเริ่มต้น) — ทุก run ฟรี ไม่มีการหักเครดิต ไม่สร้างกระเป๋าใหม่
  และ endpoint `/api/credits*` ไม่ถูกติดตั้ง หน้าเว็บจึงไม่มีตัวเลขเครดิต/โค้ดเติมเครดิต
  โค้ดและตาราง `credit_*` ยังอยู่ครบ (ดู "การทดสอบ" ด้านล่าง)
- `REQUIRE_SIGN_IN=true` — หน้าเครื่องมือทุกตัวจะขึ้นกำแพงล็อกอินถ้ายังไม่เข้าสู่ระบบ
  และ `POST /api/runs` ตอบ **401 `sign_in_required`** ถ้าไม่มี session
- หน้าแชร์ (`#/s/<token>`) และหน้าแรก/ตรวจระบบยังเปิดสาธารณะ เพราะผู้รับลิงก์อาจไม่มีบัญชี
- กลับไปใช้ระบบเครดิตเดิม: ตั้ง `CREDITS_ENABLED=true` แล้วรีสตาร์ท API — ไม่ต้อง migrate
  (บัญชีที่สร้างตอนปิดระบบจะมียอด 0 ต้องเติมด้วย `pnpm credits:grant`)

### เปิด Google sign-in (ทางเข้าหลัก)

1. สร้าง OAuth Client ID (Web application) ใน Google Cloud Console
2. เพิ่ม `http://127.0.0.1:5174` ใน **Authorized JavaScript origins**
   (เพิ่ม origin ที่ deploy จริงด้วยเมื่อขึ้นเซิร์ฟเวอร์)
3. ใส่ client id ใน `.env` แล้วรีสตาร์ท API
4. ปุ่ม "เข้าสู่ระบบด้วย Google" จะเปิดใช้งาน — ID token ถูกตรวจกับ JWKS ของ Google
   ฝั่งเซิร์ฟเวอร์ แล้วออก session cookie แบบ `httpOnly`
5. ถ้ายังไม่ตั้งค่านี้ ปุ่ม Google จะถูกซ่อนและหน้าเข้าสู่ระบบจะบอกตรง ๆ
   ระหว่างนั้นใช้ฟอร์มอีเมล/รหัสผ่านได้

### เปิดการยืนยันอีเมล (SMTP)

รหัส 6 หลักทางอีเมลใช้กับ **การตั้งรหัสผ่านใหม่** เป็นหลัก ส่วนการยืนยันอีเมลก่อนใช้เครดิต
มีผลเฉพาะเมื่อ `CREDITS_ENABLED=true` (โหมดฟรีไม่ต้องยืนยันก่อนใช้งาน)

1. ใส่ `SMTP_URL` ใน `.env` — Gmail ใช้ App Password:
   `smtps://you@gmail.com:xxxxxxxxxxxxxxxx@smtp.gmail.com:465`
2. ตั้ง `MAIL_FROM` เป็นชื่อ/ที่อยู่ที่จะให้ผู้ใช้เห็น
3. รีสตาร์ท API — รหัสมีอายุ 10 นาที, ขอซ้ำได้ทุก 60 วินาที (สูงสุด 5 ครั้ง/ชม.),
   กรอกผิดได้ 5 ครั้งแล้วต้องขอใหม่
   อีเมลเป็น HTML ธีมเดียวกับเว็บ (กระดาษครีม กรอบหมึก และแถบสีส้ม) พร้อมข้อความล้วน
   สำหรับไคลเอนต์ที่ปิด HTML — ฟอนต์ Krub/Noto Sans Thai ใช้เมื่อเครื่องผู้รับมี ไม่ต้องโหลดจาก CDN
4. ถ้ายังไม่ตั้ง `SMTP_URL` ในเครื่อง dev ระบบจะแสดงรหัสบนแถบยืนยันและพิมพ์ในล็อก API
   (โหมด `log`); บน production ที่ไม่มี SMTP ระบบจะปิดการบังคับยืนยันเพื่อไม่ให้ล็อกทุกคนออก
   จากเครดิตของตัวเอง

### ลืมรหัสผ่าน

- `POST /api/auth/password/forgot` ตอบ 202 เหมือนกันทุกกรณีเสมอ (ไม่บอกว่ามีบัญชีหรือไม่)
  และจำกัด 5 ครั้ง/10 นาทีต่ออีเมล+IP
- `POST /api/auth/password/reset` ใช้รหัส 6 หลักชนิด `reset` — ใช้โค้ดยืนยันอีเมลแทนกันไม่ได้
  และเมื่อตั้งรหัสผ่านใหม่แล้ว session เก่าทุกตัวจะถูกยกเลิก
- หน้าเว็บอยู่ที่ `#/forgot` (ลิงก์จากหน้าเข้าสู่ระบบ) · บัญชีที่สมัครด้วย Google ไม่มีรหัสผ่าน
  จึงไม่ส่งรหัสรีเซ็ตให้
- `POST /api/auth/password/change` สำหรับคนที่ล็อกอินอยู่: ต้องใส่รหัสผ่านปัจจุบัน (กัน session
  ที่ถูกขโมย), ลองผิดได้ 5 ครั้ง/15 นาที, แล้วยกเลิก session ของเครื่องอื่นทั้งหมด
  แต่เครื่องที่เปลี่ยนยังอยู่ — หน้าเว็บอยู่ที่ `#/password` (ลิงก์จากหน้าประวัติ)

## สถาปัตยกรรม

### ฝั่งเบราว์เซอร์

- **Hash router** (`src/lib/router.ts`) — ทุกเครื่องมือมี URL ของตัวเอง (`#/rotate`,
  `#/s/<token>`) และ deploy เป็น static ได้โดยไม่ต้องมี rewrite rule
- **`WorkspaceProvider`** ถือเอกสารที่เปิดอยู่หนึ่งไฟล์ร่วมกันทุกหน้า: `entries`
  (ลำดับหน้า), `selected`, undo/redo stack, bytes ต้นฉบับ — เปิดใน Organize แล้วข้ามไป Rotate
  ต่อได้ทันทีโดยไม่ต้องเลือกไฟล์ใหม่
- **`useToolRun`** ห่อทุกการรัน: บันทึก run (`running` → `succeeded`/`failed`) →
  เก็บผลลัพธ์ล่าสุดไว้ให้ `ShareStrip` แชร์ (โหมดเครดิตจะหักเครดิตตรงขั้นนี้)
- **`lib/run-files.ts`** เก็บสำเนาไฟล์ผลลัพธ์ลง **IndexedDB** (`pdfstudio.run-files`)
  keyed ด้วย run id — ทำให้หน้าประวัติกดดาวน์โหลดซ้ำได้โดยไม่อัปโหลดอะไรขึ้นเซิร์ฟเวอร์
  รายการที่เกิน 30 วันถูกล้างตอนอ่านรายการ และถูกล้างทั้งหมดเมื่อผู้ใช้ล้างประวัติ/ลบบัญชี
- **`RequireSignIn`** กันหน้าเครื่องมือเมื่อยังไม่ล็อกอิน และปล่อยผ่านเมื่อ API ล่ม
  เพราะงาน PDF ทำในเบราว์เซอร์อยู่แล้ว — "ฟรีไม่จำกัด" จึงเป็น soft gate
- **pdf.js 4.10.38** สำหรับ thumbnail/preview/แปลงเป็นภาพ, **@cantoo/pdf-lib** สำหรับ
  แก้โครงสร้างเอกสารและเข้ารหัส, **fflate** สำหรับ zip, **@dnd-kit** สำหรับลากจัดลำดับ
- ไฟล์ทำงานในหน่วยความจำเท่านั้น ไม่มี service worker และไม่มีการอัปโหลดโดยปริยาย
- ฟอนต์ UI เป็น self-host (`public/fonts/google/`, สร้างจาก `scripts/fetch-fonts.mjs`):
  **Noto Sans Thai** (เนื้อหา/ไทย), **Krub** (หัวข้อ), **Cascadia Code** (โค้ด/ชื่อไฟล์) — ไม่มี request ไป Google
  ดึงครบทุกน้ำหนักที่ CSS ใช้ (400/500/600/700) เพื่อไม่ให้เบราว์เซอร์ปั้นตัวหนาเทียมบนอักษรไทย
- หน้าที่ใช้ pdf.js (`useThumbnails`, `page-images`, `compress`) ใช้ worker ที่ Vite บันเดิลเป็น `.js`
  และแสดงสาเหตุ + ปุ่ม "ลองใหม่" เมื่อโหลดไม่ได้ (ไม่กลืน error เหมือนก่อน)

### ฝั่งเซิร์ฟเวอร์ (`server/`)

Fastify + `pg` (raw SQL, ไม่มี ORM) — ไม่มี dependency ของ Node ใน path ที่ต้องใช้
ไฟล์ผู้ใช้ เพราะ bytes ไปถึงเซิร์ฟเวอร์เฉพาะตอนแชร์

| ตาราง | เก็บอะไร |
| --- | --- |
| `app_user` | บัญชี: email, ชื่อ, รูป, `password_hash` (scrypt) หรือ `google_sub` |
| `workspace` | พื้นที่ทำงานต่อเบราว์เซอร์ — เก็บ **sha256 ของ token** ไม่เก็บตัว token |
| `auth_session` | session cookie (sha256, อายุ 30 วัน) |
| `job_run` | ประวัติการรัน: เครื่องมือ, สถานะ, params, ชื่อ/ขนาด/จำนวนหน้า, ระยะเวลา, `credit_wallet_id` (null ในโหมดฟรี) |
| `credit_wallet` | *(โหมดเครดิต — พับอยู่)* กระเป๋าเครดิต — เจ้าของคนเดียว: user หรือ workspace |
| `credit_entry` | *(โหมดเครดิต — พับอยู่)* รายการเดินบัญชี (grant / run / refund / redeem / admin / merge) |
| `redeem_code` | *(โหมดเครดิต — พับอยู่)* โค้ดเติมเครดิต — เก็บ **sha256 ของโค้ด** เท่านั้น |
| `redeem_use` | *(โหมดเครดิต — พับอยู่)* ใครใช้โค้ดไหนแล้ว (1 โค้ดต่อ 1 กระเป๋า 1 ครั้ง) |
| `preset` | พรีเซ็ตต่อ workspace + tool + ชื่อ (upsert) |
| `artifact` | ไฟล์ที่ถูกแชร์ (bytes อยู่ในตารางนี้เท่านั้น) |
| `share_link` | token, วันหมดอายุ, จำนวนดาวน์โหลด |

- ผู้ใช้ไม่ระบุตัวตนได้ workspace จากการ์ด `x-workspace-token` (สร้างใน localStorage)
  เซิร์ฟเวอร์เก็บเฉพาะ hash — ถ้าล้าง storage ก็ได้ workspace ใหม่
- **โหมดฟรี (ค่าเริ่มต้น):** `POST /api/runs` สร้าง `job_run` โดยไม่แตะกระเป๋าเลย
  (`credit_wallet_id` เป็น null) จึงไม่มี 402 และไม่มีเพดานจำนวนครั้ง
- `REQUIRE_SIGN_IN=true` ทำให้ run ที่ไม่มี session ได้ **401 `sign_in_required`** — account คือ gate เดียว
  (หน้าแชร์/หน้าแรกไม่โดน)
- ล็อกอินแล้ว workspace จะถูกผูกกับ user → ประวัติตามไปทุกเบราว์เซอร์
- **โหมดเครดิต (`CREDITS_ENABLED=true`):** ทุก run หัก 1 เครดิตใน transaction เดียวกับการสร้าง
  `job_run` — เครดิตหมดได้ **402 `insufficient_credits`**; งาน `failed`/`canceled`/ค้างเกิน 10 นาที
  คืนเครดิตครั้งเดียว; ผู้ไม่ระบุตัวตนได้ `ANON_CREDITS` ครั้งเดียว และสมาชิกใหม่ได้
  `SIGNUP_BONUS_CREDITS` พร้อมยกยอดทดลองที่เหลือเข้าบัญชี; สมาชิกที่ยังไม่ยืนยันอีเมล
  จะได้ **403 `email_unverified`** เมื่อสร้าง run หรือแลกโค้ด
- request ที่เปลี่ยนข้อมูล (POST/PATCH/DELETE) ที่มี `Origin` ต้องมาจาก `APP_ORIGIN`
  (หรือ loopback คู่กัน) ไม่งั้นได้ 403
- `DELETE /api/me` ลบ workspace/user และข้อมูลที่ cascading ตามทั้งหมด
- artifact ที่ไม่มี share link เหลืออยู่จะถูกล้างเมื่อเก่ากว่า 8 วัน (ทำงานตอนสร้างลิงก์ใหม่)

### API

| Method | Path | หมายเหตุ |
| --- | --- | --- |
| `GET` | `/api/health` | เช็กว่า API + DB พร้อม |
| `POST` | `/api/bootstrap` | สร้าง/อ่าน workspace, คืน user + `credits` (null ในโหมดฟรี) + flag `creditsEnabled`/`requireSignIn` |
| `GET` | `/api/me` | สถานะเดิมโดยไม่สร้าง workspace |
| `POST` | `/api/auth/signup` | สมัครด้วยอีเมล/รหัสผ่าน → 409 `email_taken`, ออก session cookie |
| `POST` | `/api/auth/signin` | เข้าสู่ระบบ → 401 `invalid_credentials`, 429 `too_many_attempts` |
| `POST` | `/api/auth/google` | ตรวจ ID token, ผูก workspace, ออก session cookie (ถ้าตั้ง client id) |
| `POST` | `/api/auth/signout` | ลบ session |
| `DELETE` | `/api/me` | ลบข้อมูลทั้งหมดของ workspace/user |
| `POST` | `/api/runs` | เริ่ม run — 401 `sign_in_required` เมื่อยังไม่ล็อกอิน; 402 `insufficient_credits` เฉพาะโหมดเครดิต |
| `GET` | `/api/credits` | *(เฉพาะโหมดเครดิต — ไม่ถูกติดตั้งในโหมดฟรี)* ยอดเครดิต + 10 รายการล่าสุด |
| `POST` | `/api/credits/redeem` | *(เฉพาะโหมดเครดิต)* ใช้โค้ดเติมเครดิต → 404 `code_not_found`, 409 `code_unavailable` |
| `PATCH` | `/api/runs/:id` | จบ run (`succeeded` / `failed` / `canceled`) |
| `GET` | `/api/runs?limit=` | ประวัติล่าสุด + `retentionDays` (ลบแถวที่เก่ากว่าอายุเก็บก่อนตอบ) |
| `DELETE` | `/api/runs` | ล้างประวัติ |
| `GET` | `/api/presets?tool=` | พรีเซ็ตของ workspace/user |
| `POST` | `/api/presets` | บันทึก/ทับพรีเซ็ตชื่อเดิม |
| `DELETE` | `/api/presets/:id` | ลบพรีเซ็ต |
| `POST` | `/api/shares` | อัปโหลดผลลัพธ์ (base64) เป็นลิงก์ชั่วคราว |
| `GET` | `/api/shares/:token` | metadata (410 เมื่อหมดอายุ) |
| `GET` | `/api/shares/:token/file` | ดาวน์โหลดไฟล์ (นับจำนวนครั้ง) |
| `DELETE` | `/api/shares/:token` | ยกเลิกลิงก์ |
| `POST` | `/api/convert/word-to-pdf` | รับ bytes (`application/octet-stream`) + `x-file-name` คืน PDF |
| `POST` | `/api/convert/pdf-to-word` | คืน `.docx` (คุณภาพขึ้นกับโครงสร้างต้นฉบับ) |

## การทดสอบ

```bash
pnpm test        # ต้องมี PostgreSQL รันอยู่ — จะสร้าง pdf_studio_test ให้เอง
pnpm typecheck
```

- `tests/` — logic ฝั่ง client: ช่วงหน้า, session reducer, undo/redo, ชื่อไฟล์/zip,
  merge, rotate, page numbers (ฝังฟอนต์ไทย), watermark, protect/unlock, paint
- `server/tests/` — integration ผ่าน `app.inject()` บน PostgreSQL จริง: migration,
  bootstrap + flag โหมดฟรี, password signup/signin (rate limit), Google flow (verifier ปลอม), runs,
  โหมดเครดิต (wallet/redeem/admin grant — รันด้วย `CREDITS_ENABLED=true`), presets, shares (หมดอายุ, ขนาด,
  Origin guard, การแยกข้อมูลระหว่าง workspace)
- ไฟล์ทดสอบของ server ใช้ฐานข้อมูลร่วมกัน จึงตั้ง `fileParallelism: false`

การตรวจด้วยเบราว์เซอร์จริง: เปิดตัวอย่าง → ลบหน้า → ดาวน์โหลด → ตรวจไฟล์ผลลัพธ์ด้วย pdf-lib
(จำนวนหน้า/มุมหมุน/ข้อความ) และทดสอบลิงก์แชร์ด้วยการดาวน์โหลดผ่าน `/api/shares/:token/file`

## Deploy (HomeLab / Docker Compose + Nginx)

```bash
cp deploy/.env.deploy.example deploy/.env.deploy   # แก้ POSTGRES_PASSWORD + APP_ORIGIN
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.deploy up -d --build
docker compose -f deploy/docker-compose.yml exec api node server/src/db/migrate.ts
```

รายละเอียด (backup, อัปเดต, การตรวจหลัง deploy) อยู่ใน [deploy/README.md](deploy/README.md)

### ทำไม worker ของ pdf.js ต้องเป็น `.js`

Nginx มาตรฐานไม่มี MIME ของ `.mjs` จึงเสิร์ฟเป็น `text/plain` — เบราว์เซอร์ปฏิเสธ module
worker แล้ว pdf.js ล้มทั้งก้อน ทำให้ทุกหน้าขึ้น "แสดงตัวอย่างไม่ได้" โดยไม่มีสาเหตุบนจอ

ตอนนี้ `src/lib/pdfjs.ts` บันเดิล worker ผ่าน Vite (`?worker`) ให้ออกมาเป็น `.js` และ
`scripts/check-worker-bundle.mjs` จะทำให้ CI แดงทันทีถ้ากลับไปเป็น `.mjs` อีก
(จำลองโฮสต์ที่ MIME ผิดได้ด้วย `node scripts/serve-dist-hostile.mjs` หลัง `pnpm build`)

## ข้อจำกัดที่รู้อยู่

- **ไม่แก้เนื้อหาในหน้า** — ทำงานระดับโครงสร้างหน้า/เลเยอร์ทับ (เลขหน้า, ลายน้ำ) เท่านั้น
- bookmark, outline, ฟอร์ม และไฟล์แนบระดับเอกสารอาจหายเมื่อสร้างไฟล์ใหม่ (เนื้อหาหน้าครบ)
- ลายเซ็นดิจิทัลจะถูกยกเลิกเมื่อบันทึกไฟล์ใหม่
- สิทธิ์การใช้งานในไฟล์ที่เข้ารหัสเป็น "คำขอ" ต่อโปรแกรมอ่าน ไม่ใช่การบังคับ — รหัสผ่านคือส่วนป้องกันจริง
- `Protect` ใช้ AES-256 ของ pdf-lib; `Unlock` ต้องรู้รหัสผ่านเดิม และจะสร้างไฟล์ใหม่ที่ไม่มีรหัส
- เอกสารหลักพันหน้ายังสร้าง DOM ต่อการ์ดทุกหน้า (thumbnail เป็น lazy แต่ยังไม่มี virtualization)
- ภาพที่ export เป็น raster: ค้นหา/คัดลอกข้อความไม่ได้ และ 3x บนเอกสารยาวกิน RAM พอสมควร
- `Compress` เรนเดอร์หน้าใหม่เป็น JPEG — ข้อความจะคัดลอกไม่ได้ และไฟล์ต้นฉบับที่เล็กอยู่แล้วอาจใหญ่ขึ้น (UI บอกตรง ๆ)
- `Crop` ย้าย CropBox เท่านั้น เนื้อหาที่ถูกตัดยังอยู่ในไฟล์ — ไม่ใช่การลบข้อมูล
- Word ⇄ PDF ต้องมี LibreOffice ใน container ของ API; ถ้าไม่มีจะตอบ 501 พร้อมคำอธิบาย
- PDF → Word คุณภาพขึ้นกับต้นฉบับ: ตาราง/ฟอร์มซับซ้อนอาจเพี้ยน
- Docker Compose / Dockerfile ใน `deploy/` ยังไม่ได้รันจริงบนเครื่อง dev (เครื่องนี้ไม่มี Docker) — ตรวจบน HomeLab ก่อนใช้งาน
- ประวัติเก็บย้อนหลัง `HISTORY_TTL_DAYS` (30 วัน) — แถวที่เก่ากว่าจะถูกลบถาวรเมื่อมีการเปิดหน้าประวัติ
- ไฟล์ผลลัพธ์ถูกเก็บสำเนาไว้ในเบราว์เซอร์ (IndexedDB) ทำให้กดดาวน์โหลดซ้ำจากประวัติได้
  แต่ทำได้เฉพาะบนเครื่อง/โปรไฟล์เดิมที่รันงาน และจะหายเมื่อล้างข้อมูลเว็บหรือใช้โหมดส่วนตัว
  ส่วนงานที่รันก่อนมีฟีเจอร์นี้จะเห็นปุ่มดาวน์โหลดแบบปิดไว้ (ไม่มีสำเนาให้โหลด)
- การบังคับล็อกอินเป็น soft gate: งาน PDF ทำในเบราว์เซอร์อยู่แล้ว ถ้าตัด API ออก
  หน้าเว็บจะปล่อยให้ใช้เครื่องมือต่อ (ประวัติไม่ถูกบันทึก) — เซิร์ฟเวอร์ยังบังคับที่ `POST /api/runs`
- การเปลี่ยน/ตั้งรหัสผ่านใหม่ต้องรู้รหัสเดิมหรือเข้าถึงอีเมล — ไม่มีขั้นตอนยืนยันตัวตนอื่น
  (เชน 2FA) และบัญชี Google-only ต้องใช้ Google อย่างเดียว
- ยังไม่มีคิวส่งเมล: ถ้า SMTP ล่มตอนขอลืมรหัส ระบบจะตอบ 202 เหมือนปกติและเก็บ error ไว้ใน
  log ของ API เท่านั้น (กันการเดาว่าอีเมลไหนมีบัญชี)
- อีเมลยืนยันส่งผ่าน SMTP ของคุณเอง (ไม่มีคิว/retry) — ถ้า SMTP ล่ม ผู้ใช้จะเห็นข้อความ
  `mail_failed` และโค้ดที่ค้างจะถูกลบเพื่อให้ขอลองใหม่ได้ทันที
- ตัวนับการเดารหัสผ่านอยู่ในหน่วยความจำของ process เดียว (รีสตาร์ท = รีเซ็ต) พอสำหรับ self-host
- ยังไม่มี rate limit ระดับ IP, CSRF token (ใช้ SameSite=Lax + Origin guard) และยังไม่มี
  ระบบลบ artifact ทันทีเมื่อผู้ใช้ยกเลิกลิงก์ (จะถูกเก็บกวาดตามรอบ)
