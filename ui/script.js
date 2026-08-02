(function() {
  // --- Navigation ---
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const pageName = item.dataset.page;
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      pages.forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${pageName}`).classList.add('active');
    });
  });

  // --- Backend API (pywebview) ---
  const api = window.pywebview.api;

  // --- File list rendering (cards) ---
  const filesContainer = document.getElementById('filesContainer');
  const emptyState = document.getElementById('emptyState');
  const refreshBtn = document.getElementById('refreshFilesBtn');

  async function loadFiles() {
    try {
      const files = await api.getFiles();
      renderFiles(files || []);
    } catch (err) {
      showToast('Failed to load vault: ' + err.message, 'error');
      renderFiles([]);
    }
  }

  function renderFiles(files) {
    filesContainer.innerHTML = '';
    if (!files.length) {
      filesContainer.innerHTML = `
        <div class="empty-vault">
          <div class="empty-icon">🔒</div>
          <p>The vault is empty</p>
          <p class="sub">Encrypt files to see them here</p>
        </div>`;
      return;
    }
    files.forEach(file => {
      const card = document.createElement('div');
      card.className = 'file-card';
      const icon = getIcon(file.mimeType);
      card.innerHTML = `
        <div class="file-icon-large">${icon}</div>
        <div class="file-name" title="${escapeHtml(file.originalName)}">${escapeHtml(file.originalName)}</div>
        <div class="file-meta">
          <span>${escapeHtml(file.mimeType || 'unknown')}</span>
          <span>${formatSize(file.size)}</span>
        </div>
        <div class="file-actions">
          <button class="icon-btn view" data-id="${file.id}" title="Open">👁️</button>
          <button class="icon-btn" data-id="${file.id}" title="Delete">🗑️</button>
        </div>
      `;
      filesContainer.appendChild(card);
    });

    // Event delegation for file actions
    filesContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const fileId = btn.dataset.id;
      if (btn.classList.contains('view')) {
        openFileViewer(fileId);
      } else {
        deleteFile(fileId);
      }
    });
  }

  function getIcon(mime) {
    if (!mime) return '📄';
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.startsWith('text/')) return '📝';
    if (mime.includes('pdf')) return '📕';
    return '📦';
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B','KB','MB','GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length-1) {
      bytes /= 1024;
      i++;
    }
    return bytes.toFixed(1) + ' ' + units[i];
  }

  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  // --- Encrypt page ---
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const selectedFilesContainer = document.getElementById('selectedFilesContainer');
  const selectedFilesList = document.getElementById('selectedFilesList');
  const encryptBtn = document.getElementById('encryptBtn');
  const progressWrapper = document.getElementById('progressWrapper');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  let selectedPaths = [];

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    fileInput.click(); // rely on Python file dialog for actual paths
  });

  fileInput.addEventListener('change', async () => {
    try {
      const paths = await api.selectFiles();
      if (paths && paths.length) {
        selectedPaths = paths;
        renderSelectedFiles();
      }
    } catch (err) {
      showToast('File selection error: ' + err.message, 'error');
    }
    fileInput.value = '';
  });

  function renderSelectedFiles() {
    selectedFilesList.innerHTML = selectedPaths.map(p => {
      const name = p.split(/[\\/]/).pop();
      return `<div class="file-chip"><span>📄 ${escapeHtml(name)}</span><span style="opacity:0.6; font-size:0.8rem;">${escapeHtml(p)}</span></div>`;
    }).join('');
    selectedFilesContainer.style.display = 'block';
    encryptBtn.disabled = false;
  }

  encryptBtn.addEventListener('click', async () => {
    if (!selectedPaths.length) return;
    encryptBtn.disabled = true;
    progressWrapper.style.display = 'flex';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    const total = selectedPaths.length;
    let completed = 0;
    for (const path of selectedPaths) {
      try {
        await api.encryptFile(path);
        completed++;
        const pct = Math.round((completed / total) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = pct + '%';
      } catch (err) {
        showToast(`Encryption failed: ${err.message}`, 'error');
      }
    }
    showToast('All files encrypted! 🔒', 'success');
    selectedPaths = [];
    selectedFilesList.innerHTML = '';
    selectedFilesContainer.style.display = 'none';
    progressWrapper.style.display = 'none';
    encryptBtn.disabled = true;
    loadFiles();
  });

  // --- Delete file ---
  async function deleteFile(fileId) {
    if (!confirm('Delete this encrypted file? It will be lost forever.')) return;
    try {
      await api.deleteFile(fileId);
      showToast('File deleted', 'success');
      loadFiles();
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  }

  // --- Viewer Modal ---
  const viewerModal = document.getElementById('viewerModal');
  const viewerContent = document.getElementById('viewerContent');
  const closeViewer = document.getElementById('closeViewer');

  async function openFileViewer(fileId) {
    try {
      const data = await api.decryptFile(fileId);
      displayInViewer(data);
    } catch (err) {
      showToast('Cannot open file: ' + err.message, 'error');
    }
  }

  function displayInViewer(file) {
    viewerContent.innerHTML = `<div class="viewer-filename">${escapeHtml(file.fileName)}</div>`;
    if (file.mimeType?.startsWith('image/')) {
      const img = document.createElement('img');
      img.className = 'viewer-image';
      img.src = `data:${file.mimeType};base64,${file.data}`;
      viewerContent.appendChild(img);
    } else if (file.mimeType?.startsWith('text/') || file.mimeType === 'application/json') {
      const pre = document.createElement('pre');
      pre.className = 'viewer-text';
      pre.textContent = file.data;
      viewerContent.appendChild(pre);
    } else {
      viewerContent.innerHTML += '<p style="color:var(--text-secondary)">Preview not available for this type.</p>';
    }
    viewerModal.classList.add('active');
  }

  closeViewer.addEventListener('click', () => viewerModal.classList.remove('active'));
  viewerModal.addEventListener('click', e => { if (e.target === viewerModal) viewerModal.classList.remove('active'); });

  // --- Toast ---
  function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> ${msg}`;
    document.getElementById('toastContainer').appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // --- Initial load ---
  refreshBtn.addEventListener('click', loadFiles);
  loadFiles();
})();