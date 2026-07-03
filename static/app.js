// API Base URL
const API_BASE = '';

const apiFetch = (url, opts = {}) => {
    opts.credentials = 'same-origin';
    return fetch(url, opts);
};

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const pageTitle = document.getElementById('pageTitle');
const addNewBtn = document.getElementById('addNewBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const cancelBtn = document.getElementById('cancelBtn');
const entryForm = document.getElementById('entryForm');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const aiSearchInput = document.getElementById('aiSearchInput');
const aiSearchBtn = document.getElementById('aiSearchBtn');
const imageInput = document.getElementById('imageInput');
const imageUploadArea = document.getElementById('imageUploadArea');
const imagePreview = document.getElementById('imagePreview');

// State
let currentView = 'dashboard';
let editingEntryId = null;
let selectedImages = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadUserInfo();
    loadStatus();
    loadStats();
    loadRecentEntries();
    setupEventListeners();
    updateDateTime();
    setInterval(updateDateTime, 1000);
});

// Load User Info
async function loadUserInfo() {
    try {
        const res = await apiFetch('/api/auth/me');
        const data = await res.json();
        if (!data.logged_in) {
            window.location.href = '/login';
            return;
        }
        document.getElementById('userDisplay').textContent = data.display_name || data.username;
    } catch (e) {
        window.location.href = '/login';
    }
}

// Logout
async function doLogout() {
    try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
    } catch (e) {}
}

// Update Date & Time
function updateDateTime() {
    const now = new Date();
    const dateEl = document.getElementById('currentDate');
    const timeEl = document.getElementById('currentTime');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Load Sync Status
async function loadStatus() {
    try {
        const res = await apiFetch(`${API_BASE}/api/status`);
        const status = await res.json();
        const syncEl = document.getElementById('syncStatus');
        
        if (status.mode === 'supabase') {
            syncEl.className = 'sync-status online';
            syncEl.innerHTML = '<span class="sync-icon">☁️</span><span class="sync-text">Supabase (Cloud)</span>';
        } else {
            syncEl.className = 'sync-status offline';
            syncEl.innerHTML = '<span class="sync-icon">💾</span><span class="sync-text">Local Mode</span>';
        }
    } catch (error) {
        console.error('Error loading status:', error);
    }
}

// Event Listeners
function setupEventListeners() {
    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            switchView(view);
        });
    });

    // Modal
    addNewBtn.addEventListener('click', () => openModal());
    modalClose.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // Form Submit
    entryForm.addEventListener('submit', handleSubmit);

    // Search & Filter
    searchInput.addEventListener('input', debounce(loadAllEntries, 300));
    categoryFilter.addEventListener('change', loadAllEntries);

    // AI Search
    aiSearchBtn.addEventListener('click', performAISearch);
    aiSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performAISearch();
    });

    // Suggestion Chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            aiSearchInput.value = chip.dataset.query;
            performAISearch();
        });
    });

    // Image Upload
    imageUploadArea.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', handleImageSelect);
    
    // Drag and Drop
    imageUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageUploadArea.classList.add('dragover');
    });
    
    imageUploadArea.addEventListener('dragleave', () => {
        imageUploadArea.classList.remove('dragover');
    });
    
    imageUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        imageUploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleImageFiles(files);
        }
    });
}

// Image Upload Handlers
function handleImageSelect(e) {
    handleImageFiles(e.target.files);
}

function handleImageFiles(files) {
    for (let file of files) {
        if (file.type.startsWith('image/')) {
            compressAndAdd(file);
        }
    }
}

async function compressAndAdd(file) {
    try {
        const compressed = await compressImageBrowser(file);
        compressed._originalName = file.name;
        compressed._originalSize = file.size;
        selectedImages.push(compressed);
        previewImage(compressed);
    } catch (err) {
        console.error('Compression error:', err);
        selectedImages.push(file);
        previewImage(file);
    }
}

function compressImageBrowser(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                const maxSize = 1200;
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = Math.round(height * maxSize / width);
                        width = maxSize;
                    } else {
                        width = Math.round(width * maxSize / height);
                        height = maxSize;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
                        type: 'image/webp',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, 'image/webp', 0.85);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function previewImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const sizeKB = file.size ? Math.round(file.size / 1024) : '?';
        const div = document.createElement('div');
        div.className = 'image-preview-item';
        div.innerHTML = `
            <img src="${e.target.result}" alt="Preview">
            <span class="image-size-badge">${sizeKB}KB</span>
            <button type="button" class="remove-image" onclick="removeImage(this, '${file.name}')">&times;</button>
        `;
        imagePreview.appendChild(div);
    };
    reader.readAsDataURL(file);
}

function removeImage(btn, fileName) {
    selectedImages = selectedImages.filter(f => f.name !== fileName);
    btn.parentElement.remove();
}

async function uploadImages(entryId, files) {
    const imagesToUpload = files || selectedImages;
    for (let file of imagesToUpload) {
        try {
            const formData = new FormData();
            formData.append('image', file);
            
            const res = await apiFetch(`${API_BASE}/api/entries/${entryId}/images`, {
                method: 'POST',
                credentials: 'same-origin',
                body: formData
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error('Image upload failed:', file.name, err.error || res.status);
            }
        } catch (err) {
            console.error('Image upload error:', file.name, err);
        }
    }
    selectedImages = [];
}

// View Switching
function switchView(view) {
    currentView = view;
    
    // Update nav
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.view === view);
    });
    
    // Update views
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(`${view}View`).classList.add('active');
    
    // Update title
    const titles = {
        dashboard: 'แดชบอร์ด',
        entries: 'รายการทั้งหมด',
        search: 'ค้นหาด้วย AI',
        timeline: 'ไทม์ไลน์'
    };
    pageTitle.textContent = titles[view];
    
    // Load data for view
    if (view === 'entries') loadAllEntries();
    if (view === 'timeline') loadTimeline();
}

// Load Stats
async function loadStats() {
    try {
        const res = await apiFetch(`${API_BASE}/api/stats`);
        const stats = await res.json();
        
        document.getElementById('statTotal').textContent = stats.total;
        document.getElementById('statToday').textContent = stats.today;
        document.getElementById('statCategories').textContent = Object.keys(stats.categories).length;
        
        document.getElementById('totalEntries').textContent = stats.total;
        document.getElementById('todayEntries').textContent = stats.today;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load Recent Entries
async function loadRecentEntries() {
    try {
        const res = await apiFetch(`${API_BASE}/api/entries?limit=5`);
        const entries = await res.json();
        renderEntries(entries, 'recentEntries', true);
    } catch (error) {
        console.error('Error loading recent entries:', error);
    }
}

// Load All Entries
async function loadAllEntries() {
    try {
        const search = searchInput.value;
        const category = categoryFilter.value;
        
        let url = `${API_BASE}/api/entries?limit=50`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (category) url += `&category=${encodeURIComponent(category)}`;
        
        const res = await apiFetch(url);
        const entries = await res.json();
        renderEntries(entries, 'allEntries', false);
    } catch (error) {
        console.error('Error loading entries:', error);
    }
}

// Load Timeline
async function loadTimeline() {
    try {
        const res = await apiFetch(`${API_BASE}/api/entries?limit=100`);
        const entries = await res.json();
        renderTimeline(entries);
    } catch (error) {
        console.error('Error loading timeline:', error);
    }
}

// Render Entries
async function renderEntries(entries, containerId, isCompact = false) {
    const container = document.getElementById(containerId);
    
    if (entries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <p>ยังไม่มีรายการ</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    for (const entry of entries) {
        let imagesHtml = '';
        try {
            const imagesRes = await apiFetch(`${API_BASE}/api/entries/${entry.id}/images`);
            const images = await imagesRes.json();
            if (images.length > 0) {
                imagesHtml = `
                    <div class="entry-images">
                        ${images.map(img => `
                            <img src="${img.url}" alt="" class="entry-image-thumb" onclick="event.stopPropagation(); openImageModal('${img.url}')">
                        `).join('')}
                    </div>
                `;
            }
        } catch (e) {
            console.error('Error loading images:', e);
        }
        
        html += `
            <div class="entry-card${isCompact ? ' clickable' : ''}" data-id="${entry.id}" onclick="${isCompact ? `viewEntryDetail('${entry.id}')` : ''}">
                <div class="entry-header">
                    <h3 class="entry-title">${escapeHtml(entry.title)}</h3>
                    <span class="entry-category ${entry.category}">${getCategoryLabel(entry.category)}</span>
                </div>
                ${!isCompact && entry.description ? `
                    <p class="entry-description">${escapeHtml(entry.description)}</p>
                ` : ''}
                ${isCompact && entry.description ? `
                    <p class="entry-description compact">${escapeHtml(entry.description.substring(0, 80))}${entry.description.length > 80 ? '...' : ''}</p>
                ` : ''}
                <div class="entry-meta">
                    <span>📅 ${formatDate(entry.created_at)}</span>
                    <span>🕐 ${formatTime(entry.created_at)}</span>
                </div>
                ${!isCompact ? renderTags(entry.tags) : ''}
                ${imagesHtml}
                ${!isCompact ? `
                    <div class="entry-actions">
                        <button class="btn-icon" onclick="event.stopPropagation(); editEntry('${entry.id}')" title="แก้ไข">✏️</button>
                        <button class="btn-icon danger" onclick="event.stopPropagation(); deleteEntry('${entry.id}')" title="ลบ">🗑️</button>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// View Entry Detail Modal
async function viewEntryDetail(id) {
    try {
        const res = await apiFetch(`${API_BASE}/api/entries`);
        const entries = await res.json();
        const entry = entries.find(e => e.id === id);
        if (!entry) return;

        let imagesHtml = '';
        try {
            const imagesRes = await apiFetch(`${API_BASE}/api/entries/${id}/images`);
            const images = await imagesRes.json();
            if (images.length > 0) {
                imagesHtml = `
                    <div class="detail-images">
                        ${images.map(img => `
                            <img src="${img.url}" alt="" class="detail-image" onclick="openImageModal('${img.url}')">
                        `).join('')}
                    </div>
                `;
            }
        } catch (e) {}

        let tagsHtml = '';
        try {
            const tags = JSON.parse(entry.tags || '[]');
            if (tags.length > 0) {
                tagsHtml = `<div class="entry-tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
            }
        } catch (e) {}

        const modal = document.createElement('div');
        modal.className = 'detail-modal-overlay active';
        modal.innerHTML = `
            <div class="detail-modal">
                <div class="detail-modal-header">
                    <h2>${escapeHtml(entry.title)}</h2>
                    <span class="entry-category ${entry.category}">${getCategoryLabel(entry.category)}</span>
                </div>
                <div class="detail-modal-meta">
                    <span>📅 ${formatFullDate(entry.created_at)}</span>
                    <span>🕐 ${formatTime(entry.created_at)}</span>
                </div>
                ${entry.description ? `<p class="detail-modal-desc">${escapeHtml(entry.description)}</p>` : ''}
                ${tagsHtml}
                ${imagesHtml}
                <div class="detail-modal-actions">
                    <button class="btn btn-secondary" onclick="this.closest('.detail-modal-overlay').remove()">ปิด</button>
                    <button class="btn btn-primary" onclick="this.closest('.detail-modal-overlay').remove(); editEntry('${entry.id}')">แก้ไข</button>
                </div>
            </div>
        `;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error loading entry detail:', error);
    }
}

// Render Timeline
function renderTimeline(entries) {
    const container = document.getElementById('timelineContainer');
    
    if (entries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <p>ยังไม่มีรายการในไทม์ไลน์</p>
            </div>
        `;
        return;
    }
    
    // Group by date
    const grouped = entries.reduce((acc, entry) => {
        const date = entry.created_at.split('T')[0];
        if (!acc[date]) acc[date] = [];
        acc[date].push(entry);
        return acc;
    }, {});
    
    container.innerHTML = Object.entries(grouped).map(([date, entries]) => `
        <div class="timeline-date">
            <div class="timeline-date-header">${formatFullDate(date)}</div>
            <div class="entries-list">
                ${entries.map(entry => `
                    <div class="entry-card clickable" onclick="viewEntryDetail('${entry.id}')">
                        <div class="entry-header">
                            <h3 class="entry-title">${escapeHtml(entry.title)}</h3>
                            <span class="entry-category ${entry.category}">${getCategoryLabel(entry.category)}</span>
                        </div>
                        <p class="entry-description">${escapeHtml(entry.description || '')}</p>
                        <div class="entry-meta">
                            <span>🕐 ${formatTime(entry.created_at)}</span>
                        </div>
                        ${renderTags(entry.tags)}
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Render Tags
function renderTags(tagsStr) {
    try {
        const tags = JSON.parse(tagsStr || '[]');
        if (tags.length === 0) return '';
        return `
            <div class="entry-tags">
                ${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
        `;
    } catch {
        return '';
    }
}

// AI Search
async function performAISearch() {
    const query = aiSearchInput.value.trim();
    if (!query) return;
    
    const searchBtn = aiSearchBtn;
    const originalText = searchBtn.textContent;
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="spinner"></span>';
    
    const resultsContainer = document.getElementById('aiResults');
    resultsContainer.innerHTML = '<div class="loading-state"><span class="spinner large"></span><p>กำลังค้นหา...</p></div>';
    
    try {
        const res = await apiFetch(`${API_BASE}/api/search/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        const results = await res.json();
        
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p>ไม่พบผลลัพธ์ที่ตรงกัน</p>
                </div>
            `;
            return;
        }
        
        resultsContainer.innerHTML = results.map(entry => `
            <div class="ai-result-item">
                <div class="ai-result-score">ความเกี่ยวข้อง: ${Math.round(entry.relevance_score * 100)}%</div>
                <div class="entry-card clickable" onclick="viewEntryDetail('${entry.id}')">
                    <div class="entry-header">
                        <h3 class="entry-title">${escapeHtml(entry.title)}</h3>
                        <span class="entry-category ${entry.category}">${getCategoryLabel(entry.category)}</span>
                    </div>
                    <p class="entry-description">${escapeHtml(entry.description || '')}</p>
                    <div class="entry-meta">
                        <span>📅 ${formatDate(entry.created_at)}</span>
                        <span>🕐 ${formatTime(entry.created_at)}</span>
                    </div>
                    ${renderTags(entry.tags)}
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error performing AI search:', error);
        resultsContainer.innerHTML = '<p style="color: var(--danger);">เกิดข้อผิดพลาดในการค้นหา</p>';
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = originalText;
    }
}

// Modal Functions
function openModal(entry = null) {
    if (!editingEntryId) {
        editingEntryId = entry ? entry.id : null;
    }
    document.getElementById('modalTitle').textContent = editingEntryId ? 'แก้ไขรายการ' : 'สร้างรายการใหม่';
    selectedImages = [];
    imagePreview.innerHTML = '';
    
    if (entry && entry.id) {
        document.getElementById('entryId').value = entry.id;
        document.getElementById('entryTitle').value = entry.title || '';
        document.getElementById('entryDescription').value = entry.description || '';
        document.getElementById('entryCategory').value = entry.category || 'work';
        try {
            document.getElementById('entryTags').value = JSON.parse(entry.tags || '[]').join(', ');
        } catch(e) {
            document.getElementById('entryTags').value = '';
        }
        if (editingEntryId) loadExistingImages(editingEntryId);
    } else {
        entryForm.reset();
        document.getElementById('entryId').value = '';
    }
    
    modalOverlay.classList.add('active');
}

async function loadExistingImages(entryId) {
    try {
        const res = await apiFetch(`${API_BASE}/api/entries/${entryId}/images`);
        const images = await res.json();
        if (images.length > 0) {
            images.forEach(img => {
                const div = document.createElement('div');
                div.className = 'image-preview-item existing';
                div.dataset.imageId = img.id;
                div.innerHTML = `
                    <img src="${img.url}" alt="${img.original_name || ''}">
                    <button type="button" class="remove-image" onclick="deleteExistingImage(this, '${img.id}', '${entryId}')" title="ลบรูปนี้">&times;</button>
                `;
                imagePreview.appendChild(div);
            });
        }
    } catch (e) {
        console.error('Error loading existing images:', e);
    }
}

async function deleteExistingImage(btn, imageId, entryId) {
    if (!confirm('ลบรูปนี้จริงหรือไม่?')) return;
    try {
        const res = await apiFetch(`${API_BASE}/api/images/${imageId}`, { method: 'DELETE' });
        if (res.ok) {
            btn.parentElement.remove();
        }
    } catch (e) {
        console.error('Error deleting image:', e);
    }
}

function closeModal() {
    modalOverlay.classList.remove('active');
    editingEntryId = null;
    selectedImages = [];
    imagePreview.innerHTML = '';
    entryForm.reset();
}

// Image Modal
function openImageModal(url) {
    const modal = document.createElement('div');
    modal.className = 'image-modal-overlay active';
    modal.innerHTML = `
        <div class="image-modal-content">
            <img src="${url}" alt="Full size image">
        </div>
        <button class="image-modal-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
}

// Form Submit
async function handleSubmit(e) {
    e.preventDefault();
    
    const submitBtn = entryForm.querySelector('button[type="submit"]');
    const cancelBtnEl = document.getElementById('cancelBtn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    cancelBtnEl.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> กำลังบันทึก...';
    
    const data = {
        title: document.getElementById('entryTitle').value,
        description: document.getElementById('entryDescription').value,
        category: document.getElementById('entryCategory').value,
        tags: document.getElementById('entryTags').value.split(',').map(t => t.trim()).filter(t => t)
    };
    
    const imagesToUpload = [...selectedImages];
    selectedImages = [];
    imagePreview.innerHTML = '';
    
    try {
        let res;
        const putUrl = editingEntryId ? `${API_BASE}/api/entries/${editingEntryId}` : `${API_BASE}/api/entries`;
        const putMethod = editingEntryId ? 'PUT' : 'POST';
        console.log(`[DEBUG] editingEntryId = "${editingEntryId}" (type: ${typeof editingEntryId})`);
        console.log(`[DEBUG] ${putMethod} ${putUrl}`, data);
        
        res = await apiFetch(putUrl, {
            method: putMethod,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        console.log(`[DEBUG] Response: ${res.status} ${res.statusText}`);
        const responseText = await res.text();
        console.log(`[DEBUG] Body: ${responseText}`);
        
        if (!res.ok) {
            alert('บันทึกล้มเหลว! Status: ' + res.status + '\n' + responseText);
            return;
        }
        
        const entry = JSON.parse(responseText);
        console.log(`[DEBUG] Entry ID: ${entry.id}`);
        
        if (imagesToUpload.length > 0) {
            submitBtn.innerHTML = '<span class="spinner"></span> กำลังอัพรูป...';
            await uploadImages(entry.id, imagesToUpload);
        }
        
        closeModal();
        loadStats();
        if (currentView === 'dashboard') loadRecentEntries();
        if (currentView === 'entries') loadAllEntries();
        if (currentView === 'timeline') loadTimeline();
        
    } catch (error) {
        console.error('[DEBUG] Catch error:', error);
        alert('เกิดข้อผิดพลาด: ' + error.message + '\n' + error.stack);
    } finally {
        submitBtn.disabled = false;
        cancelBtnEl.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// Edit Entry
async function editEntry(id) {
    editingEntryId = id;
    try {
        const res = await apiFetch(`${API_BASE}/api/entries?limit=50`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const entries = await res.json();
        const entry = entries.find(e => e.id === id);
        if (entry) {
            openModal(entry);
        } else {
            openModal({ id: id, title: '', description: '', category: 'work', tags: '[]' });
        }
    } catch (error) {
        console.error('Error fetching entry:', error);
        openModal({ id: id, title: '', description: '', category: 'work', tags: '[]' });
    }
}

// Delete Entry
async function deleteEntry(id) {
    if (!confirm('คุณต้องการลบรายการนี้หรือไม่?')) return;
    
    try {
        const res = await apiFetch(`${API_BASE}/api/entries/${id}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            loadStats();
            if (currentView === 'dashboard') loadRecentEntries();
            if (currentView === 'entries') loadAllEntries();
            if (currentView === 'timeline') loadTimeline();
        }
    } catch (error) {
        console.error('Error deleting entry:', error);
    }
}

// Helper Functions
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function getCategoryLabel(category) {
    const labels = {
        work: 'งาน',
        meeting: 'ประชุม',
        project: 'โปรเจค',
        personal: 'ส่วนตัว',
        general: 'ทั่วไป'
    };
    return labels[category] || category;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
