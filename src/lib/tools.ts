/** Catalog of PDF tools shown on the home grid. */

export type ToolSlug =
  | 'organize'
  | 'merge'
  | 'rotate'
  | 'page-numbers'
  | 'watermark'
  | 'lock'
  | 'activity'
  | 'split'
  | 'pdf-to-jpg'
  | 'jpg-to-pdf'
  | 'sign'
  | 'crop'
  | 'compress'
  | 'word-to-pdf'
  | 'pdf-to-word';

export type ToolIcon =
  | 'organize'
  | 'merge'
  | 'rotate'
  | 'numbers'
  | 'watermark'
  | 'lock'
  | 'split'
  | 'image'
  | 'jpg-to-pdf'
  | 'sign'
  | 'crop'
  | 'compress'
  | 'office'
  | 'soon';

export type ToolStatus = 'ready' | 'soon';

export type ToolDefinition = {
  slug: string;
  title: string;
  description: string;
  status: ToolStatus;
  icon: ToolIcon;
  /** Hash route for ready tools. */
  href?: string;
  badge?: string;
};

/** Tools that are wired up today. */
export const READY_TOOLS: ToolDefinition[] = [
  {
    slug: 'organize',
    title: 'Organize PDF',
    description: 'ลบ · จัดลำดับ · แยกหน้า ไฟล์ไม่ถูกอัปโหลดขึ้นเซิร์ฟเวอร์',
    status: 'ready',
    icon: 'organize',
    href: '#/organize',
  },
  {
    slug: 'merge',
    title: 'Merge PDF',
    description: 'รวมหลายไฟล์ตามลำดับที่ต้องการ เป็นไฟล์เดียว',
    status: 'ready',
    icon: 'merge',
    href: '#/merge',
  },
  {
    slug: 'rotate',
    title: 'Rotate PDF',
    description: 'หมุนหน้า 90° / 180° / 270° ทั้งไฟล์หรือเฉพาะหน้าที่เลือก',
    status: 'ready',
    icon: 'rotate',
    href: '#/rotate',
  },
  {
    slug: 'page-numbers',
    title: 'Page numbers',
    description: 'ใส่เลขหน้าพร้อมรูปแบบ ภาษาไทย และเลือกตำแหน่งได้',
    status: 'ready',
    icon: 'numbers',
    href: '#/page-numbers',
  },
  {
    slug: 'watermark',
    title: 'Watermark',
    description: 'ลายน้ำข้อความหรือรูปภาพ ปรับความทึบ มุม และปูทั้งหน้า',
    status: 'ready',
    icon: 'watermark',
    href: '#/watermark',
  },
  {
    slug: 'lock',
    title: 'Protect / Unlock',
    description: 'ใส่รหัสผ่าน AES-256 พร้อมสิทธิ์การใช้งาน หรือปลดล็อกไฟล์',
    status: 'ready',
    icon: 'lock',
    href: '#/lock',
  },
  {
    slug: 'split',
    title: 'Split PDF',
    description: 'แยกตามช่วงหน้า — อยู่ในหน้าจัดการหน้า (แท็บแยกหน้า)',
    status: 'ready',
    icon: 'split',
    href: '#/organize',
  },
  {
    slug: 'pdf-to-jpg',
    title: 'PDF to JPG',
    description: 'แปลงหน้าเป็นภาพ PNG/JPG — อยู่ในหน้าจัดการหน้า',
    status: 'ready',
    icon: 'image',
    href: '#/organize',
  },
  {
    slug: 'jpg-to-pdf',
    title: 'JPG to PDF',
    description: 'รวมภาพ PNG/JPG เป็น PDF กำหนดขนาดหน้าและระยะขอบได้',
    status: 'ready',
    icon: 'jpg-to-pdf',
    href: '#/jpg-to-pdf',
  },
  {
    slug: 'sign',
    title: 'Sign PDF',
    description: 'วางลายเซ็นได้หลายอัน ลากจัดตำแหน่ง เลือกช่วงหน้า หรือวางจากคลิปบอร์ด',
    status: 'ready',
    icon: 'sign',
    href: '#/sign',
  },
  {
    slug: 'crop',
    title: 'Crop PDF',
    description: 'ครอปขอบหน้าเป็นรายหน้า ปรับได้ทั้ง 4 ด้าน',
    status: 'ready',
    icon: 'crop',
    href: '#/crop',
  },
  {
    slug: 'compress',
    title: 'Compress PDF',
    description: 'ลดขนาดไฟล์ด้วยการเรนเดอร์หน้าใหม่ เลือกคุณภาพได้ 3 ระดับ',
    status: 'ready',
    icon: 'compress',
    href: '#/compress',
  },
  {
    slug: 'word-to-pdf',
    title: 'Word to PDF',
    description: 'แปลง .docx / .doc เป็น PDF ด้วย LibreOffice บนเซิร์ฟเวอร์ของคุณ',
    status: 'ready',
    icon: 'office',
    href: '#/word-to-pdf',
  },
  {
    slug: 'pdf-to-word',
    title: 'PDF to Word',
    description: 'แปลง PDF เป็น .docx เพื่อแก้ไขต่อ (คุณภาพขึ้นกับต้นฉบับ)',
    status: 'ready',
    icon: 'office',
    href: '#/pdf-to-word',
  },
];

/** Tools shown as "coming soon" so the roadmap is visible. */
export const UPCOMING_TOOLS: ToolDefinition[] = [
  { slug: 'redact', title: 'Redact PDF', description: 'ลบข้อมูล sensitive ออกจากเนื้อหาจริง', status: 'soon', icon: 'soon' },
  { slug: 'compare', title: 'Compare PDF', description: 'เทียบสองไฟล์แบบเคียงข้างกัน', status: 'soon', icon: 'soon' },
  { slug: 'pdf-to-markdown', title: 'PDF to Markdown', description: 'สกัดข้อความเป็น Markdown', status: 'soon', icon: 'soon' },

  { slug: 'forms', title: 'PDF Forms', description: 'กรอกฟอร์มและ flatten ก่อนส่งออก', status: 'soon', icon: 'soon' },
  { slug: 'scan', title: 'Scan to PDF', description: 'ถ่ายเอกสารจากมือถือเป็น PDF', status: 'soon', icon: 'soon' },
  { slug: 'ocr', title: 'OCR PDF', description: 'ทำให้ไฟล์สแกนค้นหาและคัดลอกได้', status: 'soon', icon: 'soon' },
  { slug: 'html-to-pdf', title: 'HTML to PDF', description: 'แปลง URL หรือ HTML เป็น PDF', status: 'soon', icon: 'soon' },
  { slug: 'pdfa', title: 'PDF to PDF/A', description: 'เก็บถาวรตามมาตรฐาน ISO', status: 'soon', icon: 'soon' },
  { slug: 'repair', title: 'Repair PDF', description: 'กู้ไฟล์เสีย (ต้องใช้ qpdf / Ghostscript)', status: 'soon', icon: 'soon' },
  { slug: 'translate', title: 'Translate PDF', description: 'แปลทั้งไฟล์ด้วย AI คงรูปแบบเดิม', status: 'soon', icon: 'soon', badge: 'New' },
  { slug: 'summarize', title: 'AI Summarizer', description: 'สรุปเอกสารยาวให้สั้นลง', status: 'soon', icon: 'soon', badge: 'New' },
  { slug: 'workflow', title: 'Create a workflow', description: 'ต่อเครื่องมือเป็นลำดับและรันซ้ำได้', status: 'soon', icon: 'soon' },
];

export const ALL_TOOLS = [...READY_TOOLS, ...UPCOMING_TOOLS];

export const TOOL_TITLES: Record<string, string> = Object.fromEntries(
  ALL_TOOLS.map((tool) => [tool.slug, tool.title]),
);

export function toolTitle(slug: string): string {
  return TOOL_TITLES[slug] ?? slug;
}

export function toolBySlug(slug: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((tool) => tool.slug === slug);
}
