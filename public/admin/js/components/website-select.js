/**
 * ALP - Website Selector Custom Dropdown Component
 * Displays websites with their logos in dropdown selectors
 */
const ALPWebsiteSelect = (() => {
  function getInitialsColor(name) {
    const cols = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
    let h = 0; const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return cols[Math.abs(h) % cols.length];
  }

  function renderLogoOrAvatar(w, isSmall = true) {
    if (!w) {
      // For "All Websites" or similar
      return `<div class="alp-dropdown-avatar" style="background:var(--accent-primary);"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg></div>`;
    }
    if (w.logo_url) {
      const cleanUrl = escapeHtml(w.logo_url);
      const fallbackHtml = renderAvatar(w, isSmall).replace(/"/g, '&quot;');
      return `<img src="${cleanUrl}" class="${isSmall ? 'alp-dropdown-logo' : 'alp-dropdown-item-logo'}" onerror="this.outerHTML='${fallbackHtml}'" style="background:transparent; border:none; outline:none;" />`;
    }
    return renderAvatar(w, isSmall);
  }

  function renderAvatar(w, isSmall) {
    const initials = (w.name || '?')[0].toUpperCase();
    const bg = getInitialsColor(w.name || w.id);
    return `<div class="${isSmall ? 'alp-dropdown-avatar' : 'alp-dropdown-item-avatar'}" style="background:${bg};">${escapeHtml(initials)}</div>`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /**
   * Instantiate a custom dropdown for choosing a website
   * @param {Object} opts
   * @param {String} opts.containerId - ID of the container element
   * @param {String} opts.hiddenInputId - ID of the hidden input
   * @param {Array} opts.websites - List of websites
   * @param {String} opts.placeholder - Default option name (e.g. "All Websites", "Select website...")
   * @param {String|Number} opts.selectedValue - Currently selected website ID
   * @param {Boolean} opts.fullWidth - If true, dropdown trigger stretches to 100%
   * @param {Function} opts.onChange - Callback function(value)
   * @param {Boolean} opts.showHostingBadge - If true, show VPS badge on each item
   */
  function create({ containerId, hiddenInputId, websites, placeholder = 'All Websites', selectedValue = '', fullWidth = false, onChange, dropUp = false, fixedBelow = false, showHostingBadge = false }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Cleanup previous listener
    if (container._dropdownCleanup) {
      container._dropdownCleanup();
    }

    // Normalize value
    const currentVal = selectedValue === null ? '' : String(selectedValue);

    // Find currently selected website
    const selectedSite = websites.find(w => String(w.id) === currentVal);

    // Build trigger content
    let triggerHtml = '';
    if (selectedSite) {
      triggerHtml = `
        ${renderLogoOrAvatar(selectedSite, true)}
        <span class="alp-dropdown-label">${escapeHtml(selectedSite.name)}</span>
      `;
    } else {
      // Placeholder option ("All Websites" / "Select website...")
      const isSelectPlaceholder = placeholder.toLowerCase().includes('select');
      const placeholderLogo = isSelectPlaceholder
        ? `<div class="alp-dropdown-avatar" style="background:#475569;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/></svg></div>`
        : `<div class="alp-dropdown-avatar" style="background:var(--accent-primary);"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg></div>`;
      
      triggerHtml = `
        ${placeholderLogo}
        <span class="alp-dropdown-label">${escapeHtml(placeholder)}</span>
      `;
    }

    // Build option items list
    let itemsHtml = '';
    
    // Add default/placeholder item if we aren't enforcing selection or if it's "All Websites"
    const hasAllWebsites = !placeholder.toLowerCase().includes('select');
    if (hasAllWebsites) {
      const isSelected = currentVal === '';
      itemsHtml += `
        <li class="alp-dropdown-item ${isSelected ? 'selected' : ''}" data-value="">
          <div class="alp-dropdown-item-avatar" style="background:var(--accent-primary);"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg></div>
          <div class="alp-dropdown-item-text">
            <div class="alp-dropdown-item-name">${escapeHtml(placeholder)}</div>
          </div>
        </li>
      `;
    }

    // Group: when showHostingBadge is on (domain flows), sort VPS-enabled
    // sites first and mark non-VPS ones as disabled. Otherwise: active first,
    // then inactive.
    const activeW   = websites.filter(w => w.is_active !== 0);
    const inactiveW = websites.filter(w => w.is_active === 0);
    const activeVps    = showHostingBadge ? activeW.filter(w => w.vps_host)    : activeW;
    const activeNoVps  = showHostingBadge ? activeW.filter(w => !w.vps_host)   : [];

    const renderItem = (w, { inactive = false, disabled = false } = {}) => {
      const isSelected = String(w.id) === currentVal;
      const inactiveBadge = inactive
        ? `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.25);margin-left:5px;vertical-align:middle;">INACTIVE</span>`
        : '';
      let hostingBadge = '';
      if (showHostingBadge) {
        if (w.vps_host) {
          hostingBadge = `<span title="VPS ${escapeHtml(w.vps_host)}" style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:rgba(20,184,166,.15);color:#2dd4bf;border:1px solid rgba(20,184,166,.25);margin-left:5px;vertical-align:middle;">VPS</span>`;
        } else {
          hostingBadge = `<span title="No VPS configured — cannot host domains" style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:rgba(107,114,128,.15);color:#9ca3af;border:1px solid rgba(107,114,128,.25);margin-left:5px;vertical-align:middle;">NO VPS</span>`;
        }
      }
      const opacity = disabled ? 0.4 : (inactive ? 0.65 : 1);
      const cursor  = disabled ? 'not-allowed' : 'pointer';
      return `
        <li class="alp-dropdown-item ${isSelected ? 'selected' : ''} ${inactive ? 'alp-dropdown-item--inactive' : ''} ${disabled ? 'alp-dropdown-item--disabled' : ''}" data-value="${w.id}" ${disabled ? 'data-disabled="1"' : ''} style="opacity:${opacity};cursor:${cursor};">
          ${renderLogoOrAvatar(w, false)}
          <div class="alp-dropdown-item-text">
            <div class="alp-dropdown-item-name">${escapeHtml(w.name)}${hostingBadge}${inactiveBadge}</div>
            <div class="alp-dropdown-item-domain">${escapeHtml(w.domain)}</div>
          </div>
        </li>
      `;
    };

    activeVps.forEach(w => { itemsHtml += renderItem(w, {}); });
    if (activeNoVps.length) {
      itemsHtml += `<li style="padding:6px 12px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);pointer-events:none;border-top:1px solid var(--border-subtle);margin-top:4px;">No VPS — not selectable</li>`;
      activeNoVps.forEach(w => { itemsHtml += renderItem(w, { disabled: true }); });
    }
    if (inactiveW.length) {
      itemsHtml += `<li style="padding:6px 12px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);pointer-events:none;border-top:1px solid var(--border-subtle);margin-top:4px;">Inactive</li>`;
      inactiveW.forEach(w => { itemsHtml += renderItem(w, { inactive: true, disabled: showHostingBadge && !w.vps_host }); });
    }

    const fullWidthClass = fullWidth ? 'w-full' : '';

    // Render component HTML structure
    container.innerHTML = `
      <div class="alp-dropdown ${fullWidthClass}" id="${containerId}-dropdown">
        <button type="button" class="alp-dropdown-trigger" id="${containerId}-trigger">
          <div class="alp-dropdown-trigger-content">
            ${triggerHtml}
          </div>
          <svg class="alp-dropdown-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <ul class="alp-dropdown-menu" id="${containerId}-menu">
          ${itemsHtml}
        </ul>
        <input type="hidden" id="${hiddenInputId}" value="${escapeHtml(currentVal)}" />
      </div>
    `;

    // Setup event listeners
    const dropdown = container.querySelector(`#${containerId}-dropdown`);
    const trigger = container.querySelector(`#${containerId}-trigger`);
    const menu = container.querySelector(`#${containerId}-menu`);
    const hiddenInput = container.querySelector(`#${hiddenInputId}`);

    // Always position menu in a body portal with fixed viewport-clamped coordinates
    // when dropUp or fixedBelow is used (prevents modal/overflow clipping & viewport cutoffs)
    function _positionPortalMenu(preferUp) {
      if (!dropdown.isConnected) { _close(); return; }
      if (menu.parentElement !== document.body) document.body.appendChild(menu);
      const rect = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 8;
      const gap = 4;
      const width = Math.min(Math.max(rect.width, 200), vw - margin * 2);
      const left = Math.max(margin, Math.min(rect.left, vw - width - margin));
      const spaceBelow = vh - rect.bottom - margin - gap;
      const spaceAbove = rect.top - margin - gap;
      const openUp = preferUp
        ? (spaceAbove >= 140 || spaceAbove > spaceBelow)
        : (spaceBelow < 220 && spaceAbove > spaceBelow);

      const maxH = Math.max(120, Math.min(320, openUp ? spaceAbove : spaceBelow));
      Object.assign(menu.style, {
        display: 'block',
        position: 'fixed',
        left: `${left}px`,
        width: `${width}px`,
        maxHeight: `${maxH}px`,
        overflowY: 'auto',
        zIndex: 'var(--z-popover, 700)',
        top: openUp ? 'auto' : `${Math.max(margin, rect.bottom + gap)}px`,
        bottom: openUp ? `${Math.max(margin, vh - rect.top + gap)}px` : 'auto',
        animation: openUp ? 'dropdownFadeInUp .16s ease both' : '',
      });
    }

    function _clearFixedPos() {
      if (menu.parentElement === document.body) {
        if (dropdown.isConnected) dropdown.appendChild(menu);
        else menu.remove();
      }
      Object.assign(menu.style, {
        display: '', position: '', bottom: '', top: '', left: '', width: '',
        maxHeight: '', overflowY: '', zIndex: '', animation: '',
      });
    }

    function _onViewportChange(e) {
      if (!dropdown.classList.contains('open')) return;
      if (e && e.type === 'scroll' && menu.contains(e.target)) return;
      if (!dropdown.isConnected) { _close(); return; }
      _positionPortalMenu(!!dropUp);
    }

    function _close() {
      dropdown.classList.remove('open');
      window.removeEventListener('scroll', _onViewportChange, true);
      window.removeEventListener('resize', _onViewportChange);
      if (dropUp || fixedBelow) _clearFixedPos();
    }

    dropdown._alpCloseDropdown = _close;

    // Inject dropUp animation once
    if (dropUp && !document.getElementById('alp-dropup-anim')) {
      const s = document.createElement('style');
      s.id = 'alp-dropup-anim';
      s.textContent = '@keyframes dropdownFadeInUp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(s);
    }

    // Toggle menu
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      // Close other open alp-dropdowns cleanly (including their teleported menus)
      document.querySelectorAll('.alp-dropdown.open').forEach(d => {
        if (d !== dropdown) {
          if (typeof d._alpCloseDropdown === 'function') d._alpCloseDropdown();
          else d.classList.remove('open');
        }
      });
      if (!isOpen) {
        dropdown.classList.add('open');
        if (dropUp || fixedBelow) {
          _positionPortalMenu(!!dropUp);
          window.addEventListener('scroll', _onViewportChange, true);
          window.addEventListener('resize', _onViewportChange);
        }
      } else {
        _close();
      }
    });

    // Close menu when clicking outside — also clean up if host unmounted
    const handleOutsideClick = (e) => {
      if (!dropdown.isConnected) {
        if (container._dropdownCleanup) container._dropdownCleanup();
        return;
      }
      if (!dropdown.contains(e.target) && !menu.contains(e.target)) {
        _close();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape' && dropdown.classList.contains('open')) _close();
    };
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    // Save cleanup handler on the container
    container._dropdownCleanup = () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
      _close();
    };

    // Option items click handler
    menu.querySelectorAll('.alp-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.dataset.disabled === '1') {
          if (window.showToast) window.showToast('This website has no VPS configured — open its Host wizard first', 'warning');
          return;
        }
        const value = item.dataset.value;
        const previousValue = hiddenInput.value;

        // Set value
        hiddenInput.value = value;
        _close();

        // Toggle selected state in menu
        menu.querySelectorAll('.alp-dropdown-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');

        // Update trigger UI
        const triggerContent = trigger.querySelector('.alp-dropdown-trigger-content');
        if (value) {
          const site = websites.find(w => String(w.id) === String(value));
          triggerContent.innerHTML = `
            ${renderLogoOrAvatar(site, true)}
            <span class="alp-dropdown-label">${escapeHtml(site.name)}</span>
          `;
        } else {
          const isSelectPlaceholder = placeholder.toLowerCase().includes('select');
          const placeholderLogo = isSelectPlaceholder
            ? `<div class="alp-dropdown-avatar" style="background:#475569;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/></svg></div>`
            : `<div class="alp-dropdown-avatar" style="background:var(--accent-primary);"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg></div>`;
          
          triggerContent.innerHTML = `
            ${placeholderLogo}
            <span class="alp-dropdown-label">${escapeHtml(placeholder)}</span>
          `;
        }

        // Trigger change event if value changed
        if (value !== previousValue) {
          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
          if (onChange) onChange(value);
        }
      });
    });
  }

  return { create };
})();

window.ALPWebsiteSelect = ALPWebsiteSelect;
