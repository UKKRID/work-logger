from flask import Flask, render_template, jsonify, request, send_from_directory
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
import sqlite3
import json
from datetime import datetime
import os
import math
from collections import Counter
import re
import uuid
from PIL import Image
import io
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='../static', template_folder='../templates')
SECRET_KEY = os.getenv('SECRET_KEY', 'worklogger-secret-key-change-in-production')
serializer = URLSafeTimedSerializer(SECRET_KEY)

def create_token(user_id, username, display_name):
    return serializer.dumps({'user_id': user_id, 'username': username, 'display_name': display_name})

def verify_token(token):
    try:
        data = serializer.loads(token, max_age=86400)
        return data
    except (BadSignature, SignatureExpired):
        return None

def get_current_user():
    token = request.cookies.get('auth_token')
    if not token:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token:
        return verify_token(token)
    return None

SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', '')
USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_KEY)

DB_PATH = '/tmp/worklog.db'
UPLOAD_FOLDER = '/tmp/uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

MAX_IMAGE_SIZE = 800
IMAGE_QUALITY = 80

def supabase_headers():
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }

def supabase_get(table, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if params:
        url += '?' + '&'.join([f"{k}={v}" for k, v in params.items()])
    resp = requests.get(url, headers=supabase_headers())
    return resp.json() if resp.ok else []

def supabase_insert(table, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.post(url, headers=supabase_headers(), json=data)
    result = resp.json()
    if resp.ok and result:
        return result[0] if isinstance(result, list) else result
    return None

def supabase_update(table, data, match):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    for k, v in match.items():
        url += f"?{k}=eq.{v}"
    resp = requests.patch(url, headers=supabase_headers(), json=data)
    result = resp.json()
    if resp.ok and result:
        return result[0] if isinstance(result, list) else result
    return None

def supabase_delete(table, match):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    for k, v in match.items():
        url += f"?{k}=eq.{v}"
    resp = requests.delete(url, headers=supabase_headers())
    return resp.ok

def supabase_upload(file_path, file_data):
    url = f"{SUPABASE_URL}/storage/v1/object/worklog-images/{file_path}"
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/octet-stream'
    }
    resp = requests.post(url, headers=headers, data=file_data)
    if resp.ok:
        return f"{SUPABASE_URL}/storage/v1/object/public/worklog-images/{file_path}"
    return None

def supabase_delete_file(file_path):
    url = f"{SUPABASE_URL}/storage/v1/object/worklog-images/{file_path}"
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}'
    }
    requests.delete(url, headers=headers)

def compress_image(image_data):
    try:
        img = Image.open(io.BytesIO(image_data))
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        img.thumbnail((MAX_IMAGE_SIZE, MAX_IMAGE_SIZE), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        img.save(buffer, format='WEBP', quality=IMAGE_QUALITY, optimize=True)
        return buffer.getvalue()
    except Exception as e:
        print(f"Image compression error: {e}")
        return image_data

def save_image_local(image_data, entry_id):
    compressed = compress_image(image_data)
    filename = f"{entry_id}_{uuid.uuid4().hex[:8]}.webp"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    with open(filepath, 'wb') as f:
        f.write(compressed)
    return filename

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            display_name TEXT
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS worklog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT DEFAULT 'general',
            tags TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            entry_id INTEGER,
            filename TEXT NOT NULL,
            original_name TEXT,
            file_size INTEGER,
            storage_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (entry_id) REFERENCES worklog(id) ON DELETE CASCADE
        )
    ''')
    conn.commit()
    conn.close()

if not os.path.exists(DB_PATH):
    init_db()

@app.route('/')
def index():
    user = get_current_user()
    if not user:
        return render_template('login.html')
    return render_template('index.html')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({'error': 'กรุณาใส่ username และ password'}), 400
    
    if USE_SUPABASE:
        users = supabase_get('users', {'username': f'eq.{username}', 'password': f'eq.{password}'})
        if users and len(users) > 0:
            user = users[0]
            token = create_token(user['id'], user['username'], user.get('display_name') or user['username'])
            resp = jsonify({'success': True, 'display_name': user.get('display_name') or user['username']})
            resp.set_cookie('auth_token', token, max_age=86400, httponly=False, samesite='Lax')
            return resp
    else:
        conn = get_db()
        user = conn.execute(
            'SELECT * FROM users WHERE username = ? AND password = ?',
            (username, password)
        ).fetchone()
        conn.close()
        if user:
            token = create_token(user['id'], user['username'], user['display_name'] or user['username'])
            resp = jsonify({'success': True, 'display_name': user['display_name'] or user['username']})
            resp.set_cookie('auth_token', token, max_age=86400, httponly=False, samesite='Lax')
            return resp
    
    return jsonify({'error': 'Username หรือ Password ไม่ถูกต้อง'}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    resp = jsonify({'success': True})
    resp.delete_cookie('auth_token')
    return resp

@app.route('/api/auth/me')
def auth_me():
    user = get_current_user()
    if user:
        return jsonify({
            'logged_in': True,
            'username': user['username'],
            'display_name': user.get('display_name') or user['username'],
            'user_id': user['user_id']
        })
    return jsonify({'logged_in': False})

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    display_name = data.get('display_name', '').strip() or username
    
    if not username or not password:
        return jsonify({'error': 'กรุณาใส่ username และ password'}), 400
    
    if USE_SUPABASE:
        existing = supabase_get('users', {'username': f'eq.{username}'})
        if existing and len(existing) > 0:
            return jsonify({'error': 'Username นี้มีอยู่แล้ว'}), 400
        
        user = supabase_insert('users', {
            'username': username,
            'password': password,
            'display_name': display_name
        })
        if user:
            token = create_token(user['id'], user['username'], display_name)
            resp = jsonify({'success': True, 'display_name': display_name})
            resp.set_cookie('auth_token', token, max_age=86400, httponly=False, samesite='Lax')
            return resp
    else:
        conn = get_db()
        existing = conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
        if existing:
            conn.close()
            return jsonify({'error': 'Username นี้มีอยู่แล้ว'}), 400
        
        cursor = conn.execute(
            'INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)',
            (username, password, display_name)
        )
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        
        token = create_token(user_id, username, display_name)
        resp = jsonify({'success': True, 'display_name': display_name})
        resp.set_cookie('auth_token', token, max_age=86400, httponly=False, samesite='Lax')
        return resp
    
    return jsonify({'error': 'เกิดข้อผิดพลาด'}), 500

@app.route('/api/status')
def api_status():
    return jsonify({
        'mode': 'supabase' if USE_SUPABASE else 'local',
        'supabase_configured': USE_SUPABASE
    })

@app.route('/api/entries', methods=['GET'])
def get_entries():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = user['user_id']
    search = request.args.get('search', '')
    category = request.args.get('category', '')
    limit = request.args.get('limit', 50, type=int)
    
    if USE_SUPABASE:
        params = {'order': 'created_at.desc', 'limit': '1000', 'user_id': f'eq.{user_id}'}
        if category:
            params['category'] = f'eq.{category}'
        entries = supabase_get('worklog', params)
        
        if search:
            search_lower = search.lower()
            entries = [
                e for e in entries
                if search_lower in (e.get('title') or '').lower()
                or search_lower in (e.get('description') or '').lower()
                or search_lower in (e.get('tags') or '').lower()
            ]
        
        entries = entries[:limit]
        return jsonify(entries)
    else:
        conn = get_db()
        if search:
            entries = conn.execute(
                'SELECT * FROM worklog WHERE user_id = ? AND (title LIKE ? OR description LIKE ?) ORDER BY created_at DESC LIMIT ?',
                (user_id, f'%{search}%', f'%{search}%', limit)
            ).fetchall()
        elif category:
            entries = conn.execute(
                'SELECT * FROM worklog WHERE user_id = ? AND category = ? ORDER BY created_at DESC LIMIT ?',
                (user_id, category, limit)
            ).fetchall()
        else:
            entries = conn.execute(
                'SELECT * FROM worklog WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                (user_id, limit)
            ).fetchall()
        conn.close()
        return jsonify([dict(row) for row in entries])

@app.route('/api/entries', methods=['POST'])
def create_entry():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = user['user_id']
    data = request.json
    
    if USE_SUPABASE:
        entry = supabase_insert('worklog', {
            'user_id': user_id,
            'title': data['title'],
            'description': data.get('description', ''),
            'category': data.get('category', 'general'),
            'tags': json.dumps(data.get('tags', []))
        })
        return jsonify(entry), 201
    else:
        conn = get_db()
        cursor = conn.execute(
            'INSERT INTO worklog (user_id, title, description, category, tags) VALUES (?, ?, ?, ?, ?)',
            (user_id, data['title'], data.get('description', ''), data.get('category', 'general'), json.dumps(data.get('tags', [])))
        )
        conn.commit()
        entry_id = cursor.lastrowid
        entry = conn.execute('SELECT * FROM worklog WHERE id = ?', (entry_id,)).fetchone()
        conn.close()
        return jsonify(dict(entry)), 201

@app.route('/api/entries/<entry_id>', methods=['PUT'])
def update_entry(entry_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = user['user_id']
    data = request.json
    
    if USE_SUPABASE:
        entry = supabase_update('worklog', {
            'title': data['title'],
            'description': data.get('description', ''),
            'category': data.get('category', 'general'),
            'tags': json.dumps(data.get('tags', []))
        }, {'id': entry_id, 'user_id': user_id})
        return jsonify(entry)
    else:
        conn = get_db()
        conn.execute(
            'UPDATE worklog SET title = ?, description = ?, category = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            (data['title'], data.get('description', ''), data.get('category', 'general'), json.dumps(data.get('tags', [])), entry_id, user_id)
        )
        conn.commit()
        entry = conn.execute('SELECT * FROM worklog WHERE id = ? AND user_id = ?', (entry_id, user_id)).fetchone()
        conn.close()
        return jsonify(dict(entry))

@app.route('/api/entries/<entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = user['user_id']
    
    if USE_SUPABASE:
        images = supabase_get('images', {'entry_id': f'eq.{entry_id}', 'user_id': f'eq.{user_id}'})
        for img in images:
            if img.get('storage_path'):
                supabase_delete_file(img['storage_path'])
        supabase_delete('images', {'entry_id': entry_id, 'user_id': user_id})
        supabase_delete('worklog', {'id': entry_id, 'user_id': user_id})
    else:
        conn = get_db()
        images = conn.execute('SELECT filename FROM images WHERE entry_id = ? AND user_id = ?', (entry_id, user_id)).fetchall()
        for img in images:
            filepath = os.path.join(UPLOAD_FOLDER, img['filename'])
            if os.path.exists(filepath):
                os.remove(filepath)
        conn.execute('DELETE FROM images WHERE entry_id = ? AND user_id = ?', (entry_id, user_id))
        conn.execute('DELETE FROM worklog WHERE id = ? AND user_id = ?', (entry_id, user_id))
        conn.commit()
        conn.close()
    return jsonify({'success': True})

@app.route('/api/entries/<entry_id>/images', methods=['POST'])
def upload_image(entry_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = user['user_id']
    
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No image selected'}), 400
    
    image_data = file.read()
    compressed = compress_image(image_data)
    
    if USE_SUPABASE:
        filename = f"{user_id}_{entry_id}_{uuid.uuid4().hex[:8]}.webp"
        url = supabase_upload(filename, compressed)
        if url:
            entry = supabase_insert('images', {
                'user_id': user_id,
                'entry_id': entry_id,
                'filename': filename,
                'original_name': file.filename,
                'file_size': len(compressed),
                'storage_path': filename
            })
            return jsonify({
                'id': entry['id'],
                'filename': filename,
                'url': url
            }), 201
    else:
        filename = save_image_local(compressed, entry_id)
        conn = get_db()
        cursor = conn.execute(
            'INSERT INTO images (user_id, entry_id, filename, original_name, file_size) VALUES (?, ?, ?, ?, ?)',
            (user_id, entry_id, filename, file.filename, os.path.getsize(os.path.join(UPLOAD_FOLDER, filename)))
        )
        conn.commit()
        image_id = cursor.lastrowid
        conn.close()
        return jsonify({
            'id': image_id,
            'filename': filename,
            'url': f'/uploads/{filename}'
        }), 201

@app.route('/api/entries/<entry_id>/images', methods=['GET'])
def get_entry_images(entry_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = user['user_id']
    
    if USE_SUPABASE:
        images = supabase_get('images', {'entry_id': f'eq.{entry_id}', 'user_id': f'eq.{user_id}', 'order': 'created_at'})
        for img in images:
            if img.get('storage_path'):
                img['url'] = f"{SUPABASE_URL}/storage/v1/object/public/worklog-images/{img['storage_path']}"
        return jsonify(images)
    else:
        conn = get_db()
        images = conn.execute('SELECT * FROM images WHERE entry_id = ? AND user_id = ? ORDER BY created_at', (entry_id, user_id)).fetchall()
        conn.close()
        result = []
        for img in images:
            result.append({
                'id': img['id'],
                'filename': img['filename'],
                'url': f'/uploads/{img["filename"]}',
                'original_name': img['original_name'],
                'file_size': img['file_size']
            })
        return jsonify(result)

@app.route('/api/images/<image_id>', methods=['DELETE'])
def delete_image(image_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = user['user_id']
    
    if USE_SUPABASE:
        image = supabase_get('images', {'id': f'eq.{image_id}', 'user_id': f'eq.{user_id}'})
        if image and image[0].get('storage_path'):
            supabase_delete_file(image[0]['storage_path'])
        supabase_delete('images', {'id': image_id, 'user_id': user_id})
    else:
        conn = get_db()
        image = conn.execute('SELECT filename FROM images WHERE id = ? AND user_id = ?', (image_id, user_id)).fetchone()
        if image:
            filepath = os.path.join(UPLOAD_FOLDER, image['filename'])
            if os.path.exists(filepath):
                os.remove(filepath)
            conn.execute('DELETE FROM images WHERE id = ? AND user_id = ?', (image_id, user_id))
            conn.commit()
        conn.close()
    return jsonify({'success': True})

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/api/search/ai', methods=['POST'])
def ai_search():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = user['user_id']
    data = request.json
    query = data.get('query', '')
    
    if not query:
        return jsonify([])
    
    if USE_SUPABASE:
        entries = supabase_get('worklog', {'order': 'created_at.desc', 'limit': '1000', 'user_id': f'eq.{user_id}'})
    else:
        conn = get_db()
        entries = conn.execute('SELECT * FROM worklog WHERE user_id = ? ORDER BY created_at DESC', (user_id,)).fetchall()
        entries = [dict(row) for row in entries]
        conn.close()
    
    if not entries:
        return jsonify([])
    
    query_lower = query.lower()
    query_tokens = set(re.findall(r'[\w\u0E00-\u0E7F]+', query_lower))
    
    scored = []
    for entry in entries:
        try:
            tags = json.loads(entry['tags']) if entry['tags'] else []
            tags_text = ' '.join(tags) if isinstance(tags, list) else str(tags)
        except:
            tags_text = str(entry.get('tags', ''))
        
        text = f"{entry.get('title', '')} {entry.get('description', '')} {entry.get('category', '')} {tags_text}"
        text_lower = text.lower()
        
        score = 0.0
        
        if query_lower in text_lower:
            score += 0.8
        
        entry_tokens = set(re.findall(r'[\w\u0E00-\u0E7F]+', text_lower))
        overlap = query_tokens & entry_tokens
        if query_tokens:
            score += (len(overlap) / len(query_tokens)) * 0.6
        
        if overlap:
            score += 0.3
        
        title_lower = (entry.get('title') or '').lower()
        for qt in query_tokens:
            if qt in title_lower:
                score += 0.4
        
        if score > 0:
            scored.append((score, entry))
    
    scored.sort(key=lambda x: x[0], reverse=True)
    
    results = []
    for score, entry in scored[:10]:
        entry['relevance_score'] = min(score, 1.0)
        results.append(entry)
    
    return jsonify(results)

@app.route('/api/stats', methods=['GET'])
def get_stats():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = user['user_id']
    
    if USE_SUPABASE:
        entries = supabase_get('worklog', {'select': 'id,category,created_at', 'user_id': f'eq.{user_id}'})
        total = len(entries)
        today = sum(1 for e in entries if e.get('created_at', '').startswith(datetime.now().strftime('%Y-%m-%d')))
        categories = {}
        for e in entries:
            cat = e.get('category', 'general')
            categories[cat] = categories.get(cat, 0) + 1
    else:
        conn = get_db()
        total = conn.execute('SELECT COUNT(*) as count FROM worklog WHERE user_id = ?', (user_id,)).fetchone()['count']
        today = conn.execute(
            "SELECT COUNT(*) as count FROM worklog WHERE user_id = ? AND DATE(created_at) = DATE('now')", (user_id,)
        ).fetchone()['count']
        categories = conn.execute(
            'SELECT category, COUNT(*) as count FROM worklog WHERE user_id = ? GROUP BY category', (user_id,)
        ).fetchall()
        categories = {row['category']: row['count'] for row in categories}
        conn.close()
    
    return jsonify({
        'total': total,
        'today': today,
        'categories': categories
    })

if __name__ == '__main__':
    app.run()
