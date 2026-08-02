function waitForEel(cb) {
    if (typeof eel !== 'undefined' && eel.getFiles) cb();
    else setTimeout(() => waitForEel(cb), 100);
}

waitForEel(function () {
    const getFiles = async () => await eel.getFiles()();
    const selectFiles = async () => await eel.selectFiles()();
    const encryptFile = async (p) => await eel.encryptFile(p);
    const deleteFile = async (id) => await eel.deleteFile(id);
    const decryptFile = async (id) => await eel.decryptFile(id)();
    const openFileExternally = async (id) => await eel.openFileExternally(id);

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

    const getIcon = (mime) => {
        if (!mime) return '📄';
        if (mime.startsWith('image/')) return '🖼️';
        if (mime.startsWith('video/')) return '🎬';
        if (mime.startsWith('audio/')) return '🎵';
        if (mime.startsWith('text/')) return '📝';
        if (mime.includes('pdf')) return '📕';
        return '📦';
    };
    const formatSize = (bytes) => {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
        return bytes.toFixed(1) + ' ' + units[i];
    };
    const showToast = (msg, type = 'success') => {
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        document.getElementById('toastContainer').appendChild(t);
        setTimeout(() => t.remove(), 4000);
    };

    const filesContainer = document.getElementById('filesContainer');
    const refreshBtn = document.getElementById('refreshFilesBtn');

    const loadFiles = async () => {
        try {
            const files = await getFiles();
            renderFiles(files || []);
        } catch (err) { showToast('Failed to load vault', 'error'); renderFiles([]); }
    };

    const renderFiles = (files) => {
        filesContainer.innerHTML = '';
        if (!files.length) {
            filesContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><p>The vault is empty</p><p style="font-size:0.8rem;">Encrypt files to see them here.</p></div>';
            return;
        }
        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'file-card';
            card.innerHTML = `
                <div class="file-icon">${getIcon(file.mimeType)}</div>
                <div class="file-name" title="${file.originalName}">${file.originalName}</div>
                <div class="file-meta">
                    <span>${file.mimeType || 'unknown'}</span>
                    <span>${formatSize(file.size)}</span>
                </div>
                <div class="file-actions">
                    <button class="icon-btn view" title="View">👁️</button>
                    <button class="icon-btn" title="Delete">🗑️</button>
                </div>
            `;
            const viewBtn = card.querySelector('.view');
            const delBtn = card.querySelector('.icon-btn:not(.view)');
            viewBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    const data = await decryptFile(file.id);
                    displayInViewer(data, file.id);
                } catch (err) { showToast('Cannot open: ' + err, 'error'); }
            });
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this encrypted file?')) return;
                try {
                    await deleteFile(file.id);
                    showToast('Deleted', 'success');
                    loadFiles();
                } catch (err) { showToast('Delete failed: ' + err, 'error'); }
            });
            filesContainer.appendChild(card);
        });
    };

    // Encrypt page
    const dropzone = document.getElementById('dropzone');
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
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', async e => {
        e.preventDefault(); dropzone.classList.remove('drag-over');
        try {
            const paths = await selectFiles();
            if (paths && paths.length) { selectedPaths = paths; renderSelectedFiles(); }
        } catch (err) { showToast('File selection error', 'error'); }
    });

    const renderSelectedFiles = () => {
        selectedFilesList.innerHTML = selectedPaths.map(p => {
            const name = p.split(/[\\/]/).pop();
            return `<div class="file-chip"><span>📄 ${name}</span><span style="opacity:0.6;font-size:0.75rem;">${p}</span></div>`;
        }).join('');
        selectedFilesContainer.style.display = 'block';
        encryptBtn.disabled = false;
    };

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
                const pct = Math.round((completed / total) * 100);
                progressFill.style.width = pct + '%';
                progressText.textContent = pct + '%';
            } catch (err) { showToast('Error: ' + err, 'error'); completed++; }
        }
        showToast('Encryption complete!', 'success');
        selectedPaths = [];
        selectedFilesList.innerHTML = '';
        selectedFilesContainer.style.display = 'none';
        progressWrapper.style.display = 'none';
        encryptBtn.disabled = true;
        loadFiles();
    });

    // Custom media players
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
            </div>
        `;
        const audio = new Audio(dataUrl);
        const playBtn = container.querySelector('.play-btn');
        const progressFilled = container.querySelector('.player-progress-filled');
        const progressBar = container.querySelector('.player-progress');
        const timeDisplay = container.querySelector('.player-time');

        function updateTime() {
            const current = formatTime(audio.currentTime);
            const total = formatTime(audio.duration || 0);
            timeDisplay.textContent = `${current} / ${total}`;
            if (audio.duration) {
                progressFilled.style.width = (audio.currentTime / audio.duration * 100) + '%';
            }
        }

        function formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        }

        playBtn.addEventListener('click', () => {
            if (audio.paused) {
                audio.play();
                playBtn.classList.add('playing');
            } else {
                audio.pause();
                playBtn.classList.remove('playing');
            }
        });

        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('loadedmetadata', updateTime);
        audio.addEventListener('ended', () => {
            playBtn.classList.remove('playing');
        });

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
            </div>
        `;
        const video = container.querySelector('video');
        const playBtn = container.querySelector('.play-btn');
        const progressFilled = container.querySelector('.player-progress-filled');
        const progressBar = container.querySelector('.player-progress');
        const timeDisplay = container.querySelector('.player-time');

        function updateTime() {
            const current = formatTime(video.currentTime);
            const total = formatTime(video.duration || 0);
            timeDisplay.textContent = `${current} / ${total}`;
            if (video.duration) {
                progressFilled.style.width = (video.currentTime / video.duration * 100) + '%';
            }
        }

        function formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        }

        playBtn.addEventListener('click', () => {
            if (video.paused) {
                video.play();
                playBtn.classList.add('playing');
            } else {
                video.pause();
                playBtn.classList.remove('playing');
            }
        });

        video.addEventListener('click', () => {
            if (video.paused) {
                video.play();
                playBtn.classList.add('playing');
            } else {
                video.pause();
                playBtn.classList.remove('playing');
            }
        });

        video.addEventListener('timeupdate', updateTime);
        video.addEventListener('loadedmetadata', updateTime);
        video.addEventListener('ended', () => {
            playBtn.classList.remove('playing');
        });

        progressBar.addEventListener('click', (e) => {
            if (!video.duration) return;
            const rect = progressBar.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            video.currentTime = pct * video.duration;
        });

        return container;
    }

    // Viewer modal
    const viewerModal = document.getElementById('viewerModal');
    const viewerContent = document.getElementById('viewerContent');
    document.getElementById('closeViewer').onclick = () => viewerModal.classList.remove('active');
    viewerModal.addEventListener('click', e => { if (e.target === viewerModal) viewerModal.classList.remove('active'); });

    const displayInViewer = (file, fileId) => {
        const mime = file.mimeType;
        const dataUrl = `data:${mime};base64,${file.data}`;
        let html = `<div class="viewer-filename">${file.fileName}</div>`;

        if (mime && mime.startsWith('image/')) {
            html += `<img class="viewer-image" src="${dataUrl}" alt="${file.fileName}">`;
        } else if (mime && mime.startsWith('audio/')) {
            viewerContent.innerHTML = html;
            const player = createAudioPlayer(dataUrl, file.fileName);
            viewerContent.appendChild(player);
            viewerModal.classList.add('active');
            return;
        } else if (mime && mime.startsWith('video/')) {
            viewerContent.innerHTML = html;
            const player = createVideoPlayer(dataUrl, file.fileName);
            viewerContent.appendChild(player);
            viewerModal.classList.add('active');
            return;
        } else if (mime && mime === 'application/pdf') {
            html += `<div class="pdf-container"><iframe class="viewer-pdf" src="data:application/pdf;base64,${file.data}"></iframe></div>`;
        } else if (mime && (mime.startsWith('text/') || mime === 'application/json')) {
            html += `<div class="text-container"><pre class="viewer-text">${file.data.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></div>`;
        } else {
            html += `
                <div class="unsupported-container">
                    <div class="unsupported-icon">📦</div>
                    <p style="margin-bottom:16px; color:var(--text-muted);">Preview not available for this file type.</p>
                    <button class="btn" id="openExternalBtn">🔗 Open with default app</button>
                </div>`;
        }

        viewerContent.innerHTML = html;
        const openBtn = document.getElementById('openExternalBtn');
        if (openBtn) {
            openBtn.addEventListener('click', async () => {
                await openFileExternally(fileId);
                viewerModal.classList.remove('active');
            });
        }
        viewerModal.classList.add('active');
    };

    refreshBtn.onclick = loadFiles;
    loadFiles();
});

    // ---------- THEME MANAGEMENT ----------
    const themes = [
        { name: 'Dark',       id: 'dark',     colors: ['#0d1117','#58a6ff','#f85149'] },
        { name: 'Light',      id: 'light',    colors: ['#ffffff','#0969da','#cf222e'] },
        { name: 'Midnight',   id: 'midnight', colors: ['#0a0e27','#7c8aff','#ff6b6b'] },
        { name: 'Forest',     id: 'forest',   colors: ['#0b1f14','#4caf50','#ff5252'] },
        { name: 'Sunset',     id: 'sunset',   colors: ['#1a0e0b','#ff8c42','#ff5252'] },
        { name: 'Monochrome', id: 'mono',     colors: ['#111111','#ffffff','#ff4444'] }
    ];

    const themeSelector = document.getElementById('themeSelector');

    function applyTheme(themeId) {
        document.body.setAttribute('data-theme', themeId);
        localStorage.setItem('opaque-theme', themeId);
        // Update active state in UI
        document.querySelectorAll('.theme-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === themeId);
        });
    }

    function buildThemeSelector() {
        themeSelector.innerHTML = '';
        themes.forEach(theme => {
            const option = document.createElement('div');
            option.className = 'theme-option';
            option.dataset.theme = theme.id;
            option.innerHTML = `
                <div class="theme-preview">
                    <span class="theme-preview-color" style="background:${theme.colors[0]}"></span>
                    <span class="theme-preview-color" style="background:${theme.colors[1]}"></span>
                    <span class="theme-preview-color" style="background:${theme.colors[2]}"></span>
                </div>
                <div class="theme-name">${theme.name}</div>
            `;
            option.addEventListener('click', () => applyTheme(theme.id));
            themeSelector.appendChild(option);
        });

        // Load saved theme
        const saved = localStorage.getItem('opaque-theme') || 'dark';
        applyTheme(saved);
    }

    buildThemeSelector();