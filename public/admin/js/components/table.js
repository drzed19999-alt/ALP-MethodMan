/**
 * ALP - Reusable Data Table Component
 * Formats data into a structured HTML table with custom cell rendering and sorting
 */
const ALPTable = (() => {

  /**
   * Render table HTML
   * @param {Object} options
   * @param {Array} options.columns - [{key, label, render(row), width, sortable}]
   * @param {Array} options.data - Array of row objects
   * @param {Function} options.onRowClick - Function(row, event) called on row click
   * @param {String} options.emptyMessage - Display message when data is empty
   * @param {String} options.className - Extra classes
   */
  function _esc(s) {
    if (window.AlpUtil && window.AlpUtil.escapeHtml) return window.AlpUtil.escapeHtml(s);
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function renderTable({ columns, data, onRowClick = null, emptyMessage = 'No data available', className = '' }) {
    if (!data || data.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📂</div>
          <h3>No records found</h3>
          <p>${_esc(emptyMessage)}</p>
        </div>
      `;
    }

    const clickClass = onRowClick ? 'clickable-rows' : '';
    const tabAttr = onRowClick ? ' tabindex="0"' : '';

    let headHTML = '<tr>';
    columns.forEach(col => {
      const widthStyle = col.width ? ` style="width: ${_esc(col.width)}"` : '';
      headHTML += `<th${widthStyle}>${_esc(col.label)}</th>`;
    });
    headHTML += '</tr>';

    let bodyHTML = '';
    data.forEach((row, rowIndex) => {
      const rowIdAttr = row.id ? ` data-id="${_esc(row.id)}"` : '';
      bodyHTML += `<tr${rowIdAttr} data-index="${rowIndex}"${tabAttr}>`;
      
      columns.forEach(col => {
        let cellVal = '';
        if (col.render && typeof col.render === 'function') {
          cellVal = col.render(row, rowIndex);
        } else {
          cellVal = row[col.key] !== undefined && row[col.key] !== null ? _esc(row[col.key]) : '';
        }
        bodyHTML += `<td>${cellVal}</td>`;
      });
      
      bodyHTML += '</tr>';
    });

    return `
      <div class="table-container ${_esc(className)}">
        <table class="data-table ${clickClass}">
          <thead>
            ${headHTML}
          </thead>
          <tbody>
            ${bodyHTML}
          </tbody>
        </table>
      </div>
    `;
  }

  function initTable(containerEl, data, onRowClick) {
    if (!onRowClick || !containerEl) return;

    const rows = containerEl.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const trigger = (e) => {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) return;
        const index = parseInt(row.getAttribute('data-index'), 10);
        if (!isNaN(index) && data[index]) onRowClick(data[index], e);
      };
      row.addEventListener('click', trigger);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(e); }
      });
    });
  }

  return { renderTable, initTable };
})();

// Export globally
window.ALPTable = ALPTable;
