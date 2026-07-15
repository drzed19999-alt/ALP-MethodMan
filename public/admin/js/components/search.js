/**
 * ALP - Search Input Component
 * Provides a debounced text search input with a clear button
 */
const ALPSearch = (() => {

  /**
   * Render Search Input HTML
   * @param {Object} options
   * @param {String} options.id - Input element ID
   * @param {String} options.placeholder - Placeholder text
   * @param {String} options.value - Initial search value
   * @param {String} options.className - Additional class names
   */
  function renderSearch({ id = 'search-input', placeholder = 'Search...', value = '', className = '' }) {
    const showClear = value ? 'style="display:flex;"' : 'style="display:none;"';
    return `
      <div class="search-bar ${className}">
        <svg class="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" class="search-bar-input" id="${id}" placeholder="${placeholder}" value="${escapeHtml(value)}" autocomplete="off" />
        <button class="search-bar-clear-btn" id="${id}-clear" ${showClear} aria-label="Clear Search">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <style>
        .search-bar {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
          max-width: 320px;
        }

        .search-bar-input {
          width: 100%;
          height: 38px;
          padding: 0 var(--space-4) 0 36px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-size: var(--text-sm);
          outline: none;
          transition: all var(--transition-base);
        }

        .search-bar-input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-input);
          box-shadow: 0 0 0 3px var(--accent-primary-ring);
        }

        .search-bar-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .search-bar-clear-btn {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          color: var(--text-muted);
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          transition: all var(--transition-base);
        }

        .search-bar-clear-btn:hover {
          color: var(--text-primary);
          border-color: var(--border-hover);
        }
      </style>
    `;
  }

  /**
   * Bind event handlers
   * @param {HTMLElement} containerEl - Container element
   * @param {String} id - Input ID
   * @param {Function} onSearch - Debounced Callback function(query)
   * @param {Number} delay - Debounce delay in ms
   */
  function initSearch(containerEl, id = 'search-input', onSearch, delay = 300) {
    if (!containerEl || !onSearch) return;

    const input = containerEl.querySelector(`#${id}`);
    const clearBtn = containerEl.querySelector(`#${id}-clear`);
    
    if (!input) return;

    let timeout = null;

    const handleSearch = (val) => {
      if (clearBtn) {
        clearBtn.style.display = val ? 'flex' : 'none';
      }
      onSearch(val);
    };

    input.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        handleSearch(val);
      }, delay);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        handleSearch('');
        input.focus();
      });
    }
  }

  return { renderSearch, initSearch };
})();

// Export globally
window.ALPSearch = ALPSearch;
