# JobThai Scraper

ระบบ scraping ตำแหน่งงานจาก JobThai.com โดยใช้ Ulixee Hero framework พร้อมระบบ parallel workers


⚙️ เบื้องหลังการทำงาน ระบบนี้ใช้ Ulixee framework ซึ่งประกอบด้วย:

@ulixee/cloud: รัน server จำลอง browser แบบ headless

@ulixee/hero: เป็นเบราว์เซอร์ automation agent ทำงานกับ session จริง

ดึง HTML จากหน้าเว็บ → ดึง JobThaiId แต่ละตัว → ดึง html แต่ละ ID → บันทึกลงไฟล์ JSON แบบ real-time

ทุก worker มี browser environment แยกกัน และจัดการคิวงานแบบ parallel



## Features

- 🔍 รองรับการค้นหาด้วย keyword หรือสายรถไฟฟ้า/BRT
- 👷 Parallel workers สำหรับการ scrape ที่รวดเร็ว
- 💾 บันทึก JSON แบบ real-time (ไม่สูญเสียข้อมูลหาก crash)
- 🔄 ระบบ retry อัตโนมัติ
- 📊 แสดงสถิติการทำงานแบบ real-time
- 📄 คำนวณจำนวนหน้าอัตโนมัติด้วย `get-pages`

## Requirements

- Node.js 18+
- npm หรือ yarn

## Installation

```bash
# Clone หรือ download โปรเจค
cd nodeJS_pull_scrape

# ติดตั้ง dependencies
npm install
```

## Configuration

### โครงสร้าง config.json

```json
{
  "searchMode": "keyword",      // เลือก "keyword" หรือ "bts_mrt"
  "keyword": "ไอที",            // ใช้เมื่อ searchMode = "keyword"
  "bts_mrt": "รถไฟฟ้า-และ-BRT", // ใช้เมื่อ searchMode = "bts_mrt"
  "workers": 3,
  "output": "./output/jobs.json",
  "delay": {
    "min": 1000,
    "max": 3000
  },
  "cloudHost": "ws://localhost:1818",
  "maxPages": 0,
  "retryAttempts": 3
}
```

### Configuration Options

| Option | Description |
|--------|-------------|
| `searchMode` | โหมดการค้นหา: `"keyword"` หรือ `"bts_mrt"` |
| `keyword` | คำค้นหา (ใช้เมื่อ searchMode: "keyword") |
| `bts_mrt` | ชื่อสายรถไฟฟ้า (ใช้เมื่อ searchMode: "bts_mrt") |
| `workers` | จำนวน parallel workers |
| `output` | path ไฟล์ JSON output |
| `delay.min/max` | delay ระหว่าง requests (ms) |
| `maxPages` | จำนวนหน้าสูงสุด (0 = ไม่จำกัด) |
| `retryAttempts` | จำนวนครั้งที่ retry เมื่อ error |

### Search Modes

#### 1. Keyword Mode (ค้นหาด้วยคำค้นหา)

```json
{
  "searchMode": "keyword",
  "keyword": "ไอที",
  ...
}
```

URL ที่ใช้: `https://www.jobthai.com/th/jobs?keyword=ไอที`

ตัวอย่าง keyword:
- `"ไอที"` - งาน IT
- `"บัญชี"` - งานบัญชี
- `"วิศวกร"` - งานวิศวกร
- `"Digital Marketing"` - งาน Digital Marketing

#### 2. BTS/MRT Mode (ค้นหาตามสายรถไฟฟ้า)

```json
{
  "searchMode": "bts_mrt",
  "bts_mrt": "รถไฟฟ้า-และ-BRT",
  ...
}
```

URL ที่ใช้: `https://www.jobthai.com/หางาน/รถไฟฟ้า-และ-BRT`

ตัวอย่างค่า bts_mrt:
- `"รถไฟฟ้า-และ-BRT"` - ทุกสายรถไฟฟ้าและ BRT
- `"BTS-สายสุขุมวิท"` - BTS สายสุขุมวิท
- `"BTS-สายสีลม"` - BTS สายสีลม
- `"MRT-สายสีน้ำเงิน"` - MRT สายสีน้ำเงิน

## Usage

### 1. เริ่ม Ulixee Cloud Server (Terminal 1)

```bash
npm run cloud
```

รอจนเห็นข้อความ "Cloud server is running"

### 2. คำนวณจำนวนหน้าอัตโนมัติ (Optional)

ก่อนรัน scraper สามารถใช้คำสั่ง `get-pages` เพื่อคำนวณจำนวนหน้าทั้งหมดและอัปเดต `maxPages` ใน config.json อัตโนมัติ:

```bash
npm run get-pages
```

**วิธีการทำงาน:**
1. อ่านค่า `searchMode` และ `keyword`/`bts_mrt` จาก config.json
2. เข้าหน้าค้นหางานของ JobThai
3. กดปุ่ม "ถัดไป" (›) ไปเรื่อยๆ จนกว่าจะไม่มีปุ่มกด
4. นับจำนวนหน้าทั้งหมดและอัปเดต `maxPages` ใน config.json

**ตัวอย่าง output:**
```
📖 Reading config.json...
   Search Mode: keyword
   Keyword: ไอที
   Current maxPages: 0

🔍 Search URL: https://www.jobthai.com/th/jobs?keyword=%E0%B9%84%E0%B8%AD%E0%B8%97%E0%B8%B5

🚀 Connecting to Ulixee Cloud...
🌐 Navigating to JobThai...

📊 Total jobs found: 220
📄 Initial pages detected from pagination: 5

🔄 Counting pages by clicking "Next" button...
   📄 Page 1
   📄 Page 2
   ...
   📄 Page 11
   ✅ Reached last page (no more "Next" button)

📄 Total pages counted: 11

💾 Updating config.json with maxPages: 11

✅ Config updated successfully!
==================================================
   maxPages: 11
   Total jobs: 220
==================================================
```

### 3. เริ่ม Scraper (Terminal 2)

```bash
npm run scrape
# หรือ
npm start
```

### ตัวอย่างการใช้งาน

**ค้นหางาน IT ทั้งหมด:**
```json
{
  "searchMode": "keyword",
  "keyword": "ไอที",
  "maxPages": 5,
  "workers": 3
}
```

**ค้นหางานใกล้รถไฟฟ้า:**
```json
{
  "searchMode": "bts_mrt",
  "bts_mrt": "รถไฟฟ้า-และ-BRT",
  "maxPages": 3,
  "workers": 5
}
```

## Output

ข้อมูลจะถูกบันทึกใน `output/jobs.json`:

```json
{
  "metadata": {
    "totalJobs": 100,
    "lastUpdated": "2025-12-02T05:00:00.000Z",
    "version": "1.0.0"
  },
  "jobs": [
    {
      "id": "123456",
      "title": "IT Support",
      "company": "บริษัท ABC จำกัด",
      "companyLogo": "https://...",
      "location": "กรุงเทพมหานคร",
      "salary": "25,000 - 35,000 บาท",
      "description": "...",
      "requirements": "...",
      "benefits": "...",
      "jobUrl": "https://www.jobthai.com/th/job/123456",
      "postedDate": "2 ธ.ค. 68",
      "scrapedAt": "2025-12-02T05:00:00.000Z"
    }
  ]
}
```

## Project Structure

```
nodeJS_pull_scrape/
├── package.json
├── config.json
├── README.md
├── src/
│   ├── index.js           # Main entry point
│   ├── cloud-server.js    # Ulixee Cloud server
│   ├── scraper.js         # Main scraper logic
│   ├── worker.js          # Parallel worker
│   ├── queue.js           # Job queue management
│   ├── get-pages.js       # คำนวณจำนวนหน้าและอัปเดต config
│   └── utils/
│       ├── parser.js      # HTML parsing
│       └── file-handler.js # JSON file operations
└── output/
    └── jobs.json          # Scraped data
```

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run cloud` | เริ่ม Ulixee Cloud Server |
| `npm run get-pages` | คำนวณจำนวนหน้าและอัปเดต maxPages ใน config.json |
| `npm run scrape` | เริ่ม scraper |
| `npm start` | เหมือน `npm run scrape` |

## License

MIT

