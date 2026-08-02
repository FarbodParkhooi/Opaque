(function() {
  document.addEventListener('DOMContentLoaded', function() {
    function startWhenEelReady() {
      if (typeof eel === 'undefined' || !eel.getFiles) {
        setTimeout(startWhenEelReady, 100);
        return;
      }

      // Wrappers
      const getFiles          = async () => await eel.getFiles()();
      const selectFiles       = async () => await eel.selectFiles()();
      const selectFolder      = async () => await eel.selectFolder()();
      const encryptFile       = async (p) => await eel.encryptFile(p);
      const deleteFile        = async (id) => await eel.deleteFile(id);
      const decryptFile       = async (id) => await eel.decryptFile(id)();
      const openFileExternally = async (id) => await eel.openFileExternally(id);
      const exportFile        = async (id) => await eel.exportFile(id)();
      const getPeopleData     = async () => await eel.getPeopleData()();
      const renamePerson      = async (id, name) => await eel.renamePerson(id, name);
      const getMediaForPerson = async (id) => await eel.getMediaForPerson(id)();
      const processNow        = async () => await eel.processNow();

      // Confirm modal
      function showConfirm(message) {
        return new Promise((resolve) => {
          const modal = document.getElementById('confirmModal');
          const msgEl = document.getElementById('confirmMessage');
          const yesBtn = document.getElementById('confirmYes');
          const noBtn = document.getElementById('confirmNo');
          msgEl.textContent = message;
          modal.classList.add('active');
          function cleanup() {
            modal.classList.remove('active');
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
          }
          function onYes() { cleanup(); resolve(true); }
          function onNo() { cleanup(); resolve(false); }
          yesBtn.addEventListener('click', onYes);
          noBtn.addEventListener('click', onNo);
        });
      }

      // Navigation
      document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
          const page = item.dataset.page;
          document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
          item.classList.add('active');
          document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
          document.getElementById('page-' + page).classList.add('active');
        });
      });

      // Helpers
      function getIcon(mime) {
        if (!mime) return '📄';
        if (mime.startsWith('image/')) return '🖼️';
        if (mime.startsWith('video/')) return '🎬';
        if (mime.startsWith('audio/')) return '🎵';
        if (mime.startsWith('text/')) return '📝';
        if (mime.includes('pdf')) return '📕';
        return '📦';
      }
      function formatSize(bytes) {
        if (!bytes) return '0 B';
        const units = ['B','KB','MB','GB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length-1) { bytes /= 1024; i++; }
        return bytes.toFixed(1) + ' ' + units[i];
      }
      function showToast(msg, type='success') {
        const t = document.createElement('div');
        t.className = 'toast ' + type;
        t.textContent = msg;
        document.getElementById('toastContainer').appendChild(t);
        setTimeout(() => t.remove(), 4000);
      }
      function pathBasename(p) { return p.split(/[\\/]/).pop(); }

      // Files
      const filesContainer = document.getElementById('filesContainer');
      const refreshBtn = document.getElementById('refreshFilesBtn');

      async function loadFiles() {
        try {
          const files = await getFiles();
          renderFiles(files || []);
        } catch (err) { showToast('Error loading files', 'error'); }
      }
      function renderFiles(files) {
        filesContainer.innerHTML = '';
        if (!files.length) {
          filesContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><p>The vault is empty</p><p class="sub">Encrypt files to see them here.</p></div>';
          return;
        }
        files.forEach(file => {
          const card = document.createElement('div');
          card.className = 'file-card';
          card.innerHTML = `
            <div class="file-icon">${getIcon(file.mimeType)}</div>
            <div class="file-name" title="${file.originalName}">${file.originalName}</div>
            <div class="file-meta"><span>${file.mimeType||'unknown'}</span><span>${formatSize(file.size)}</span></div>
            <div class="file-actions">
              <button class="icon-btn view" title="View">👁️</button>
              <button class="icon-btn export" title="Export">💾</button>
              <button class="icon-btn delete" title="Delete">🗑️</button>
            </div>`;
          card.querySelector('.view').onclick = async (e) => {
            e.stopPropagation();
            try {
              const data = await decryptFile(file.id);
              displayInViewer(data, file.id);
            } catch (err) { showToast('Cannot open', 'error'); }
          };
          card.querySelector('.export').onclick = async (e) => {
            e.stopPropagation();
            if (!(await showConfirm('Save this file to your computer?'))) return;
            try {
              const ok = await exportFile(file.id);
              showToast(ok ? 'File saved!' : 'Export cancelled', ok ? 'success' : 'error');
            } catch (err) { showToast('Export failed', 'error'); }
          };
          card.querySelector('.delete').onclick = async (e) => {
            e.stopPropagation();
            if (!(await showConfirm('Delete this encrypted file? It cannot be undone.'))) return;
            try {
              await deleteFile(file.id);
              showToast('Deleted', 'success');
              loadFiles();
              loadPeople();
            } catch (err) { showToast('Delete failed', 'error'); }
          };
          filesContainer.appendChild(card);
        });
      }

      // Encrypt page
      const dropzone = document.getElementById('dropzone');
      const selectFolderBtn = document.getElementById('selectFolderBtn');
      const selectedFilesContainer = document.getElementById('selectedFilesContainer');
      const selectedFilesList = document.getElementById('selectedFilesList');
      const encryptBtn = document.getElementById('encryptBtn');
      const progressWrapper = document.getElementById('progressWrapper');
      const progressFill = document.getElementById('progressFill');
      const progressText = document.getElementById('progressText');
      let selectedPaths = [];

      dropzone.addEventListener('click', async () => {
        try {
          const paths = await selectFiles();
          if (paths && paths.length) { selectedPaths = paths; renderSelectedFiles(); }
        } catch (err) { showToast('File selection error', 'error'); }
      });
      selectFolderBtn.addEventListener('click', async () => {
        try {
          const paths = await selectFolder();
          if (paths && paths.length) { selectedPaths = paths; renderSelectedFiles(); }
        } catch (err) { showToast('Folder selection error', 'error'); }
      });
      dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
      dropzone.addEventListener('drop', async e => {
        e.preventDefault(); dropzone.classList.remove('drag-over');
        try {
          const paths = await selectFiles();
          if (paths && paths.length) { selectedPaths = paths; renderSelectedFiles(); }
        } catch (err) { showToast('File selection error', 'error'); }
      });

      function renderSelectedFiles() {
        selectedFilesList.innerHTML = selectedPaths.map(p => {
          const name = pathBasename(p);
          return `<div class="file-chip"><span>📄 ${name}</span><span style="opacity:0.6;font-size:0.75rem;">${p}</span></div>`;
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
            await encryptFile(path);
            completed++;
            const pct = Math.round((completed/total)*100);
            progressFill.style.width = pct+'%';
            progressText.textContent = pct+'%';
          } catch (err) { showToast('Error: '+err, 'error'); completed++; }
        }
        showToast('Encryption complete!', 'success');
        selectedPaths = [];
        selectedFilesList.innerHTML = '';
        selectedFilesContainer.style.display = 'none';
        progressWrapper.style.display = 'none';
        encryptBtn.disabled = true;
        loadFiles();
      });

      // People page
      const peopleContainer = document.getElementById('peopleContainer');
      const processNowBtn = document.getElementById('processNowBtn');
      async function loadPeople() {
        try {
          const people = await getPeopleData();
          renderPeople(people || []);
        } catch (err) { showToast('Failed to load people', 'error'); renderPeople([]); }
      }
      function renderPeople(people) {
        peopleContainer.innerHTML = '';
        if (!people.length) {
          peopleContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>No people detected yet</p><p class="sub">Add images/videos and they will be scanned automatically.</p></div>';
          return;
        }
        people.forEach(person => {
          const card = document.createElement('div');
          card.className = 'person-card';
          card.innerHTML = `
            <img class="person-face" src="${person.faceThumbnail || ''}" alt="${person.name}">
            <div class="person-name">${person.name}</div>
            <div class="person-meta">${person.mediaCount} media files</div>
            <div class="person-actions">
              <button class="icon-btn view-media" title="View media">🖼️</button>
              <button class="icon-btn rename-person" title="Rename">✏️</button>
            </div>`;
          card.addEventListener('click', (e) => {
            if (e.target.closest('.icon-btn')) return;
            openPersonMedia(person.id, person.name);
          });
          card.querySelector('.view-media').addEventListener('click', (e) => {
            e.stopPropagation();
            openPersonMedia(person.id, person.name);
          });
          card.querySelector('.rename-person').addEventListener('click', (e) => {
            e.stopPropagation();
            openRenameModal(person.id, person.name);
          });
          peopleContainer.appendChild(card);
        });
      }

      // Rename modal
      const renameModal = document.getElementById('renameModal');
      const closeRename = document.getElementById('closeRename');
      const renameInput = document.getElementById('renameInput');
      const saveRenameBtn = document.getElementById('saveRenameBtn');
      let currentRenamePersonId = null;
      function openRenameModal(personId, currentName) {
        currentRenamePersonId = personId;
        renameInput.value = currentName;
        renameModal.classList.add('active');
      }
      closeRename.addEventListener('click', () => renameModal.classList.remove('active'));
      saveRenameBtn.addEventListener('click', async () => {
        const newName = renameInput.value.trim();
        if (!newName) { showToast('Name cannot be empty', 'error'); return; }
        try {
          await renamePerson(currentRenamePersonId, newName);
          showToast('Renamed!', 'success');
          renameModal.classList.remove('active');
          loadPeople();
        } catch (err) { showToast('Rename failed: ' + err, 'error'); }
      });

      // Person media modal
      const personMediaModal = document.getElementById('personMediaModal');
      const closePersonMedia = document.getElementById('closePersonMedia');
      const personMediaContent = document.getElementById('personMediaContent');
      closePersonMedia.addEventListener('click', () => personMediaModal.classList.remove('active'));
      personMediaModal.addEventListener('click', e => { if (e.target === personMediaModal) personMediaModal.classList.remove('active'); });
      async function openPersonMedia(personId, personName) {
        try {
          const media = await getMediaForPerson(personId);
          let html = `<h3>${personName} · Media</h3>`;
          if (!media || !media.length) {
            html += '<p style="color:var(--text-muted); margin-top:16px;">No media associated.</p>';
          } else {
            html += '<div class="person-media-grid">';
            media.forEach(file => {
              html += `
                <div class="person-media-item" data-id="${file.id}">
                  <img class="person-media-thumb" src="${getThumb(file)}" alt="${file.originalName}">
                  <div class="person-media-name">${file.originalName}</div>
                </div>`;
            });
            html += '</div>';
          }
          personMediaContent.innerHTML = html;
          personMediaContent.querySelectorAll('.person-media-item').forEach(item => {
            item.addEventListener('click', async () => {
              const fileId = item.dataset.id;
              try {
                const data = await decryptFile(fileId);
                displayInViewer(data, fileId);
                personMediaModal.classList.remove('active');
              } catch (err) { showToast('Cannot open file', 'error'); }
            });
          });
          personMediaModal.classList.add('active');
        } catch (err) { showToast('Failed to load media', 'error'); }
      }
      function getThumb(file) {
        if (file.mimeType && file.mimeType.startsWith('image/')) {
          return `data:${file.mimeType};base64,${file.data}`;
        }
        return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#30363d" width="100" height="100"/><text fill="#8b949e" x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="20">${getIcon(file.mimeType)}</text></svg>`);
      }
      processNowBtn.addEventListener('click', async () => {
        try {
          await processNow();
          showToast('Scan completed!', 'success');
          loadPeople();
          loadFiles();
        } catch (err) { showToast('Scan error: ' + err, 'error'); }
      });

      // ─── Viewer Modal (media stop fix) ───
      const viewerModal = document.getElementById('viewerModal');
      const viewerContent = document.getElementById('viewerContent');
      let activeMedia = null;

      function stopAllMedia() {
        const domMedia = viewerContent.querySelectorAll('audio, video');
        domMedia.forEach(el => {
          el.pause();
          el.removeAttribute('src');
          el.load();
        });
        if (activeMedia) {
          activeMedia.pause();
          activeMedia.removeAttribute('src');
          activeMedia.load();
          activeMedia = null;
        }
      }

      function closeViewerModal() {
        stopAllMedia();
        viewerModal.classList.remove('active');
      }

      document.getElementById('closeViewer').addEventListener('click', closeViewerModal);
      viewerModal.addEventListener('click', function(e) {
        if (e.target === viewerModal) closeViewerModal();
      });
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && viewerModal.classList.contains('active')) {
          closeViewerModal();
        }
      });

      function displayInViewer(file, fileId) {
        closeViewerModal();
        const mime = file.mimeType;
        const dataUrl = `data:${mime};base64,${file.data}`;
        let html = `<div class="viewer-filename">${file.fileName}</div>`;
        if (mime && mime.startsWith('image/')) {
          html += `<img class="viewer-image" src="${dataUrl}">`;
        } else if (mime && mime.startsWith('audio/')) {
          viewerContent.innerHTML = html;
          const playerContainer = createAudioPlayer(dataUrl, file.fileName);
          viewerContent.appendChild(playerContainer);
          viewerModal.classList.add('active');
          return;
        } else if (mime && mime.startsWith('video/')) {
          viewerContent.innerHTML = html;
          const playerContainer = createVideoPlayer(dataUrl, file.fileName);
          viewerContent.appendChild(playerContainer);
          viewerModal.classList.add('active');
          return;
        } else if (mime === 'application/pdf') {
          html += `<div class="pdf-container"><iframe class="viewer-pdf" src="data:application/pdf;base64,${file.data}"></iframe></div>`;
        } else if (mime && (mime.startsWith('text/') || mime === 'application/json')) {
          html += `<div class="text-container"><pre class="viewer-text">${file.data.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></div>`;
        } else {
          html += `<div class="unsupported-container"><div class="unsupported-icon">📦</div><p>Preview not available</p><button class="btn" id="openExternalBtn">🔗 Open with default app</button></div>`;
        }
        viewerContent.innerHTML = html;
        const openBtn = document.getElementById('openExternalBtn');
        if (openBtn) openBtn.addEventListener('click', async () => { await openFileExternally(fileId); closeViewerModal(); });
        viewerModal.classList.add('active');
      }

      // Media players
      function createAudioPlayer(dataUrl, fileName) {
        const container = document.createElement('div');
        container.className = 'custom-player';
        container.innerHTML = `
          <div class="player-header">
            <div class="player-cover">🎵</div>
            <div class="player-title">${fileName}</div>
          </div>
          <div class="player-controls">
            <button class="player-btn play-btn">
              <span class="play-icon"></span>
              <span class="pause-icon"></span>
            </button>
            <div class="player-progress">
              <div class="player-progress-filled" style="width:0%"></div>
            </div>
            <span class="player-time">0:00 / 0:00</span>
          </div>`;
        const audio = new Audio(dataUrl);
        activeMedia = audio;
        const playBtn = container.querySelector('.play-btn');
        const progressFilled = container.querySelector('.player-progress-filled');
        const progressBar = container.querySelector('.player-progress');
        const timeDisplay = container.querySelector('.player-time');
        function updateTime() {
          const current = formatTime(audio.currentTime);
          const total = formatTime(audio.duration || 0);
          timeDisplay.textContent = `${current} / ${total}`;
          if (audio.duration) progressFilled.style.width = (audio.currentTime / audio.duration * 100) + '%';
        }
        function formatTime(seconds) {
          const m = Math.floor(seconds / 60);
          const s = Math.floor(seconds % 60).toString().padStart(2, '0');
          return `${m}:${s}`;
        }
        playBtn.addEventListener('click', () => {
          if (audio.paused) { audio.play(); playBtn.classList.add('playing'); }
          else { audio.pause(); playBtn.classList.remove('playing'); }
        });
        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('loadedmetadata', updateTime);
        audio.addEventListener('ended', () => playBtn.classList.remove('playing'));
        progressBar.addEventListener('click', (e) => {
          if (!audio.duration) return;
          const rect = progressBar.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          audio.currentTime = pct * audio.duration;
        });
        return container;
      }

      function createVideoPlayer(dataUrl, fileName) {
        const container = document.createElement('div');
        container.className = 'video-container';
        container.innerHTML = `
          <video class="viewer-video" preload="metadata">
            <source src="${dataUrl}">
          </video>
          <div class="video-controls">
            <button class="player-btn play-btn">
              <span class="play-icon"></span>
              <span class="pause-icon"></span>
            </button>
            <div class="player-progress">
              <div class="player-progress-filled" style="width:0%"></div>
            </div>
            <span class="player-time">0:00 / 0:00</span>
          </div>`;
        const video = container.querySelector('video');
        activeMedia = video;
        const playBtn = container.querySelector('.play-btn');
        const progressFilled = container.querySelector('.player-progress-filled');
        const progressBar = container.querySelector('.player-progress');
        const timeDisplay = container.querySelector('.player-time');
        function updateTime() {
          const current = formatTime(video.currentTime);
          const total = formatTime(video.duration || 0);
          timeDisplay.textContent = `${current} / ${total}`;
          if (video.duration) progressFilled.style.width = (video.currentTime / video.duration * 100) + '%';
        }
        function formatTime(seconds) {
          const m = Math.floor(seconds / 60);
          const s = Math.floor(seconds % 60).toString().padStart(2, '0');
          return `${m}:${s}`;
        }
        playBtn.addEventListener('click', () => {
          if (video.paused) { video.play(); playBtn.classList.add('playing'); }
          else { video.pause(); playBtn.classList.remove('playing'); }
        });
        video.addEventListener('click', () => {
          if (video.paused) { video.play(); playBtn.classList.add('playing'); }
          else { video.pause(); playBtn.classList.remove('playing'); }
        });
        video.addEventListener('timeupdate', updateTime);
        video.addEventListener('loadedmetadata', updateTime);
        video.addEventListener('ended', () => playBtn.classList.remove('playing'));
        progressBar.addEventListener('click', (e) => {
          if (!video.duration) return;
          const rect = progressBar.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          video.currentTime = pct * video.duration;
        });
        return container;
      }

      // Theme Manager (backend + localStorage fallback)
      const themeSelector = document.getElementById('themeSelector');
      if (themeSelector) {
        const themes = [
          { name: 'Dark',       id: 'dark',     colors: ['#07090f', '#6d8aff', '#ff5e7a'] },
          { name: 'Light',      id: 'light',    colors: ['#f5f7ff', '#4f6ef7', '#e64553'] },
          { name: 'Midnight',   id: 'midnight', colors: ['#0b0e1e', '#7c8aff', '#ff6b6b'] },
          { name: 'Forest',     id: 'forest',   colors: ['#0a1f14', '#3dd6a8', '#ff5252'] },
          { name: 'Sunset',     id: 'sunset',   colors: ['#1f110f', '#ff8c42', '#ff5252'] },
          { name: 'Monochrome', id: 'mono',     colors: ['#111111', '#ffffff', '#ff4444'] },
          { name: 'Ocean',      id: 'ocean',    colors: ['#0a1628', '#00b4d8', '#ff6b6b'] },
          { name: 'Crimson',    id: 'crimson',  colors: ['#1a0a0f', '#e63946', '#ff1744'] },
          { name: 'Lavender',   id: 'lavender', colors: ['#16102b', '#9d4edd', '#ff6b6b'] },
          { name: 'Neon',       id: 'neon',     colors: ['#0f0f0f', '#00ffcc', '#ff3366'] },
          { name: 'Coffee',     id: 'coffee',   colors: ['#1a120b', '#d4a373', '#e76f51'] },
          { name: 'Sky',        id: 'sky',      colors: ['#e8f4f8', '#3498db', '#e74c3c'] }
        ];

        async function applyTheme(themeId) {
          document.body.setAttribute('data-theme', themeId);
          // Save to backend
          try { await eel.saveTheme(themeId)(); } catch(e) { console.warn('Backend save failed, using localStorage'); }
          // localStorage fallback (harmless redundancy)
          localStorage.setItem('opaque-theme', themeId);
          // Update active class
          document.querySelectorAll('.theme-option').forEach(o => {
            o.classList.toggle('active', o.dataset.theme === themeId);
          });
        }

        async function loadAndApplyTheme() {
          let themeId = 'dark';
          // 1. Try backend
          try {
            const saved = await eel.getSavedTheme()();
            if (saved && themes.some(t => t.id === saved)) themeId = saved;
          } catch(e) {
            // 2. Fallback to localStorage
            const local = localStorage.getItem('opaque-theme');
            if (local && themes.some(t => t.id === local)) themeId = local;
          }
          applyTheme(themeId);
        }

        async function buildThemeSelector() {
          // Apply saved theme first (reads from backend)
          await loadAndApplyTheme();

          // Build UI
          themeSelector.innerHTML = '';
          themes.forEach(t => {
            const opt = document.createElement('div');
            opt.className = 'theme-option';
            opt.dataset.theme = t.id;
            opt.innerHTML = `
              <div class="theme-preview">
                <span class="theme-preview-color" style="background:${t.colors[0]}"></span>
                <span class="theme-preview-color" style="background:${t.colors[1]}"></span>
                <span class="theme-preview-color" style="background:${t.colors[2]}"></span>
              </div>
              <div class="theme-name">${t.name}</div>
            `;
            opt.addEventListener('click', () => applyTheme(t.id));
            themeSelector.appendChild(opt);
          });
        }

        buildThemeSelector();
      }

      // Initial load
      refreshBtn.onclick = loadFiles;
      loadFiles();
      loadPeople();
    }

    startWhenEelReady();
  });
})();