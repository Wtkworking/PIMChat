window.CONFIG = {

  /* ===== ส่งผ่าน Worker  ไม่มีกุญแจในหน้าเว็บ ===== */
  PROVIDER: "worker",

  // ที่อยู่ของ Worker ที่สร้างไว้  ไม่ต้องใส่ทับปิดท้าย
  WORKER_URL: "https://ajgolf-ai.golfg4pz-wot.workers.dev",

  // ไม่ต้องใส่  เว้นไว้ว่าง ๆ  เพราะกุญแจอยู่ที่ Worker แล้ว
  KEY: "",


  /* ===== การค้นหา ===== */
  SEARCH_MODE: "local",
  EMBED_MODEL: "nvidia/nemotron-3.5-embed-1b:free",
  VECTORS_FILE: "vectors.json",


  /* ===== การตอบคำถาม ===== */
  MODEL: "nvidia/nemotron-3.5-super-vl:free",


  /* ===== เอกสาร ===== */
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
