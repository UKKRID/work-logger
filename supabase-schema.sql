-- Supabase SQL Schema
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)

-- 1. สร้างตาราง worklog
CREATE TABLE IF NOT EXISTS worklog (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    tags JSONB DEFAULT '[]',
    image_urls JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. สร้างตาราง images (ถ้าต้องการเก็บรูปใน Supabase Storage)
CREATE TABLE IF NOT EXISTS images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entry_id UUID REFERENCES worklog(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT,
    file_size INTEGER,
    storage_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. สร้าง Index สำหรับค้นหา
CREATE INDEX IF NOT EXISTS idx_worklog_category ON worklog(category);
CREATE INDEX IF NOT EXISTS idx_worklog_created ON worklog(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_entry ON images(entry_id);

-- 4. สร้าง Storage Bucket สำหรับรูป
INSERT INTO storage.buckets (id, name, public) 
VALUES ('worklog-images', 'worklog-images', true)
ON CONFLICT (id) DO NOTHING;

-- 5. ตั้งค่า RLS (Row Level Security) - เปิดให้อ่านเขียนได้ทุกคน (สำหรับ demo)
ALTER TABLE worklog ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- Policy สำหรับ worklog (เปิดทุกคน)
CREATE POLICY "Allow all access to worklog" ON worklog
    FOR ALL USING (true) WITH CHECK (true);

-- Policy สำหรับ images
CREATE POLICY "Allow all access to images" ON images
    FOR ALL USING (true) WITH CHECK (true);

-- Policy สำหรับ storage
CREATE POLICY "Allow public access to worklog-images" ON storage.objects
    FOR SELECT USING (bucket_id = 'worklog-images');

CREATE POLICY "Allow upload to worklog-images" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'worklog-images');

CREATE POLICY "Allow delete from worklog-images" ON storage.objects
    FOR DELETE USING (bucket_id = 'worklog-images');
