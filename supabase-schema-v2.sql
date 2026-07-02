-- Supabase SQL Schema - Multi User Version
-- รันใน Supabase SQL Editor

-- 1. ตารางผู้ใช้
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ตาราง worklog (เพิ่ม user_id)
CREATE TABLE IF NOT EXISTS worklog (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    tags JSONB DEFAULT '[]',
    image_urls JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ตาราง images (เพิ่ม user_id)
CREATE TABLE IF NOT EXISTS images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entry_id UUID REFERENCES worklog(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT,
    file_size INTEGER,
    storage_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_worklog_user ON worklog(user_id);
CREATE INDEX IF NOT EXISTS idx_worklog_category ON worklog(category);
CREATE INDEX IF NOT EXISTS idx_worklog_created ON worklog(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_entry ON images(entry_id);
CREATE INDEX IF NOT EXISTS idx_images_user ON images(user_id);

-- 5. Storage Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('worklog-images', 'worklog-images', true)
ON CONFLICT (id) DO NOTHING;

-- 6. RLS Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE worklog ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to users" ON users
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to worklog" ON worklog
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to images" ON images
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access to worklog-images" ON storage.objects
    FOR SELECT USING (bucket_id = 'worklog-images');

CREATE POLICY "Allow upload to worklog-images" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'worklog-images');

CREATE POLICY "Allow delete from worklog-images" ON storage.objects
    FOR DELETE USING (bucket_id = 'worklog-images');

-- 7. สร้าง admin user (เปลี่ยนรหัสผ่านตามต้องการ)
INSERT INTO users (username, password, display_name)
VALUES ('admin', 'admin123', 'Admin')
ON CONFLICT (username) DO NOTHING;
