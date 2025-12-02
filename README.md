# JobThai Scraper

ระบบ scraping ตำแหน่งงานจาก JobThai.com โดยใช้ Ulixee Hero framework พร้อมระบบ parallel workers

## Features

- 🔍 รองรับการค้นหาด้วย keyword หรือสายรถไฟฟ้า/BRT
- 👷 Parallel workers สำหรับการ scrape ที่รวดเร็ว
- 💾 บันทึก JSON แบบ real-time (ไม่สูญเสียข้อมูลหาก crash)
- 🔄 ระบบ retry อัตโนมัติ
- 📊 แสดงสถิติการทำงานแบบ real-time

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

### 2. เริ่ม Scraper (Terminal 2)

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
│   └── utils/
│       ├── parser.js      # HTML parsing
│       └── file-handler.js # JSON file operations
└── output/
    └── jobs.json          # Scraped data
```

## License

MIT

