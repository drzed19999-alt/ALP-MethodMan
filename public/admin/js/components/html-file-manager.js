/**
 * ALP - HTML File Manager Component
 * Manages uploading, listing, and deleting HTML template files on the server.
 */
const HTMLFileManager = (() => {
  let activeWebsiteId = null;
  let websiteList = [];

  function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function render() {
    return `
      <div class="dp-file-manager" id="dp-file-manager" style="display:none; margin-bottom:24px;">
        <div class="dfm-card">
          <div class="dfm-header">
            <h2 class="dfm-title">HTML File Manager</h2>
            <p class="dfm-subtitle">Upload and manage HTML template files on the server for this website.</p>
          </div>
          <div class="dfm-body">
            <div class="dfm-upload-zone" id="dfm-upload-zone">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span class="dfm-upload-text">Drag & drop HTML files here, or <span class="dfm-browse">browse</span></span>
              <span class="dfm-upload-subtext">Supports .html files (max 2MB each)</span>
              <input type="file" id="dfm-file-input" multiple accept=".html" style="display:none;" />
            </div>
            <div class="dfm-files-list-wrap">
              <div class="dfm-files-title">Files on Server</div>
              <div class="dfm-files-list" id="dfm-files-list">
                <div class="dfm-no-files">No HTML files uploaded yet.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function loadFiles() {
    const manager = document.getElementById('dp-file-manager');
    const filesList = document.getElementById('dfm-files-list');
    if (!manager || !filesList) return;

    if (!activeWebsiteId) {
      manager.style.display = 'none';
      return;
    }

    const activeSite = websiteList.find(w => String(w.id) === String(activeWebsiteId));
    if (!activeSite || !activeSite.demo_slug) {
      manager.style.display = 'none';
      return;
    }

    manager.style.display = 'block';
    filesList.innerHTML = '<div style="text-align:center;padding-top:20px;"><div class="dp-spinner" style="margin:0 auto 8px;"></div><span style="font-size:12px;color:var(--text-secondary);">Loading files...</span></div>';

    try {
      const data = await window.ALPApi.getDemoFiles(activeWebsiteId);
      const files = data.files || [];
      if (files.length === 0) {
        filesList.innerHTML = '<div class="dfm-no-files">No HTML files uploaded yet.</div>';
        return;
      }

      filesList.innerHTML = files.map(file => {
        const sizeKB = (file.size / 1024).toFixed(1);
        return `
          <div class="dfm-file-item">
            <div class="dfm-file-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" style="flex-shrink:0;">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span class="dfm-file-name" title="${esc(file.name)}">${esc(file.name)}</span>
              <span class="dfm-file-size">(${sizeKB} KB)</span>
            </div>
            <div class="dfm-file-actions">
              <button class="dp-icon-btn dfm-view-btn" data-url="${esc(file.url)}" title="Open file in new tab">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </button>
              <button class="dp-icon-btn dfm-delete-btn" data-name="${esc(file.name)}" style="color:#ef4444;border-color:rgba(239,68,68,0.15);" title="Delete file">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      }).join('');

      filesList.querySelectorAll('.dfm-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          window.open(btn.dataset.url, '_blank');
        });
      });

      filesList.querySelectorAll('.dfm-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const filename = btn.dataset.name;
          confirmDeleteFile(filename);
        });
      });
    } catch (err) {
      filesList.innerHTML = `<div class="dfm-no-files" style="color:#ef4444;">Failed to load files: ${esc(err.message)}</div>`;
    }
  }

  function confirmDeleteFile(filename) {
    window.showModal({
      title: 'Delete File from Server',
      type: 'danger',
      content: `
        <p style="color:var(--text-secondary);font-size:14px;">
          Are you sure you want to delete <strong style="color:var(--text-primary);">${esc(filename)}</strong> from the server?
        </p>
        <p style="color:var(--text-tertiary);font-size:12px;margin-top:8px;">
          ⚠️ This action cannot be undone and will delete the actual file from disk.
        </p>`,
      confirmText: 'Delete File',
      onConfirm: async () => {
        try {
          await window.ALPApi.deleteDemoFile(activeWebsiteId, filename);
          window.showToast('File deleted successfully', 'success');
          loadFiles();
        } catch (err) {
          window.showToast('Failed to delete: ' + err.message, 'error');
        }
      }
    });
  }

  function initUpload() {
    const zone = document.getElementById('dfm-upload-zone');
    const input = document.getElementById('dfm-file-input');
    if (!zone || !input) return;

    zone.addEventListener('click', (e) => {
      if (e.target !== input) {
        input.click();
      }
    });

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFilesUpload(e.dataTransfer.files);
      }
    });

    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        handleFilesUpload(input.files);
        input.value = '';
      }
    });
  }

  async function handleFilesUpload(filesList) {
    const filesArray = Array.from(filesList);
    const invalidFile = filesArray.find(f => !f.name.toLowerCase().endsWith('.html'));
    if (invalidFile) {
      window.showToast('Only HTML (.html) files are allowed.', 'warning');
      return;
    }

    const oversizedFile = filesArray.find(f => f.size > 2 * 1024 * 1024);
    if (oversizedFile) {
      window.showToast('Files must be under 2MB.', 'warning');
      return;
    }

    window.showToast(`Uploading ${filesArray.length} file(s)...`, 'info');

    try {
      await window.ALPApi.uploadDemoFiles(activeWebsiteId, filesArray);
      window.showToast('Upload complete!', 'success');
      loadFiles();
    } catch (err) {
      window.showToast('Upload failed: ' + err.message, 'error');
    }
  }

  function init(containerId, websiteId, websites) {
    const container = document.getElementById(containerId);
    if (!container) return;

    activeWebsiteId = websiteId;
    websiteList = websites;

    container.innerHTML = render();
    if (activeWebsiteId) {
      initUpload();
      loadFiles();
    }
  }

  return { init, loadFiles };
})();

window.HTMLFileManager = HTMLFileManager;
