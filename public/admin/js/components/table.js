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
  function renderTable({ columns, data, onRowClick = null, emptyMessage = 'No data available', className = '' }) {
    if (!data || data.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📂</div>
          <h3>No records found</h3>
          <p>${emptyMessage}</p>
        </div>
      `;
    }

    const clickClass = onRowClick ? 'clickable-rows' : '';

    let headHTML = '<tr>';
    columns.forEach(col => {
      const widthStyle = col.width ? ` style="width: ${col.width}"` : '';
      headHTML += `<th${widthStyle}>${col.label}</th>`;
    });
    headHTML += '</tr>';

    let bodyHTML = '';
    data.forEach((row, rowIndex) => {
      const rowIdAttr = row.id ? ` data-id="${row.id}"` : '';
      bodyHTML += `<tr${rowIdAttr} data-index="${rowIndex}">`;
      
      columns.forEach(col => {
        let cellVal = '';
        if (col.render && typeof col.render === 'function') {
          cellVal = col.render(row, rowIndex);
        } else {
          cellVal = row[col.key] !== undefined && row[col.key] !== null ? row[col.key] : '';
        }
        bodyHTML += `<td>${cellVal}</td>`;
      });
      
      bodyHTML += '</tr>';
    });

    return `
      <div class="table-container ${className}">
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

  /**
   * Bind events after inserting HTML
   * @param {HTMLElement} containerEl - The wrapper containing the table
   * @param {Array} data - The array of data representing rows
   * @param {Function} onRowClick - The row click handler
   */
  function initTable(containerEl, data, onRowClick) {
    if (!onRowClick || !containerEl) return;

    const rows = containerEl.querySelectorAll('tbody tr');
    rows.forEach(row => {
      row.addEventListener('click', (e) => {
        // Prevent trigger if clicking buttons or links inside the cell
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) {
          return;
        }
        
        const index = parseInt(row.getAttribute('data-index'), 10);
        if (!isNaN(index) && data[index]) {
          onRowClick(data[index], e);
        }
      });
    });
  }

  return { renderTable, initTable };
})();

// Export globally
window.ALPTable = ALPTable;
