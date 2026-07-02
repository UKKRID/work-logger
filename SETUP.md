# 🚀 Work Logger - Setup Guide

## โหมด Local (ไม่ต้องตั้งค่า)
```bash
cd ~/work-logger
python3 app.py
```
เปิด http://127.0.0.1:5001

---

## โหมด Cloud (Supabase) - แนะนำ!

### ขั้นตอนที่ 1: สร้าง Supabase Account
1. ไปที่ https://supabase.com
2. คลิก **Start your project** → สมัครด้วย GitHub
3. สร้าง New Project
   - Name: `work-logger`
   - Database Password: ตั้งรหัสผ่าน
   - Region: `Southeast Asia (Singapore)`

### ขั้นตอนที่ 2: สร้าง Database Schema
1. ใน Supabase Dashboard ไปที่ **SQL Editor**
2. คัดลอกโค้ดจาก `supabase-schema.sql`
3. วางแล้วคลิก **Run**

### ขั้นตอนที่ 3: สร้าง Storage Bucket
1. ไปที่ **Storage** → **New Bucket**
2. Name: `worklog-images`
3. ติ๊ก **Public bucket**
4. คลิก **Create bucket**

### ขั้นตอนที่ 4: คัดลอก API Key
1. ไปที่ **Settings** → **API**
2. คัดลอก:
   - **Project URL** (เช่น `https://xxxxx.supabase.co`)
   - **anon public** key

### ขั้นตอนที่ 5: ตั้งค่า .env
```bash
cd ~/work-logger
cp .env.example .env
```
แก้ไขไฟล์ `.env`:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### ขั้นตอนที่ 6: รัน App
```bash
python3 app.py
```

---

## 📱 ใช้งานข้ามเครื่อง

1. **เครื่อง A**: รัน app แล้วบันทึกข้อมูล
2. **เครื่อง B**: ตั้งค่า .env เดียวกัน แล้วรัน app
3. ข้อมูลจะ sync อัตโนมัติ!

---

## 💰 ค่าใช้จ่าย (Free Tier)

| บริการ | Free Tier |
|--------|-----------|
| Database | 500 MB |
| Storage | 1 GB |
| Bandwidth | 2 GB/month |
| API Requests | 500,000/month |

---

## 🔧 คำสั่งมีประโยชน์

```bash
# ดูข้อมูลใน Supabase
curl -H "apikey: YOUR_KEY" https://xxxxx.supabase.co/rest/v1/worklog

# ลบข้อมูลทั้งหมด
curl -X DELETE -H "apikey: YOUR_KEY" "https://xxxxx.supabase.co/rest/v1/worklog?id=not.is.null"
```
