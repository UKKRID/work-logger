# Work Logger - บันทึกการทำงานออนไลน์

แอปบันทึกข้อมูลการทำงาน พร้อม AI Search และ Cloud Database

## ฟีเจอร์
- บันทึกข้อมูลพร้อมวันเวลาอัตโนมัติ
- Database ออนไลน์ (Supabase PostgreSQL)
- บีบอัดรูปอัตโนมัติ (WebP)
- AI Search ด้วย TF-IDF
- UI สวยแบบ Dark Theme
- ใช้งานข้ามเครื่องได้

## ตั้งค่า Supabase

1. สร้าง Account ที่ https://supabase.com
2. สร้าง Project ใหม่
3. รัน SQL Schema จาก `supabase-schema.sql`
4. สร้าง Storage Bucket ชื่อ `worklog-images`
5. คัดลอก URL และ Key จาก Settings > API

## ตั้งค่า Environment Variables

```bash
cp .env.example .env
nano .env
```

ใส่:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your_anon_key_here
```

## รัน Local

```bash
pip install -r requirements.txt
python app.py
```

เปิด http://127.0.0.1:5001

## Deploy บน Vercel

1. Push โค้ดขึ้น GitHub
2. เชื่อมต่อกับ Vercel
3. ตั้งค่า Environment Variables ใน Vercel Dashboard
4. Deploy อัตโนมัติ

## โครงสร้างไฟล์

```
├── api/index.py        # Backend (Vercel Serverless)
├── app.py              # Backend (Local)
├── vercel.json         # Vercel Config
├── requirements.txt    # Python Dependencies
├── .env.example        # ตัวอย่าง Config
├── supabase-schema.sql # SQL Schema
├── static/
│   ├── style.css
│   └── app.js
└── templates/
    └── index.html
```

## License

MIT
