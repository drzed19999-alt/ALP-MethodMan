/**
 * ALP - Chart Helper Wrapper
 * Abstracts Chart.js configuration for standardizing charts with theme custom styling
 */
const ALPChart = (() => {

  // Default color tokens matching variables.css
  const colors = {
    primary: '#6366f1',
    primaryLight: '#818cf8',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    gridDark: 'rgba(255, 255, 255, 0.04)',
    gridLight: 'rgba(0, 0, 0, 0.04)',
    textDark: '#6b7280',
    textLight: '#475569'
  };

  /**
   * Determine style attributes based on theme
   */
  function _getThemeColors() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return {
      gridColor: isLight ? colors.gridLight : colors.gridDark,
      textColor: isLight ? colors.textLight : colors.textDark
    };
  }

  /**
   * Line Chart creator
   */
  function createLineChart(canvasId, labels, data, labelName = 'Sessions', accentColor = colors.primary) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const theme = _getThemeColors();

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: labelName,
          data: data,
          borderColor: accentColor,
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            grid: { color: theme.gridColor },
            ticks: { color: theme.textColor, font: { family: 'Inter, sans-serif', size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: theme.gridColor },
            ticks: { color: theme.textColor, font: { family: 'Inter, sans-serif', size: 11 }, precision: 0 }
          }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
  }

  /**
   * Horizontal or vertical Bar Chart creator
   */
  function createBarChart(canvasId, labels, data, horizontal = true, barColors = [colors.primary]) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const theme = _getThemeColors();

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: barColors,
          borderRadius: 6,
          barThickness: 16
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        plugins: {
          legend: { display: false },
          tooltip: { padding: 10, cornerRadius: 8 }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: theme.gridColor },
            ticks: { color: theme.textColor, font: { family: 'Inter, sans-serif', size: 11 }, precision: 0 }
          },
          y: {
            grid: { display: false },
            ticks: { color: theme.textColor, font: { family: 'Inter, sans-serif', size: 11 } }
          }
        }
      }
    });
  }

  /**
   * Doughnut Chart creator
   */
  function createDoughnutChart(canvasId, labels, data, chartColors = [colors.primary, colors.success, colors.warning, colors.danger, colors.info]) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = isLight ? colors.textLight : colors.textDark;

    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: chartColors,
          borderWidth: isLight ? 2 : 0,
          borderColor: isLight ? '#ffffff' : 'transparent',
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'right',
            labels: {
              color: textColor,
              font: { family: 'Inter, sans-serif', size: 11 },
              padding: 12,
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true
            }
          },
          tooltip: { padding: 10, cornerRadius: 8 }
        },
        cutout: '65%'
      }
    });
  }

  return { createLineChart, createBarChart, createDoughnutChart };
})();

// Export globally
window.ALPChart = ALPChart;
/**
 * Custom escape HTML function globally declared to support template generation safely
 */
window.escapeHtml = (str) => {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};
