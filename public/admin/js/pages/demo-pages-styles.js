/**
 * demo-pages-styles.js
 * Injected styles for the Scam Pages manager.
 */
'use strict';
window.DemoPagesStyles = (() => {
  function injectStyles() {
    if (document.getElementById('dp-ws-styles')) return;
    const s = document.createElement('style');
    s.id = 'dp-ws-styles';
    s.textContent = `
      .dp-view{width:100%} .dp-view--hidden{display:none} .dp-view--active{display:block}
      @keyframes dpSL{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(-24px)}}
      @keyframes dpSR{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
      @keyframes dpOR{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(24px)}}
      @keyframes dpOL{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:translateX(0)}}
      @keyframes dpPSL{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(-20px)}}
      @keyframes dpPSR{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(20px)}}
      @keyframes dpPIR{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
      @keyframes dpPIL{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
      @keyframes dpSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      @keyframes statusPulse{0%{box-shadow:0 0 0 0 rgba(16,185,129,.55)}70%{box-shadow:0 0 0 5px rgba(16,185,129,0)}100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}}

      /* Header buttons */
      .dp-btn-hero{padding:9px 20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;gap:7px;box-shadow:0 4px 14px rgba(99,102,241,.38);transition:all .2s;}
      .dp-btn-hero:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(99,102,241,.52);}
      .dp-btn-ghost{padding:9px 16px;background:rgba(255,255,255,.05);color:var(--text-secondary);border:1px solid rgba(255,255,255,.09);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;gap:6px;transition:all .2s;}
      .dp-btn-ghost:hover{background:rgba(255,255,255,.09);color:var(--text-primary);}

      /* Site cards */
      .dp-sites-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:16px;margin-top:6px;}
      .dp-sites-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:60px 30px;border:2px dashed rgba(99,102,241,.12);border-radius:20px;background:rgba(99,102,241,.02);text-align:center;}
      .dp-site-card{position:relative;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(160deg,rgba(18,18,30,.98),rgba(11,11,20,.99));border:1px solid rgba(var(--sc-r,99),var(--sc-g,102),var(--sc-b,241),.62);border-radius:18px;cursor:pointer;animation:fadeUp .35s ease both;transition:transform .22s cubic-bezier(.25,.8,.25,1),box-shadow .22s,border-color .22s;box-shadow:0 4px 24px rgba(0,0,0,.35),0 0 20px rgba(var(--sc-r,99),var(--sc-g,102),var(--sc-b,241),.38);}
      .dp-site-card:hover{transform:translateY(-6px) scale(1.01);border-color:rgba(var(--sc-r,99),var(--sc-g,102),var(--sc-b,241),1.0);box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 45px rgba(var(--sc-r,99),var(--sc-g,102),var(--sc-b,241),.88);}
      .dp-site-card:hover .dp-site-card-glow{opacity:1;background:radial-gradient(circle at 50% 0%,rgba(var(--sc-r,99),var(--sc-g,102),var(--sc-b,241),.55) 0%,transparent 70%);} .dp-site-card:hover .dp-site-card-foot{color:#a5b4fc;}
      .dp-site-card-glow{position:absolute;inset:0;pointer-events:none;opacity:0.8;transition:opacity .25s,background .25s;background:radial-gradient(circle at 50% 0%,rgba(var(--sc-r,99),var(--sc-g,102),var(--sc-b,241),.28) 0%,transparent 70%);}
      .dp-site-card-bar{height:3px;flex-shrink:0;background:linear-gradient(90deg,transparent,rgba(var(--sc-r,99),var(--sc-g,102),var(--sc-b,241),.9) 50%,transparent);}
      .dp-site-dot{width:7px;height:7px;border-radius:50%;border:1px solid rgba(0,0,0,.4);display:inline-block;flex-shrink:0;}
      .dp-site-dot.on{background:#10b981;animation:statusPulse 2.2s ease-in-out infinite;} .dp-site-dot.off{background:var(--text-placeholder);}
      .dp-site-card-toggle{position:absolute;top:10px;right:10px;z-index:10;display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;padding:3px 9px;border-radius:12px;border:1px solid rgba(255,255,255,.12);cursor:pointer;outline:none;transition:all .2s ease;user-select:none;font-family:'Inter',sans-serif;}
      .dp-site-card-toggle--on{background:rgba(16,185,129,.15);color:#34d399;border-color:rgba(16,185,129,.35);}
      .dp-site-card-toggle--on:hover{background:rgba(239,68,68,.2);color:#f87171;border-color:rgba(239,68,68,.4);box-shadow:0 0 12px rgba(239,68,68,.25);}
      .dp-site-card-toggle--off{background:rgba(239,68,68,.15);color:#f87171;border-color:rgba(239,68,68,.35);}
      .dp-site-card-toggle--off:hover{background:rgba(16,185,129,.2);color:#34d399;border-color:rgba(16,185,129,.4);box-shadow:0 0 12px rgba(16,185,129,.25);}
      .dp-site-slug{display:inline-block;font-size:10px;color:#a5b4fc;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);padding:2px 9px;border-radius:20px;font-family:var(--font-mono);}
      .dp-site-slug--warn{color:#ef4444;background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.2);}
      .dp-site-card-pages{scrollbar-width:none;}
      .dp-site-card-pages::-webkit-scrollbar{display:none;}
      .dp-site-page-pill{font-size:9.5px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);color:var(--text-secondary);padding:2px 8px;border-radius:6px;display:inline-flex;align-items:center;cursor:pointer;transition:all .15s;font-weight:600;}
      .dp-site-page-pill:hover{background:rgba(var(--sc-r,99),var(--sc-g,102),var(--sc-b,241),.08);border-color:rgba(var(--sc-r,99),var(--sc-g,102),var(--sc-b,241),.35);color:var(--text-primary);transform:translateY(-1px);}
      .dp-page-pill-dot{width:5px;height:5px;border-radius:50%;margin-right:5px;}
      .dp-card--highlight{border-color:#6366f1 !important;box-shadow:0 0 20px rgba(99,102,241,.35) !important;}
      .dp-sc-stat{flex:1;display:flex;flex-direction:column;align-items:center;padding:6px 4px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);border-radius:9px;color:var(--text-secondary);}
      .dp-sc-stat--g{background:rgba(16,185,129,.07);border-color:rgba(16,185,129,.12);color:#10b981;}
      .dp-site-card-foot{padding:10px 16px;border-top:1px solid rgba(255,255,255,.04);font-size:11px;font-weight:600;color:var(--text-muted);display:flex;align-items:center;gap:5px;transition:color .18s;}

      /* Workspace nav */
      .dp-ws-nav{display:flex;align-items:center;gap:8px;margin-bottom:18px;}
      .dp-ws-back-btn{display:flex;align-items:center;gap:7px;padding:7px 14px;background:rgba(255,255,255,.04);color:var(--text-tertiary);border:1px solid rgba(255,255,255,.08);border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all .18s;}
      .dp-ws-back-btn:hover{background:rgba(255,255,255,.09);color:var(--text-primary);}

      /* Hero */
      .dp-ws-hero{position:relative;overflow:hidden;border-radius:18px;border:1px solid rgba(255,255,255,.08);margin-bottom:18px;background:linear-gradient(145deg,rgba(15,15,26,.98),rgba(10,10,18,.99));box-shadow:0 8px 36px rgba(0,0,0,.4);}
      .dp-ws-hero-bg{position:absolute;inset:0;pointer-events:none;}
      .dp-ws-hero-body{position:relative;display:flex;align-items:center;gap:18px;padding:20px 24px;flex-wrap:wrap;}
      .dp-ws-logo{width:60px;height:60px;border-radius:15px;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.12);box-shadow:0 6px 20px rgba(0,0,0,.5);flex-shrink:0;}
      .dp-ws-stats{display:flex;gap:8px;flex-shrink:0;}
      .dp-hero-badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.06);color:var(--text-muted);border:1px solid rgba(255,255,255,.08);}
      .dp-hero-badge--g{background:rgba(16,185,129,.1);color:#34d399;border-color:rgba(16,185,129,.2);}
      .dp-hero-badge--btn{cursor:pointer;transition:all .2s ease;outline:none;}
      .dp-hero-badge--btn:hover{transform:scale(1.05);filter:brightness(1.2);box-shadow:0 0 12px rgba(99,102,241,.3);}
      .dp-hero-badge--btn:active{transform:scale(0.97);}
      .dp-hero-badge--off{background:rgba(239,68,68,.1);color:#f87171;border-color:rgba(239,68,68,.2);}
      .dp-hero-code{font-family:var(--font-mono);font-size:11px;color:#818cf8;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);padding:2px 8px;border-radius:6px;}
      .dp-hero-stat{text-align:center;padding:8px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:11px;min-width:74px;}
      .dp-hero-stat--g{background:rgba(16,185,129,.07);border-color:rgba(16,185,129,.12);}

      /* Tab bar */
      .dp-tab-bar{display:flex;align-items:center;gap:2px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:0;position:relative;padding-bottom:0;}
      .dp-tab{display:flex;align-items:center;gap:6px;padding:10px 16px;font-size:12px;font-weight:600;color:var(--text-muted);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:'Inter',sans-serif;transition:all .18s;margin-bottom:-1px;white-space:nowrap;}
      .dp-tab:hover{color:var(--text-secondary);}
      .dp-tab--active{color:#a5b4fc;border-bottom-color:#6366f1;}
      .dp-tab-pill{font-size:10px;font-weight:700;min-width:18px;padding:1px 5px;background:rgba(99,102,241,.15);color:#818cf8;border-radius:20px;text-align:center;}
      .dp-tab-bar-line{flex:1;}

      /* Panels */
      .dp-panels-wrap{background:linear-gradient(145deg,rgba(14,14,24,.98),rgba(10,10,18,.99));border:1px solid rgba(255,255,255,.07);border-top:none;border-radius:0 0 18px 18px;box-shadow:0 4px 20px rgba(0,0,0,.25);}
      .dp-panel{display:none;} .dp-panel--active{display:block;}
      .dp-panel-inner{padding:22px 24px;}

      /* Upload panel */
      .dp-upload-hint{display:flex;align-items:flex-start;gap:14px;margin-bottom:18px;}
      .dp-upload-hint-icon{width:42px;height:42px;border-radius:10px;background:rgba(139,92,246,.12);border:1px solid rgba(139,92,246,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#a78bfa;}
      .dp-drop-zone{border:2px dashed rgba(139,92,246,.2);border-radius:14px;padding:30px 24px;text-align:center;background:rgba(139,92,246,.02);transition:all .2s;}
      .dp-drop-zone--over{border-color:rgba(139,92,246,.55);background:rgba(139,92,246,.07);}
      .dp-drop-icon-wrap{width:56px;height:56px;border-radius:14px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.18);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;color:#a78bfa;}
      .dp-pick-btn{display:inline-flex;align-items:center;gap:7px;padding:9px 20px;background:rgba(139,92,246,.14);color:#c4b5fd;border:1px solid rgba(139,92,246,.28);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all .2s;}
      .dp-pick-btn:hover{background:rgba(139,92,246,.22);border-color:rgba(139,92,246,.45);}
      .dp-upload-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 22px;background:rgba(16,185,129,.08);color:#6ee7b7;border:1px solid rgba(16,185,129,.15);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;opacity:.4;pointer-events:none;transition:all .2s;}
      .dp-upload-btn--on{background:linear-gradient(135deg,#10b981,#059669);color:#fff;border-color:transparent;opacity:1;pointer-events:auto;box-shadow:0 4px 14px rgba(16,185,129,.35);}
      .dp-upload-btn--on:hover{box-shadow:0 6px 20px rgba(16,185,129,.5);transform:translateY(-1px);}
      .dp-fp-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
      .dp-fp-count{font-size:12px;font-weight:700;color:#10b981;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);padding:3px 10px;border-radius:20px;}
      .dp-fp-skip{font-size:11px;color:var(--text-secondary);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);padding:3px 8px;border-radius:20px;}
      .dp-fp-chips{display:flex;flex-wrap:wrap;gap:5px;}
      .dp-fp-chip{font-size:10px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.18);color:#6ee7b7;padding:2px 8px;border-radius:5px;font-family:var(--font-mono);}
      .dp-fp-chip--more{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08);color:var(--text-muted);}
      .dp-fp-warn{font-size:12px;color:#f59e0b;font-weight:600;}

      /* Files panel */
      .dp-files-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 20px;text-align:center;}
      .dp-files-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.06);}
      .dp-files-table{display:flex;flex-direction:column;gap:6px;}
      .dp-file-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);transition:background .15s;}
      .dp-file-row--linked{border-color:rgba(16,185,129,.12);background:rgba(16,185,129,.03);}
      .dp-file-row--unlinked{border-color:rgba(239,68,68,.1);background:rgba(239,68,68,.02);}
      .dp-file-row:hover{background:rgba(255,255,255,.04);}
      .dp-file-icon-wrap{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-muted);}
      .dp-file-badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap;}
      .dp-file-badge--linked{background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.22);color:#34d399;}
      .dp-file-badge--unlinked{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);color:#f87171;}
      .dp-file-add-btn{font-size:11px;font-weight:600;padding:4px 10px;background:rgba(99,102,241,.1);color:#818cf8;border:1px solid rgba(99,102,241,.22);border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;transition:all .18s;}
      .dp-file-add-btn:hover{background:rgba(99,102,241,.2);border-color:rgba(99,102,241,.35);}
      .dp-file-delete-btn{width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(239,68,68,.08);color:#f87171;border:1px solid rgba(239,68,68,.15);border-radius:6px;cursor:pointer;transition:all .18s;flex-shrink:0;}
      .dp-file-delete-btn:hover{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.3);transform:scale(1.05);}
      .dp-file-download-btn{width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(99,102,241,.08);color:#818cf8;border:1px solid rgba(99,102,241,.15);border-radius:6px;cursor:pointer;transition:all .18s;flex-shrink:0;}
      .dp-file-download-btn:hover{background:rgba(99,102,241,.15);border-color:rgba(99,102,241,.3);transform:scale(1.05);}

      /* Preview & Analytics buttons */
      .dp-btn-preview{background:rgba(139,92,246,.1);color:#a78bfa;border-color:rgba(139,92,246,.2);}
      .dp-btn-preview:hover{background:rgba(139,92,246,.2);border-color:rgba(139,92,246,.35);}
      .dp-btn-analytics{background:rgba(99,102,241,.1);color:#818cf8;border-color:rgba(99,102,241,.2);}
      .dp-btn-analytics:hover{background:rgba(99,102,241,.2);border-color:rgba(99,102,241,.35);}
      .dp-preview-size-btn{padding:7px 14px;background:rgba(255,255,255,.04);color:var(--text-secondary);border:1px solid rgba(255,255,255,.08);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:all .18s;text-decoration:none;display:inline-flex;align-items:center;gap:6px;font-family:'Inter',sans-serif;}
      .dp-preview-size-btn:hover{background:rgba(255,255,255,.07);color:var(--text-primary);}
      .dp-preview-size-btn--active{background:rgba(99,102,241,.15);color:#818cf8;border-color:rgba(99,102,241,.3);}
      .dp-analytics-stat{transition:transform .2s;}
      .dp-analytics-stat:hover{transform:translateY(-2px);}

      /* Bulk operations */
      .dp-bulk-checkbox{position:absolute;top:12px;right:12px;width:18px;height:18px;cursor:pointer;z-index:2;accent-color:#6366f1;opacity:0;transition:opacity .2s;}
      .dp-card:hover .dp-bulk-checkbox{opacity:1;}
      .dp-bulk-checkbox:checked{opacity:1;}
      .dp-card--selected{border-color:#6366f1 !important;background:rgba(99,102,241,.05) !important;}
      .dp-card--selected .dp-bulk-checkbox{opacity:1;}
      .dp-bulk-toolbar{display:none;align-items:center;gap:12px;padding:12px 16px;background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(139,92,246,.08));border:1px solid rgba(99,102,241,.25);border-radius:12px;margin-bottom:16px;animation:slideDown .3s ease;}
      .dp-bulk-action-btn{padding:7px 14px;background:rgba(255,255,255,.08);color:var(--text-primary);border:1px solid rgba(255,255,255,.12);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:inline-flex;align-items:center;gap:6px;transition:all .18s;}
      .dp-bulk-action-btn:hover{background:rgba(255,255,255,.14);transform:translateY(-1px);}
      .dp-bulk-action-btn--danger{background:rgba(239,68,68,.12);color:#f87171;border-color:rgba(239,68,68,.25);}
      .dp-bulk-action-btn--danger:hover{background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.35);}
      .dp-bulk-action-btn--ghost{background:transparent;border-color:rgba(255,255,255,.08);}
      @keyframes slideDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}

      /* Files filter bar */
      .dp-files-filter-bar{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}
      .dp-files-filter-pills{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1;}
      .dp-filter-pill{padding:5px 12px;background:rgba(255,255,255,.04);color:var(--text-muted);border:1px solid rgba(255,255,255,.08);border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all .18s;white-space:nowrap;}
      .dp-filter-pill:hover{background:rgba(255,255,255,.08);color:var(--text-secondary);}
      .dp-filter-pill--active{background:rgba(99,102,241,.15);color:#a5b4fc;border-color:rgba(99,102,241,.3);}
      .dp-files-search-input{flex:1;min-width:120px;max-width:220px;padding:6px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:var(--text-primary);font-size:12px;font-family:'Inter',sans-serif;outline:none;transition:border-color .18s;}
      .dp-files-search-input:focus{border-color:rgba(99,102,241,.4);}
      .dp-files-search-input::placeholder{color:var(--text-placeholder);}

      /* Files bulk bar */
      .dp-files-bulk-bar{align-items:center;gap:12px;padding:10px 14px;background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(139,92,246,.06));border:1px solid rgba(99,102,241,.22);border-radius:10px;margin-bottom:10px;animation:slideDown .25s ease;}

      /* File row checkbox + selected state */
      .dp-file-checkbox{width:16px;height:16px;cursor:pointer;accent-color:#6366f1;flex-shrink:0;opacity:0;transition:opacity .15s;}
      .dp-file-row:hover .dp-file-checkbox,.dp-file-checkbox:checked{opacity:1;}
      .dp-file-row--selected{border-color:rgba(99,102,241,.35) !important;background:rgba(99,102,241,.06) !important;}
      .dp-file-row--selected .dp-file-checkbox{opacity:1;}

      /* Tag-chip field input */
      .dp-tag-chip-wrap{display:flex;flex-wrap:wrap;gap:5px;padding:8px 10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;min-height:42px;cursor:text;transition:border-color .2s;position:relative;}
      .dp-tag-chip-wrap:focus-within{border-color:#6366f1;}
      .dp-tag-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;background:rgba(99,102,241,.14);border:1px solid rgba(99,102,241,.28);border-radius:20px;font-size:11px;color:#a5b4fc;font-family:var(--font-mono);white-space:nowrap;}
      .dp-tag-chip-remove{cursor:pointer;font-size:14px;line-height:1;color:#818cf8;opacity:.7;transition:opacity .15s;background:none;border:none;padding:0;display:flex;align-items:center;}
      .dp-tag-chip-remove:hover{opacity:1;}
      .dp-chip-input{flex:1;min-width:80px;background:transparent;border:none;outline:none;color:var(--text-primary);font-size:12px;font-family:'Inter',sans-serif;padding:2px 4px;}
      .dp-chip-input::placeholder{color:var(--text-placeholder);}
      .dp-chip-dropdown{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#1a1a2e;border:1px solid rgba(99,102,241,.25);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.5);z-index:100;max-height:200px;overflow-y:auto;display:none;}
      .dp-chip-dropdown.open{display:block;}
      .dp-chip-option{padding:8px 12px;font-size:12px;color:var(--text-secondary);cursor:pointer;transition:background .12s;border-bottom:1px solid rgba(255,255,255,.04);}
      .dp-chip-option:last-child{border-bottom:none;}
      .dp-chip-option:hover,.dp-chip-option.highlighted{background:rgba(99,102,241,.12);color:var(--text-primary);}
      .dp-chip-option-val{font-family:var(--font-mono);font-size:10px;color:#818cf8;margin-left:6px;}

      /* Searchable combobox — field mapper rows */
      .dp-sbox{position:relative;flex:1;min-width:0;}
      .dp-sbox-trigger{display:flex;align-items:center;justify-content:space-between;gap:6px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#e5e7eb;border-radius:6px;padding:5px 9px;font-size:12px;font-family:'Inter',sans-serif;cursor:pointer;user-select:none;min-width:0;width:100%;transition:border-color .15s;}
      .dp-sbox-trigger:hover,.dp-sbox-trigger.open{border-color:rgba(99,102,241,.5);}
      .dp-sbox-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;}
      .dp-sbox-arrow{flex-shrink:0;opacity:.5;transition:transform .15s;}
      .dp-sbox-trigger.open .dp-sbox-arrow{transform:rotate(180deg);}
      .dp-sbox-panel{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:9999;background:#1a1a2e;border:1px solid rgba(99,102,241,.3);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.7);display:none;flex-direction:column;min-width:220px;}
      .dp-sbox-panel.open{display:flex;}
      .dp-sbox-search-wrap{padding:8px 8px 6px;border-bottom:1px solid rgba(255,255,255,.06);}
      .dp-sbox-search{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#f1f5f9;padding:5px 10px;font-size:12px;font-family:'Inter',sans-serif;outline:none;box-sizing:border-box;}
      .dp-sbox-search:focus{border-color:rgba(99,102,241,.5);}
      .dp-sbox-search::placeholder{color:var(--text-placeholder);}
      .dp-sbox-list{overflow-y:auto;max-height:220px;padding:4px 0;}
      .dp-sbox-group{padding:5px 10px 2px;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;pointer-events:none;border-top:1px solid rgba(255,255,255,.05);margin-top:2px;}
      .dp-sbox-item{padding:6px 12px;font-size:12px;color:var(--text-secondary);cursor:pointer;transition:background .1s;display:flex;align-items:center;gap:8px;}
      .dp-sbox-item:hover,.dp-sbox-item.active{background:rgba(99,102,241,.14);color:#f1f5f9;}
      .dp-sbox-item-icon{font-size:14px;flex-shrink:0;width:18px;text-align:center;}
      .dp-sbox-item-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .dp-sbox-item-val{font-family:var(--font-mono);font-size:10px;color:#818cf8;flex-shrink:0;opacity:.6;}
      .dp-sbox-combine{flex:0 0 220px;}
      .dp-sbox-combine .dp-sbox-trigger{background:rgba(255,255,255,.07);border-color:rgba(249,115,22,.35);color:#fb923c;}
      .dp-sbox-combine .dp-sbox-trigger:hover, .dp-sbox-combine .dp-sbox-trigger.open{border-color:rgba(249,115,22,.7);}
      .dp-sbox-empty{padding:10px 12px;font-size:12px;color:var(--text-muted);text-align:center;}
    `;
    document.head.appendChild(s);
  }

  return { injectStyles };
})();
