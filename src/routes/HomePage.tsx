import { ToolCard } from '../components/ToolCard';
import { READY_TOOLS, UPCOMING_TOOLS } from '../lib/tools';
import { useAccount } from '../state/account-context';

export function HomePage() {
  const { user, quota, authConfigured, signIn, busy } = useAccount();

  return (
    <main className="home">
      <section className="home-hero">
        <p className="eyebrow">PDF Studio · ไฟล์ไม่ออกจากเครื่องคุณ</p>
        <h1>
          เครื่องมือ PDF ครบชุด
          <br />
          ทำงานในเบราว์เซอร์ทั้งหมด
        </h1>
        <p className="home-lede">
          รวม · หมุน · ใส่เลขหน้า · ลายน้ำ · ใส่หรือปลดรหัสผ่าน — ทุกอย่างประมวลผลในแท็บนี้
          เซิร์ฟเวอร์เก็บเฉพาะประวัติ พรีเซ็ต และลิงก์แชร์ที่คุณสร้างเอง
        </p>

        <div className="home-actions">
          <a className="button-primary button-large" href="#/organize">
            เปิดไฟล์ PDF
          </a>
          <a className="button-secondary" href="#/activity">
            ประวัติการใช้งาน
          </a>
        </div>

        <ul className="home-facts">
          <li>ไม่อัปโหลดไฟล์</li>
          <li>{user ? 'ใช้งานไม่จำกัด' : `ฟรี ${quota.limit ?? 3} ครั้ง / 24 ชม.`}</li>
          <li>PostgreSQL เก็บประวัติและพรีเซ็ต</li>
        </ul>

        {!user && quota.remaining === 0 && (
          <div className="home-quota">
            <p>คุณใช้ครบ {quota.limit ?? 3} ครั้งแล้วใน 24 ชั่วโมง — เข้าสู่ระบบเพื่อใช้งานต่อ</p>
            <button
              type="button"
              className="button-primary"
              onClick={() => void signIn()}
              disabled={busy || !authConfigured}
            >
              {authConfigured ? 'เข้าสู่ระบบด้วย Google' : 'ยังไม่ได้ตั้งค่า Google Client ID'}
            </button>
          </div>
        )}
      </section>

      <section className="tool-section" aria-labelledby="ready-title">
        <div className="section-head">
          <h2 id="ready-title">พร้อมใช้งาน</h2>
          <span>{READY_TOOLS.length} เครื่องมือ</span>
        </div>
        <div className="tool-grid">
          {READY_TOOLS.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </section>

      <section className="tool-section" aria-labelledby="soon-title">
        <div className="section-head">
          <h2 id="soon-title">กำลังจะมา</h2>
          <span>แสดงไว้เพื่อวางแผน</span>
        </div>
        <div className="tool-grid">
          {UPCOMING_TOOLS.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </section>

      <p className="home-note">
        หมายเหตุ: Compress, OCR, PDF→Word และ PDF/A ต้องใช้ไลบรารี/ไบนารีเพิ่มบนเซิร์ฟเวอร์
        จึงยังไม่เปิดใช้งาน — รายการนี้จะอัปเดตเมื่อมีเครื่องมือใหม่
      </p>
    </main>
  );
}
