/* ==================================================================
   ไฟล์ตั้งค่าของ AjGolf AI
   แก้ไฟล์นี้ไฟล์เดียว  ไม่ต้องแตะ index.html
   ใช้ OpenRouter เจ้าเดียว  ทั้งแปลงเวกเตอร์และตอบคำถาม  จึงมีกุญแจอันเดียว
   ------------------------------------------------------------------
   คำเตือน  ไฟล์นี้เผยแพร่ต่อสาธารณะ  ใครก็เปิดดูกุญแจได้
   ให้ตั้งเพดานวงเงินที่ openrouter.ai และลบกุญแจเมื่อเลิกใช้
   ================================================================== */

window.CONFIG = {

  /* ===== กุญแจ  ใช้อันเดียวทั้งระบบ ===== */
  // ขอที่  openrouter.ai  ที่เมนู Keys
  KEY: "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",


  /* ===== การค้นหา ===== */

  // "vector"  ค้นด้วยความหมาย  ต้องมีไฟล์ vectors.json
  // "local"   เทียบตัวอักษรในเบราว์เซอร์  ไม่ต้องมีอะไรเลย
  //
  // ถ้าตั้ง vector แล้วมีปัญหา ระบบจะถอยไปใช้ local ให้เองอัตโนมัติ
  SEARCH_MODE: "vector",

  // รุ่นที่ใช้แปลงเวกเตอร์  ต้องเป็นรุ่นเดียวกับตอนสร้าง vectors.json
  // ดูรายชื่อได้ที่หน้า Models แล้วกดแท็บ Embeddings
  EMBED_MODEL: "nvidia/nemotron-3.5-embed-1b:free",

  // ชื่อไฟล์เวกเตอร์ที่สร้างจาก build-vectors.html
  VECTORS_FILE: "vectors.json",


  /* ===== การตอบคำถาม ===== */

  PROVIDER: "openrouter",

  // ชื่อรุ่น  ไปคัดลอกจากหน้า Models แล้วกดแท็บ Text
  // ตัวอย่าง  "google/gemma-4-31b:free"
  //          "google/gemini-2.0-flash-exp:free"
  MODEL: "google/gemma-4-31b:free",


  /* ===== เอกสาร ===== */

  // ไฟล์ .txt อยู่ชั้นเดียวกับ index.html  ใส่ค่าว่าง  ""
  DOCS_BASE: "docs",

  FILES: [
    "01-leave.txt",
    "02-registration.txt",
    "03-withdraw.txt",
    "04-scholarship.txt",
    "05-internship.txt",
    "06-documents.txt",
    "07-faq.txt",
    "08-contact.txt",
  ],


  /* ===== ปรับละเอียด  ปกติไม่ต้องแก้ ===== */
  CHUNK_SIZE: 500,
  OVERLAP: 100,
  TOP_K: 3,

};
