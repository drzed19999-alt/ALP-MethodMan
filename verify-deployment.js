/**
 * Deployment Verification Script
 * Run this to verify Phase 1 & 2 deployment
 * Usage: node verify-deployment.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 PHASE 1 & 2 DEPLOYMENT VERIFICATION\n');
console.log('=' . repeat(50));

let passed = 0;
let failed = 0;
let warnings = 0;

// Helper functions
function check(description, test) {
  try {
    const result = test();
    if (result) {
      console.log(`✅ ${description}`);
      passed++;
      return true;
    } else {
      console.log(`❌ ${description}`);
      failed++;
      return false;
    }
  } catch (err) {
    console.log(`❌ ${description}: ${err.message}`);
    failed++;
    return false;
  }
}

function warn(description, test) {
  try {
    const result = test();
    if (result) {
      console.log(`✅ ${description}`);
      passed++;
    } else {
      console.log(`⚠️  ${description} (optional)`);
      warnings++;
    }
  } catch (err) {
    console.log(`⚠️  ${description}: ${err.message} (optional)`);
    warnings++;
  }
}

// Verification tests
console.log('\n📁 File Structure Checks:\n');

check('Database init file exists', () => {
  return fs.existsSync(path.join(__dirname, 'database', 'init.js'));
});

check('Websites routes file exists', () => {
  return fs.existsSync(path.join(__dirname, 'routes', 'websites.js'));
});

check('Funnels routes file exists', () => {
  return fs.existsSync(path.join(__dirname, 'routes', 'funnels.js'));
});

check('Demo pages JS file exists', () => {
  return fs.existsSync(path.join(__dirname, 'public', 'admin', 'js', 'pages', 'demo-pages.js'));
});

check('API client file exists', () => {
  return fs.existsSync(path.join(__dirname, 'public', 'admin', 'js', 'api.js'));
});

console.log('\n📦 Code Verification:\n');

// Check for key Phase 1 functions
const websitesRoute = fs.readFileSync(path.join(__dirname, 'routes', 'websites.js'), 'utf8');

check('File upload validation present', () => {
  return websitesRoute.includes('validateFileUpload') && websitesRoute.includes('ALLOWED_EXTENSIONS');
});

check('File deletion endpoint present', () => {
  return websitesRoute.includes('DELETE') && websitesRoute.includes('/files/:filename');
});

check('ZIP download endpoint present', () => {
  return websitesRoute.includes('download-zip');
});

// Check for key Phase 2 functions
const demoPagesJS = fs.readFileSync(path.join(__dirname, 'public', 'admin', 'js', 'pages', 'demo-pages.js'), 'utf8');

check('Preview modal function present', () => {
  return demoPagesJS.includes('showPreviewModal');
});

check('Analytics modal function present', () => {
  return demoPagesJS.includes('showAnalyticsModal');
});

check('Bulk operations functions present', () => {
  return demoPagesJS.includes('bulkDeletePages') && demoPagesJS.includes('bulkExportPages');
});

check('Download functions present', () => {
  return demoPagesJS.includes('downloadFile') && demoPagesJS.includes('downloadAllFiles');
});

check('Selection state management present', () => {
  return demoPagesJS.includes('selectedPageIds') && demoPagesJS.includes('Set()');
});

// Check API methods
const apiJS = fs.readFileSync(path.join(__dirname, 'public', 'admin', 'js', 'api.js'), 'utf8');

check('Analytics API method present', () => {
  return apiJS.includes('getPageAnalytics');
});

check('Bulk delete API method present', () => {
  return apiJS.includes('bulkDeletePages');
});

check('Bulk update API method present', () => {
  return apiJS.includes('bulkUpdatePages');
});

check('Download ZIP API method present', () => {
  return apiJS.includes('downloadSiteZip');
});

console.log('\n🎨 UI Component Checks:\n');

check('Preview button in card rendering', () => {
  return demoPagesJS.includes('dp-btn-preview') && demoPagesJS.includes('Preview</button>');
});

check('Analytics button in card rendering', () => {
  return demoPagesJS.includes('dp-btn-analytics') && demoPagesJS.includes('Analytics</button>');
});

check('Bulk checkboxes in card rendering', () => {
  return demoPagesJS.includes('dp-bulk-checkbox');
});

check('Select All button in registry', () => {
  return demoPagesJS.includes('dp-select-all-btn');
});

check('Download buttons in files', () => {
  return demoPagesJS.includes('dp-file-download-btn') && demoPagesJS.includes('dp-download-all-btn');
});

console.log('\n📊 Database Schema Checks:\n');

const dbInit = fs.readFileSync(path.join(__dirname, 'database', 'init.js'), 'utf8');

check('Analytics columns migration present', () => {
  return dbInit.includes('views_count') && 
         dbInit.includes('submissions_count') && 
         dbInit.includes('last_activity_at');
});

console.log('\n🔌 Endpoint Checks:\n');

const funnelsRoute = fs.readFileSync(path.join(__dirname, 'routes', 'funnels.js'), 'utf8');

check('Analytics endpoint present', () => {
  return funnelsRoute.includes('/demo-pages/:id/analytics');
});

check('Orphaned pages endpoint present', () => {
  return funnelsRoute.includes('/orphaned');
});

check('Bulk delete endpoint present', () => {
  return funnelsRoute.includes('/bulk-delete');
});

check('Bulk update endpoint present', () => {
  return funnelsRoute.includes('/bulk-update');
});

console.log('\n⚙️  Optional Dependencies:\n');

warn('Archiver package installed', () => {
  try {
    require.resolve('archiver');
    return true;
  } catch (e) {
    return false;
  }
});

console.log('\n📚 Documentation Checks:\n');

check('Phase 1 completion report exists', () => {
  return fs.existsSync(path.join(__dirname, 'PHASE1_COMPLETION_REPORT.md'));
});

check('Phase 2 completion report exists', () => {
  return fs.existsSync(path.join(__dirname, 'PHASE2_COMPLETE.md'));
});

check('Deployment guide exists', () => {
  return fs.existsSync(path.join(__dirname, 'DEPLOYMENT_GUIDE.md'));
});

check('Implementation status exists', () => {
  return fs.existsSync(path.join(__dirname, 'IMPLEMENTATION_STATUS.md'));
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('\n📊 VERIFICATION SUMMARY:\n');
console.log(`✅ Passed:   ${passed}`);
console.log(`❌ Failed:   ${failed}`);
console.log(`⚠️  Warnings: ${warnings}`);

const total = passed + failed + warnings;
const percentage = Math.round((passed / total) * 100);

console.log(`\n📈 Success Rate: ${percentage}%\n`);

if (failed === 0) {
  console.log('🎉 ALL CHECKS PASSED! Ready for deployment!\n');
  console.log('Next steps:');
  console.log('1. Optional: npm install archiver');
  console.log('2. Restart server: npm restart');
  console.log('3. Test in browser: http://localhost:3000/admin');
  console.log('4. Follow DEPLOYMENT_GUIDE.md for full deployment\n');
  process.exit(0);
} else {
  console.log('❌ SOME CHECKS FAILED! Review errors above.\n');
  console.log('Please fix issues before deploying to production.\n');
  process.exit(1);
}
