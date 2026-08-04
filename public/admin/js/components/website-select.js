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
   * @param {Boolean} opts.showHostingBadge - If true, show VPS/Railway badge on each item
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

    // Group: active first, then inactive
    const activeW   = websites.filter(w => w.is_active !== 0);
    const inactiveW = websites.filter(w => w.is_active === 0);

    const renderItem = (w, inactive) => {
      const isSelected = String(w.id) === currentVal;
      const inactiveBadge = inactive
        ? `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.25);margin-left:5px;vertical-align:middle;">INACTIVE</span>`
        : '';
      let hostingBadge = '';
      if (showHostingBadge) {
        if (w.vps_host) {
          hostingBadge = `<span title="VPS ${escapeHtml(w.vps_host)}" style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:rgba(20,184,166,.15);color:#2dd4bf;border:1px solid rgba(20,184,166,.25);margin-left:5px;vertical-align:middle;">VPS</span>`;
        } else {
          hostingBadge = `<span title="Railway (no VPS on this website)" style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:rgba(139,92,246,.15);color:#a78bfa;border:1px solid rgba(139,92,246,.25);margin-left:5px;vertical-align:middle;">RAILWAY</span>`;
        }
      }
      return `
        <li class="alp-dropdown-item ${isSelected ? 'selected' : ''} ${inactive ? 'alp-dropdown-item--inactive' : ''}" data-value="${w.id}" style="${inactive ? 'opacity:.65;' : ''}">
          ${renderLogoOrAvatar(w, false)}
          <div class="alp-dropdown-item-text">
            <div class="alp-dropdown-item-name">${escapeHtml(w.name)}${hostingBadge}${inactiveBadge}</div>
            <div class="alp-dropdown-item-domain">${escapeHtml(w.domain)}</div>
          </div>
        </li>
      `;
    };

    activeW.forEach(w => { itemsHtml += renderItem(w, false); });
    if (inactiveW.length) {
      itemsHtml += `<li style="padding:6px 12px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#475569;pointer-events:none;border-top:1px solid rgba(255,255,255,.06);margin-top:4px;">Inactive</li>`;
      inactiveW.forEach(w => { itemsHtml += renderItem(w, true); });
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

    // dropUp: position menu above trigger via fixed coords to escape overflow:hidden ancestors
    function _applyDropUpPos() {
      const rect = trigger.getBoundingClientRect();
      Object.assign(menu.style, {
        position: 'fixed',
        bottom: `${window.innerHeight - rect.top + 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        top: 'auto',
        zIndex: '9999',
        animation: 'dropdownFadeInUp .2s ease both',
      });
    }

    // fixedBelow: teleport menu to document.body to escape modal's CSS transform context
    // (transform: scale(1) on modal breaks position:fixed for children)
    function _applyFixedBelowPos() {
      const rect = trigger.getBoundingClientRect();
      document.body.appendChild(menu);
      Object.assign(menu.style, {
        display: 'block',
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        bottom: 'auto',
        zIndex: '99999',
      });
    }

    function _clearFixedPos() {
      // Move menu back into dropdown before clearing styles
      if (fixedBelow && menu.parentElement === document.body) {
        dropdown.appendChild(menu);
      }
      Object.assign(menu.style, { display: '', position: '', bottom: '', top: '', left: '', width: '', zIndex: '', animation: '' });
    }

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
      // Close other open alp-dropdowns first
      document.querySelectorAll('.alp-dropdown.open').forEach(d => {
        if (d !== dropdown) { d.classList.remove('open'); }
      });
      if (!isOpen) {
        dropdown.classList.add('open');
        if (dropUp) _applyDropUpPos();
        else if (fixedBelow) _applyFixedBelowPos();
      } else {
        dropdown.classList.remove('open');
        if (dropUp || fixedBelow) _clearFixedPos();
      }
    });

    // Close menu when clicking outside — also check teleported menu (fixedBelow)
    const handleOutsideClick = (e) => {
      if (!dropdown.contains(e.target) && !menu.contains(e.target)) {
        dropdown.classList.remove('open');
        if (dropUp || fixedBelow) _clearFixedPos();
      }
    };
    document.addEventListener('click', handleOutsideClick);

    // Save cleanup handler on the container
    container._dropdownCleanup = () => {
      document.removeEventListener('click', handleOutsideClick);
      if (dropUp || fixedBelow) _clearFixedPos();
    };

    // Option items click handler
    menu.querySelectorAll('.alp-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = item.dataset.value;
        const previousValue = hiddenInput.value;

        // Set value
        hiddenInput.value = value;
        dropdown.classList.remove('open');
        if (dropUp || fixedBelow) _clearFixedPos();

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
