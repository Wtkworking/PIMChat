/* ==================================================================
   chat-widget.js  ·  แชตบอตสำหรับแปะลงหน้าเว็บใด ๆ

   วิธีใช้  เพิ่มบรรทัดเดียวก่อนปิด </body> ของหน้าเว็บ

       <script src="chat-widget.js"></script>

   ไฟล์ที่ต้องมีในโฟลเดอร์เดียวกัน
       config.js        ไฟล์ตั้งค่า
       docs/            เอกสารที่แชตบอตจะตอบจาก
       vectors.json     ถ้าใช้โหมด vector

   กุญแจไม่ได้อยู่ในไฟล์นี้  อยู่บน Cloudflare Worker
   ================================================================== */

(function(){
  // โหลด config.js แบบกันเบราว์เซอร์จำไฟล์เก่า
  const s = document.createElement("script");
  s.src = "config.js?t=" + Date.now();
  s.onerror = () => console.error("ไม่พบไฟล์ config.js  วางไว้โฟลเดอร์เดียวกับหน้าเว็บ");
  s.onload = () => window.__startApp && window.__startApp();
  document.head.appendChild(s);
})();



/* ==================================================================
   AjGolf AI  รุ่นที่สาม

   ค้นหามีสองโหมด  สลับได้ที่ SEARCH_MODE ใน config.js
     "vector"  ใช้เวกเตอร์จาก OpenRouter  ค้นด้วยความหมาย  ตรงกับที่สอนในสไลด์
     "local"   เทียบตัวอักษรในเบราว์เซอร์  ไม่ต้องมีกุญแจ ไม่มีวันล่ม

   โหมด vector ใช้ไฟล์ vectors.json ที่สร้างไว้ล่วงหน้า
   จึงเรียก API แค่ครั้งเดียวต่อคำถาม ไม่ใช่ทุกชิ้นเอกสาร

   ถ้า PROVIDER เป็น "worker"  หน้าเว็บนี้ไม่มีกุญแจอยู่เลย
   ทุกคำขอส่งผ่าน Cloudflare Worker ซึ่งเติมกุญแจให้บนเซิร์ฟเวอร์

   ถ้าโหมด vector มีปัญหา จะถอยไปใช้ local ให้อัตโนมัติ
   ================================================================== */

const PROVIDERS = {
  // ส่งผ่าน Cloudflare Worker  กุญแจอยู่บนเซิร์ฟเวอร์ ไม่มีในหน้าเว็บ
  worker: {
    name: "Worker",
    url: null,                                  // ประกอบจาก WORKER_URL
    auth: () => ({}),                           // ไม่ต้องส่งกุญแจ
    style: "openai",
  },
  openrouter: {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    auth: (k) => ({ "Authorization": "Bearer " + k }),
    style: "openai",
  },
  groq: {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    auth: (k) => ({ "Authorization": "Bearer " + k }),
    style: "openai",
  },
  openai: {
    name: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    auth: (k) => ({ "Authorization": "Bearer " + k }),
    style: "openai",
  },
  gemini: {
    name: "Google Gemini",
    url: null,                                  // ประกอบจากชื่อรุ่นทีหลัง
    auth: (k) => ({ "x-goog-api-key": k }),
    style: "gemini",
  },
};

let CFG = {}, CHUNKS = [], INDEX = [];
let READY = false;
let onReady = () => {};

/* ประกอบที่อยู่ของ Worker  ตัดทับปิดท้ายออกให้เอง */
function workerURL(path){
  const base = (CFG.WORKER_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("ยังไม่ได้ใส่ WORKER_URL ใน config.js");
  return base + path;
}
let VEC = null;            // ข้อมูลจาก vectors.json
let MODE = "local";        // โหมดที่ใช้งานจริง
let FELL_BACK = false;     // เคยถอยจาก vector มา local หรือยัง
const $ = (id) => document.getElementById(id);
let onStatus = () => {};
const boot = (t) => onStatus(t);

/* ---------- ขั้นที่ 1  หั่นเอกสาร ---------- */
async function buildChunks(){
  const out = [];
  const base = (CFG.DOCS_BASE || "").replace(/\/+$/, "");
  for (const f of CFG.FILES) {
    const url = base ? `${base}/${f}` : f;
    let text;
    try {
      const r = await fetch(url + "?t=" + Date.now());
      if (!r.ok) throw new Error(r.status);
      text = (await r.text()).trim();
    } catch {
      throw new Error(`อ่านไฟล์ ${url} ไม่ได้\nตรวจว่าไฟล์อยู่ที่เดียวกับ index.html และชื่อสะกดตรงกับรายการ FILES`);
    }
    let start = 0, part = 1;
    while (start < text.length) {
      out.push({ source: f, part, text: text.slice(start, start + (CFG.CHUNK_SIZE || 500)) });
      start += (CFG.CHUNK_SIZE || 500) - (CFG.OVERLAP || 100);
      part++;
    }
  }
  return out;
}

/* ---------- ขั้นที่ 2  ทำดัชนีไว้ค้น  ทำในเบราว์เซอร์ ไม่เรียก API ----------
   ใช้วิธีนับชุดตัวอักษรสามตัวติดกัน
   เหมาะกับภาษาไทยเพราะไม่ต้องตัดคำก่อน                                  */
function grams(s, n = 3){
  const t = s.replace(/\s+/g, "");
  const m = new Map();
  for (let i = 0; i + n <= t.length; i++) {
    const g = t.slice(i, i + n);
    m.set(g, (m.get(g) || 0) + 1);
  }
  let sum = 0;
  for (const v of m.values()) sum += v * v;
  return { m, norm: Math.sqrt(sum) || 1 };
}

function similarity(a, b){
  let num = 0;
  const [small, big] = a.m.size < b.m.size ? [a, b] : [b, a];
  for (const [g, v] of small.m) {
    const w = big.m.get(g);
    if (w) num += v * w;
  }
  return num / (a.norm * b.norm);
}

/* ---------- ขั้นที่ 3  ค้นหา ---------- */
function search(question){
  const q = grams(question);
  return INDEX
    .map((g, i) => ({ i, score: similarity(g, q) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CFG.TOP_K || 3)
    .map(({ i, score }) => ({ ...CHUNKS[i], score: Math.round(score * 1000) / 1000 }));
}

/* ---------- โหมดเวกเตอร์  โหลดไฟล์ที่สร้างไว้ล่วงหน้า ---------- */
async function loadVectors(){
  const r = await fetch((CFG.VECTORS_FILE || "vectors.json") + "?t=" + Date.now());
  if (!r.ok) throw new Error(`อ่านไฟล์ ${CFG.VECTORS_FILE || "vectors.json"} ไม่ได้  รหัส ${r.status}`);
  const d = await r.json();
  if (!d.chunks || !d.chunks.length) throw new Error("ไฟล์เวกเตอร์ว่างเปล่า");
  return d;
}

/* แปลงคำถามเป็นเวกเตอร์  เรียกหนึ่งครั้งต่อคำถาม
   ใช้กุญแจตัวเดียวกับตอนตอบคำถาม และต้องใช้รุ่นเดียวกับตอนสร้าง vectors.json */
async function embedQuestion(q){
  const viaWorker = CFG.PROVIDER === "worker";
  const url = viaWorker
    ? workerURL("/api/v1/embeddings")
    : "https://openrouter.ai/api/v1/embeddings";
  const auth = viaWorker ? {} : { "Authorization": "Bearer " + CFG.KEY };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({
      model: VEC.model || CFG.EMBED_MODEL || "nvidia/nemotron-3.5-embed-1b:free",
      input: [q],
    }),
  });
  if (!res.ok) throw new Error(`แปลงคำถามไม่สำเร็จ ${res.status}  ${(await res.text()).slice(0, 180)}`);
  const d = await res.json();
  const v = d.data?.[0]?.embedding;
  if (!v) throw new Error("ไม่ได้รับเวกเตอร์กลับมา");
  const n = Math.hypot(...v);
  return v.map(x => x / n);
}

function searchVector(qv){
  return VEC.chunks
    .map((c, i) => ({ i, score: c.v.reduce((s, x, k) => s + x * qv[k], 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CFG.TOP_K || 3)
    .map(({ i, score }) => ({
      source: VEC.chunks[i].source, part: VEC.chunks[i].part,
      text: VEC.chunks[i].text, score: Math.round(score * 1000) / 1000,
    }));
}

/* เลือกวิธีค้นตามโหมด  ถ้าโหมดเวกเตอร์พัง ให้ถอยไป local */
async function findChunks(question){
  if (MODE === "vector") {
    try {
      const qv = await embedQuestion(question);
      return { found: searchVector(qv), how: "เวกเตอร์" };
    } catch (e) {
      MODE = "local";
      FELL_BACK = true;
      console.warn("โหมดเวกเตอร์มีปัญหา ถอยไปใช้การเทียบตัวอักษร :", e.message);
      boot(bootLine() + "   (โหมดเวกเตอร์ใช้ไม่ได้ จึงสลับมาเทียบตัวอักษร)");
    }
  }
  return { found: search(question), how: "เทียบตัวอักษร" };
}

/* ---------- ขั้นที่ 4  ประกอบคำสั่งแล้วส่งให้ LLM ---------- */
function makePrompt(question, found){
  const docs = found.map((f, i) =>
    `[ชิ้นที่ ${i + 1}  จากไฟล์ ${f.source}]\n${f.text}`).join("\n\n");
  return `คุณคือผู้ช่วยตอบคำถามของคณะบริหารธุรกิจ
ให้ตอบโดยใช้เฉพาะข้อมูลในเอกสารด้านล่างเท่านั้น

ถ้าเอกสารไม่มีคำตอบ ให้ตอบว่า "ไม่พบข้อมูลนี้ในเอกสารของคณะ"
แล้วแนะนำให้ติดต่อฝ่ายวิชาการ  ห้ามเดา ห้ามเติมข้อมูลจากความรู้ทั่วไป

ตอบเป็นภาษาไทย สั้น กระชับ

เอกสารที่ค้นเจอ
${docs}

คำถามจากผู้ใช้
${question}`;
}

async function askLLM(prompt){
  const p = PROVIDERS[CFG.PROVIDER];
  if (!p) throw new Error(`ไม่รู้จักผู้ให้บริการชื่อ ${CFG.PROVIDER}\nเลือกได้จาก ${Object.keys(PROVIDERS).join("  ")}`);

  let url, body;
  if (p.style === "gemini") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${CFG.MODEL}:generateContent`;
    body = { contents: [{ parts: [{ text: prompt }] }] };
  } else {
    url = CFG.PROVIDER === "worker"
      ? workerURL("/api/v1/chat/completions")
      : p.url;
    body = { model: CFG.MODEL, messages: [{ role: "user", content: prompt }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...p.auth(CFG.KEY) },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status}  ${t.slice(0, 250)}`);
  }
  const d = await res.json();
  return p.style === "gemini"
    ? (d.candidates?.[0]?.content?.parts?.[0]?.text ?? "ไม่ได้รับคำตอบกลับมา")
    : (d.choices?.[0]?.message?.content ?? "ไม่ได้รับคำตอบกลับมา");
}

function bootLine(){
  const files = new Set(CHUNKS.map(c => c.source)).size;
  const pv = PROVIDERS[CFG.PROVIDER]?.name ?? CFG.PROVIDER;
  const m = MODE === "vector" ? "เวกเตอร์" : "เทียบตัวอักษร";
  return `พร้อมใช้งาน   เอกสาร ${files} ไฟล์  ${CHUNKS.length} ชิ้น   `
       + `ค้นแบบ ${m}   ตอบด้วย ${pv}`;
}

/* ---------- เริ่มระบบ ---------- */
window.__startApp = async () => {
  CFG = window.CONFIG || {};
  CFG.KEY = (CFG.KEY || "").trim();

  const needKey = CFG.PROVIDER !== "worker";
  if (needKey && (!CFG.KEY || CFG.KEY.startsWith("ใส่กุญแจ"))) {
    boot("ยังไม่ได้ใส่กุญแจ  หรือเบราว์เซอร์ยังใช้ไฟล์เก่า\n\n"
       + "1 เปิด config.js ตรง ๆ ในแท็บใหม่ ดูว่ามีกุญแจจริงไหม\n"
       + "2 ถ้ามี ให้กด Ctrl และ Shift และ R\n"
       + "3 ถ้าไม่มี แปลว่ายังไม่ได้ Commit");
    return;
  }
  if (CFG.PROVIDER === "worker" && !CFG.WORKER_URL) {
    boot("ยังไม่ได้ใส่ที่อยู่ Worker\n\nแก้บรรทัด WORKER_URL ใน config.js ให้เป็นที่อยู่ของ Worker ที่สร้างไว้");
    return;
  }
  if (!CFG.FILES || !CFG.FILES.length) {
    boot("ไม่มีรายชื่อไฟล์เอกสาร\n\nตรวจรายการ FILES ในไฟล์ config.js");
    return;
  }

  try {
    boot("กำลังอ่านเอกสาร...");
    CHUNKS = await buildChunks();
    INDEX = CHUNKS.map(c => grams(c.text));     // เตรียมโหมดสำรองไว้เสมอ

    MODE = "local";
    if ((CFG.SEARCH_MODE || "local") === "vector") {
      try {
        boot("กำลังโหลดไฟล์เวกเตอร์...");
        VEC = await loadVectors();
        MODE = "vector";
      } catch (e) {
        console.warn("โหลดไฟล์เวกเตอร์ไม่ได้ จึงใช้โหมด local :", e.message);
      }
    }

    boot(bootLine());

    READY = true;
    onReady();
  } catch (e) {
    boot("เริ่มไม่สำเร็จ\n\n" + e.message);
  }
};


/* ==================================================================
   ฟังก์ชันสาธารณะ  หน้าไหนก็เรียกได้
   คืนค่าเป็น { answer, refs }
   ================================================================== */
async function askBot(question){
  if (!READY) throw new Error("ระบบยังไม่พร้อม");
  const { found, how } = await findChunks(question);
  const answer = await askLLM(makePrompt(question, found));
  const refs = `ค้นแบบ${how}   ` +
    found.map(f => `${f.source} ส่วนที่ ${f.part} (${f.score})`).join("   ");
  return { answer, refs };
}


/* ==================================================================
   ส่วนหน้าตาของกล่องแชต  สร้างขึ้นเองทั้งหมดด้วย JavaScript
   จึงไม่ต้องไปแก้ HTML ของหน้าเว็บเลย
   ================================================================== */
(function(){

  /* ---------- สีให้เข้ากับเว็บ PIM  แก้ได้ที่นี่ ---------- */
  const C = {
    main:  "#0F3D33",   // เขียวเข้มของสถาบัน
    accent:"#F2B01E",   // เหลือง
    ink:   "#14211D",
    soft:  "#D5E3DB",
    line:  "#C3D1C8",
    bg:    "#EEF3EE",
    card:  "#FFFFFF",
    muted: "#3F514A",
  };

  /* ---------- สไตล์ ---------- */
  const css = `
#pimbot-btn{
  position:fixed; right:24px; bottom:24px; z-index:9999;
  width:60px; height:60px; border-radius:50%; border:0; cursor:pointer;
  background:${C.main}; color:#fff;
  box-shadow:0 6px 24px rgba(0,0,0,.25);
  display:grid; place-items:center;
  font-family:'Anuphan',system-ui,sans-serif;
  transition:transform .15s;
  margin-bottom: env(safe-area-inset-bottom, 0px);
}
#pimbot-btn:hover{transform:scale(1.06)}
#pimbot-btn svg{width:27px; height:27px}
#pimbot-dot{
  position:absolute; top:4px; right:4px; width:13px; height:13px;
  border-radius:50%; background:#2bb673; border:2px solid #fff;
}
#pimbot-panel{
  position:fixed; right:24px; bottom:96px; z-index:9999;
  width:min(390px, calc(100vw - 32px));
  background:${C.card}; border:1px solid ${C.line}; border-radius:14px;
  overflow:hidden; display:none;
  box-shadow:0 16px 48px rgba(0,0,0,.22);
  font-family:'Anuphan','Noto Sans Thai',system-ui,sans-serif;
  font-size:16px; line-height:1.65; color:${C.ink};
  margin-bottom: env(safe-area-inset-bottom, 0px);
}
#pimbot-panel.pimbot-open{display:block}
#pimbot-head{background:${C.main}; color:#fff; padding:14px 17px; position:relative}
#pimbot-head b{font-size:16px; font-weight:600}
#pimbot-head small{display:block; font-size:12px; color:${C.soft}; margin-top:2px}
#pimbot-close{
  position:absolute; top:10px; right:12px;
  background:none; border:0; color:#fff; font-size:22px; line-height:1;
  cursor:pointer; width:32px; height:32px;
}
#pimbot-warn{
  background:${C.bg}; border-bottom:1px solid ${C.line};
  padding:10px 17px; font-size:12px; line-height:1.6; color:${C.muted};
}
#pimbot-warn b{color:${C.main}}
#pimbot-log{height:290px; overflow-y:auto; padding:14px 16px; background:${C.bg}}
.pimbot-m{
  max-width:85%; padding:10px 14px; border-radius:12px; margin:8px 0;
  font-size:14.5px; white-space:pre-wrap; line-height:1.65;
}
.pimbot-me{margin-left:auto; background:${C.main}; color:#fff; border-bottom-right-radius:4px}
.pimbot-bot{background:${C.card}; border:1px solid ${C.line}; border-bottom-left-radius:4px}
.pimbot-src{display:block; margin-top:7px; font-size:11px; color:${C.muted}}
#pimbot-chips{padding:0 16px 10px; display:flex; flex-wrap:wrap; gap:6px; background:${C.bg}}
#pimbot-chips span{
  font-size:12px; padding:5px 11px; border:1px solid ${C.line};
  border-radius:999px; cursor:pointer; color:${C.muted}; background:${C.card};
}
#pimbot-chips span:hover{border-color:${C.main}; color:${C.main}}
#pimbot-row{display:flex; gap:8px; padding:12px 14px; border-top:1px solid ${C.line}}
#pimbot-q{
  flex:1; padding:10px 14px; font-family:inherit; font-size:14.5px;
  border:1px solid ${C.line}; border-radius:9px; background:${C.card}; color:${C.ink};
}
#pimbot-q:focus{outline:2px solid ${C.main}; outline-offset:1px}
#pimbot-send{
  padding:10px 20px; border:0; border-radius:9px;
  background:${C.accent}; color:${C.ink};
  font-family:inherit; font-size:14.5px; font-weight:600; cursor:pointer;
}
#pimbot-send:disabled{opacity:.45; cursor:default}
`;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- โครงหน้าตา ---------- */
  const wrap = document.createElement("div");
  wrap.innerHTML = `
<button id="pimbot-btn" aria-label="เปิดกล่องสอบถาม">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.7-.8L3 21l1.9-5A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"></path>
  </svg>
  <span id="pimbot-dot"></span>
</button>

<div id="pimbot-panel" role="dialog" aria-label="กล่องสอบถาม">
  <div id="pimbot-head">
    <button id="pimbot-close" aria-label="ปิด">×</button>
    <b>สอบถามข้อมูล</b>
    <small id="pimbot-status">กำลังเตรียมระบบ...</small>
  </div>

  <div id="pimbot-warn">
    <b>นี่คือผู้ช่วยอัตโนมัติ ไม่ใช่เจ้าหน้าที่</b>
    คำตอบอาจคลาดเคลื่อน ทุกคำตอบจะบอกที่มาให้ตรวจสอบย้อนกลับได้
    ต้องการคุยกับเจ้าหน้าที่จริง โทร 0-2000-0002
  </div>

  <div id="pimbot-log"></div>

  <div id="pimbot-chips">
    <span>ลาป่วยกี่วันต้องมีใบรับรองแพทย์</span>
    <span>ลาพักการศึกษาได้กี่ภาค</span>
    <span>ถอนรายวิชาแล้วติด W ไหม</span>
  </div>

  <div id="pimbot-row">
    <input id="pimbot-q" type="text" placeholder="พิมพ์คำถาม" disabled>
    <button id="pimbot-send" disabled>ส่ง</button>
  </div>
</div>`;
  document.body.appendChild(wrap);

  const $ = (id) => document.getElementById(id);

  /* ---------- ต่อเข้ากับสมอง ---------- */
  onStatus = (t) => { $("pimbot-status").textContent = String(t).split("\n")[0]; };

  onReady = () => {
    $("pimbot-q").disabled = false;
    $("pimbot-send").disabled = false;
    say("สวัสดีค่ะ สอบถามข้อมูลของสถาบันได้เลย", "bot");
  };

  function say(text, who, src){
    const d = document.createElement("div");
    d.className = "pimbot-m " + (who === "me" ? "pimbot-me" : "pimbot-bot");
    d.textContent = text;
    if (src) {
      const s = document.createElement("span");
      s.className = "pimbot-src";
      s.textContent = src;
      d.appendChild(s);
    }
    $("pimbot-log").appendChild(d);
    $("pimbot-log").scrollTop = $("pimbot-log").scrollHeight;
    return d;
  }

  async function send(){
    const t = $("pimbot-q").value.trim();
    if (!t) return;
    $("pimbot-q").value = "";
    say(t, "me");
    const holder = say("กำลังค้นข้อมูล...", "bot");
    try {
      const { answer, refs } = await askBot(t);
      holder.textContent = answer;
      const s = document.createElement("span");
      s.className = "pimbot-src";
      s.textContent = refs;
      holder.appendChild(s);
    } catch (e) {
      const m = e.message || String(e);
      holder.textContent =
          m.includes("429") ? "ตอนนี้มีผู้ใช้งานมาก กรุณารอสักครู่แล้วถามใหม่"
        : m.includes("401") || m.includes("403") ? "ระบบยังตั้งค่าไม่ครบ กรุณาแจ้งผู้ดูแล"
        : "เกิดข้อผิดพลาด\n\n" + m;
    }
  }

  $("pimbot-btn").addEventListener("click", () => {
    const open = $("pimbot-panel").classList.toggle("pimbot-open");
    if (open) $("pimbot-q").focus();
  });
  $("pimbot-close").addEventListener("click", () =>
    $("pimbot-panel").classList.remove("pimbot-open"));
  $("pimbot-send").addEventListener("click", send);
  $("pimbot-q").addEventListener("keydown", e => { if (e.key === "Enter") send(); });
  document.querySelectorAll("#pimbot-chips span").forEach(el =>
    el.addEventListener("click", () => { $("pimbot-q").value = el.textContent; send(); }));

})();
