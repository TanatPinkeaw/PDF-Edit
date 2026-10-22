import { ToolCard } from '../components/ToolCard';
import { READY_TOOLS, UPCOMING_TOOLS } from '../lib/tools';
import { useAccount } from '../state/account-context';

export function HomePage() {
  const { user } = useAccount();

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
          <a className="button-primary button-large" href={user ? '#/organize' : '#/signin'}>
            {user ? 'เปิดไฟล์ PDF' : 'เข้าสู่ระบบเพื่อเริ่มใช้'}
          </a>
          <a className="button-secondary" href="#/activity">
            ประวัติการใช้งาน
          </a>
        </div>

        <ul className="home-facts">
          <li>ไม่อัปโหลดไฟล์</li>
          <li>ใช้ฟรีไม่จำกัด</li>
          <li>PostgreSQL เก็บประวัติและพรีเซ็ต</li>
        </ul>

        {!user && (
          <div className="home-quota">
            <p>
              เข้าสู่ระบบด้วยบัญชี Google (หรืออีเมล) แล้วใช้เครื่องมือได้ฟรีไม่จำกัด —
              ไม่มีเครดิตและไม่มีโควตารายวัน
            </p>
            <div className="home-actions">
              <a className="button-primary" href="#/signin">
                เข้าสู่ระบบ
              </a>
              <a className="button-secondary" href="#/signup">
                สมัครสมาชิก
              </a>
            </div>
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
