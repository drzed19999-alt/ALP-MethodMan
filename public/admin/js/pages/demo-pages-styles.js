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
      .dp-site-card--disabled{background:linear-gradient(160deg,rgba(40,10,15,.98),rgba(20,5,8,.99))!important;border-color:rgba(239,68,68,.45)!important;box-shadow:0 4px 24px rgba(0,0,0,.5),0 0 25px rgba(239,68,68,.25)!important;}
      .dp-site-card--disabled .dp-site-card-glow{background:radial-gradient(circle at 50% 0%,rgba(239,68,68,.3) 0%,transparent 70%)!important;opacity:1!important;}
      .dp-site-card--disabled .dp-site-card-bar{background:linear-gradient(90deg,transparent,rgba(239,68,68,.85) 50%,transparent)!important;}
      .dp-site-card--disabled:hover{border-color:rgba(239,68,68,.85)!important;box-shadow:0 18px 50px rgba(0,0,0,.65),0 0 45px rgba(239,68,68,.45)!important;}
      /* Card navbar strip */
      .dp-site-card-nav{display:flex;align-items:center;gap:7px;padding:5px 11px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.14);flex-shrink:0;}
      .dp-nav-lbl{font-size:9.5px;font-weight:700;letter-spacing:.03em;}
      .dp-nav-lbl--on{color:#34d399;}
      .dp-nav-lbl--off{color:#f87171;}
      /* Card body layout — compact */
      .dp-site-card-body{padding:10px 13px 9px;flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
      /* Scrollable domains list */
      .dp-site-domains-list{max-height:50px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.08) transparent;}
      .dp-site-domains-list::-webkit-scrollbar{width:3px;}
      .dp-site-domains-list::-webkit-scrollbar-track{background:transparent;}
      .dp-site-domains-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px;}
      /* Configure domains button */
      .dp-domains-cfg-btn{font-size:8.5px;font-weight:700;padding:2px 6px;background:rgba(245,158,11,.1);color:#f59e0b;border:1px solid rgba(245,158,11,.2);border-radius:6px;cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:3px;}
      .dp-domains-cfg-btn:hover{background:rgba(245,158,11,.2);border-color:rgba(245,158,11,.4);}
      /* Toggle button (in navbar, not absolute) */
      .dp-site-card-toggle{display:inline-flex;align-items:center;gap:5px;font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.12);cursor:pointer;outline:none;transition:all .2s ease;user-select:none;font-family:'Inter',sans-serif;}
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
      .dp-site-card-foot{padding:10px 16px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;font-weight:700;color:#a5b4fc;background:rgba(99,102,241,.08);display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;transition:all .18s ease;user-select:none;}
      .dp-site-card-foot:hover{background:rgba(99,102,241,.22);color:#fff;}
      .dp-site-card--disabled .dp-site-card-foot{background:rgba(239,68,68,.12);color:#f87171;border-top-color:rgba(239,68,68,.2);}
      .dp-site-card--disabled .dp-site-card-foot:hover{background:rgba(239,68,68,.28);color:#fff;}

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
      /* File-tab preview device toggle — mirrors the Registry preview buttons */
      .dpf-preview-size-btn{padding:7px 12px;background:rgba(255,255,255,.04);color:var(--text-secondary);border:1px solid rgba(255,255,255,.08);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all .18s;text-decoration:none;display:inline-flex;align-items:center;gap:5px;font-family:'Inter',sans-serif;white-space:nowrap;}
      .dpf-preview-size-btn:hover{background:rgba(255,255,255,.08);color:var(--text-primary);}
      .dpf-preview-size-btn--active{background:rgba(245,158,11,.15);color:#f59e0b;border-color:rgba(245,158,11,.32);}
      [data-theme='light'] .dpf-preview-size-btn{background:#F8FAFC;color:#475569;border-color:#E2E8F0;}
      [data-theme='light'] .dpf-preview-size-btn:hover{background:#F1F5F9;color:#0F172A;}
      [data-theme='light'] .dpf-preview-size-btn--active{background:#0F172A;color:#FFFFFF;border-color:#0F172A;}
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
      /* Type-picker combobox — fills its form group and gets bigger padding
         to match native input hit-area in the modal */
      .dp-sbox--type { display:block; width:100%; }
      .dp-sbox--type .dp-sbox-trigger { padding:9px 12px; font-size:13px; border-radius:8px; min-height:42px; }
      .dp-sbox--type .dp-sbox-panel { min-width:0; max-height:400px; }
      .dp-sbox--type .dp-sbox-list { max-height:280px; }

      /* Multi-select trigger — chips wrap inside the trigger */
      .dp-sbox-trigger--multi { align-items:flex-start; padding:6px 10px !important; }
      .dp-sbox-chips { display:flex; flex-wrap:wrap; gap:5px; flex:1; min-width:0; align-items:center; padding:2px 0; }
      .dp-sbox-placeholder { color:var(--text-placeholder); font-size:12px; padding:2px 0; }
      .dp-sbox-chip { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:600; background:rgba(148,163,184,.1); border:1px solid rgba(148,163,184,.2); color:var(--text-primary); }
      .dp-sbox-chip-x { margin-left:2px; padding:0 3px; font-size:14px; line-height:1; cursor:pointer; opacity:.6; border-radius:8px; }
      .dp-sbox-chip-x:hover { opacity:1; background:rgba(255,255,255,.1); }

      /* Multi mode toolbar (Clear button) */
      .dp-sbox-multi-toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; border-bottom:1px solid rgba(255,255,255,.05); background:rgba(0,0,0,.15); }
      .dp-sbox-hint { font-size:10px; color:var(--text-muted); flex:1; }
      .dp-sbox-clear { padding:3px 10px; font-size:11px; border-radius:5px; background:rgba(239,68,68,.1); color:#f87171; border:1px solid rgba(239,68,68,.2); cursor:pointer; font-family:'Inter',sans-serif; }
      .dp-sbox-clear:hover { background:rgba(239,68,68,.2); }

      /* Multi-mode item checkbox column */
      .dp-sbox-item--multi { padding-left:8px; }
      .dp-sbox-check { display:inline-block; width:16px; text-align:center; color:#10b981; font-weight:900; flex-shrink:0; }
      .dp-sbox-item--multi.active { background:rgba(16,185,129,.08); }
      .dp-sbox-item--multi.active .dp-sbox-check { color:#34d399; }

      /* Card: type badge stack (was single badge; now up to 3 side-by-side) */
      .dp-type-badge-group { display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end; max-width:60%; }
      .dp-type-badge { display:inline-block; padding:2px 8px; font-size:9px; font-weight:800; border-radius:10px; letter-spacing:.02em; white-space:nowrap; }

      [data-theme='light'] .dp-sbox-multi-toolbar { background:#F8FAFC; border-bottom-color:#E2E8F0; }
      [data-theme='light'] .dp-sbox-chip-x:hover { background:#F1F5F9; }
      .dp-sbox-empty { padding:12px; text-align:center; color:var(--text-muted); font-size:12px; }
      [data-theme='light'] .dp-sbox-trigger { background:#FFFFFF; border-color:#CBD5E1; color:#0F172A; }
      [data-theme='light'] .dp-sbox-trigger:hover, [data-theme='light'] .dp-sbox-trigger.open { border-color:#0F172A; }
      [data-theme='light'] .dp-sbox-panel { background:#FFFFFF; border-color:#CBD5E1; box-shadow:0 12px 32px rgba(0,0,0,.12); }
      [data-theme='light'] .dp-sbox-search { background:#F8FAFC; border-color:#CBD5E1; color:#0F172A; }
      [data-theme='light'] .dp-sbox-search:focus { border-color:#0F172A; }
      [data-theme='light'] .dp-sbox-item { color:#475569; }
      [data-theme='light'] .dp-sbox-item:hover, [data-theme='light'] .dp-sbox-item.active { background:#F1F5F9; color:#0F172A; }
      [data-theme='light'] .dp-sbox-item-val { color:#94A3B8; }
      [data-theme='light'] .dp-sbox-group { color:#475569; border-top-color:#E2E8F0; }
      .dp-sbox-combine .dp-sbox-trigger{background:rgba(255,255,255,.07);border-color:rgba(249,115,22,.35);color:#fb923c;}
      .dp-sbox-combine .dp-sbox-trigger:hover, .dp-sbox-combine .dp-sbox-trigger.open{border-color:rgba(249,115,22,.7);}
      .dp-sbox-empty{padding:10px 12px;font-size:12px;color:var(--text-muted);text-align:center;}

      /* ─── Gold Premium Theme ──────────────────────────────────────────────── */
      .dp-tab--active { color: #f59e0b !important; border-bottom-color: #f59e0b !important; }
      .dp-tab-pill { background: rgba(245,158,11,.12) !important; color: #f59e0b !important; }
      .dp-tab:hover { color: #fbbf24; }

      /* Stats bar */
      .dp-files-stats-bar { display:flex; align-items:center; gap:8px; padding:10px 14px; background:rgba(245,158,11,.04); border:1px solid rgba(245,158,11,.1); border-radius:12px; margin-bottom:14px; flex-wrap:wrap; }
      .dp-stat-chip { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; cursor:default; transition:all .15s; white-space:nowrap; }
      .dp-stat-chip:hover { filter:brightness(1.2); transform:scale(1.03); }
      .dp-stat-chip--total  { background:rgba(245,158,11,.1);  color:#f59e0b; border:1px solid rgba(245,158,11,.2);  }
      .dp-stat-chip--html   { background:rgba(249,115,22,.1);  color:#f97316; border:1px solid rgba(249,115,22,.2);  }
      .dp-stat-chip--css    { background:rgba(56,189,248,.1);   color:#38bdf8; border:1px solid rgba(56,189,248,.2);   }
      .dp-stat-chip--js     { background:rgba(245,158,11,.1);  color:#f59e0b; border:1px solid rgba(245,158,11,.2);  }
      .dp-stat-chip--images { background:rgba(16,185,129,.1);  color:#10b981; border:1px solid rgba(16,185,129,.2);  }
      .dp-stat-chip--fonts  { background:rgba(168,85,247,.1);  color:#a855f7; border:1px solid rgba(168,85,247,.2);  }
      .dp-stat-chip--other  { background:rgba(100,116,139,.08);color:#94a3b8; border:1px solid rgba(100,116,139,.15); }

      /* Type filter row */
      .dp-type-filter-bar { display:flex; align-items:center; gap:6px; margin-bottom:10px; flex-wrap:wrap; }
      .dp-type-pill { padding:4px 11px; border-radius:20px; font-size:11px; font-weight:700; cursor:pointer; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.04); color:var(--text-muted); font-family:'Inter',sans-serif; transition:all .18s; white-space:nowrap; }
      .dp-type-pill:hover { background:rgba(255,255,255,.09); color:var(--text-secondary); }
      .dp-type-pill--active { background:rgba(245,158,11,.14); color:#f59e0b; border-color:rgba(245,158,11,.32); box-shadow:0 0 10px rgba(245,158,11,.15); }

      /* Sort + status filter row */
      .dp-files-controls { display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
      .dp-sort-select { padding:5px 10px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); border-radius:8px; color:var(--text-secondary); font-size:11px; font-family:'Inter',sans-serif; cursor:pointer; outline:none; }
      .dp-sort-select:focus { border-color:rgba(245,158,11,.35); }

      /* Enhanced file row */
      .dp-file-row { display:flex; align-items:center; gap:12px; padding:11px 14px; border-radius:12px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.02); transition:background .15s,border-color .15s,box-shadow .15s; }
      .dp-file-row:hover { background:rgba(255,255,255,.05); border-color:rgba(245,158,11,.15); box-shadow:0 2px 12px rgba(0,0,0,.15); }
      .dp-file-row--linked:hover { border-color:rgba(16,185,129,.25); }
      .dp-file-row--unlinked:hover { border-color:rgba(239,68,68,.2); }

      /* Type icon */
      .dp-file-type-icon { width:36px; height:36px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:10px; font-weight:900; letter-spacing:-.02em; font-family:'Inter',sans-serif; border:1px solid rgba(255,255,255,.07); }

      /* File name path styling */
      .dp-file-dir { color:var(--text-muted); font-size:11px; font-family:var(--font-mono); }
      .dp-file-basename { color:#f1f5f9; font-size:13px; font-weight:700; font-family:var(--font-mono); }

      /* Action buttons */
      .dp-file-preview-btn { display:inline-flex; align-items:center; gap:4px; padding:4px 9px; background:rgba(245,158,11,.1); color:#f59e0b; border:1px solid rgba(245,158,11,.22); border-radius:7px; font-size:10px; font-weight:700; cursor:pointer; font-family:'Inter',sans-serif; white-space:nowrap; transition:all .18s; flex-shrink:0; }
      .dp-file-preview-btn:hover { background:rgba(245,158,11,.2); border-color:rgba(245,158,11,.4); box-shadow:0 0 10px rgba(245,158,11,.2); }
      .dp-file-copy-btn { display:inline-flex; align-items:center; gap:3px; padding:2px 7px; background:rgba(255,255,255,.05); color:var(--text-muted); border:1px solid rgba(255,255,255,.08); border-radius:5px; font-size:10px; font-weight:600; cursor:pointer; font-family:'Inter',sans-serif; transition:all .15s; }
      .dp-file-copy-btn:hover { background:rgba(245,158,11,.1); color:#f59e0b; border-color:rgba(245,158,11,.2); }
      .dp-file-add-btn { background:rgba(245,158,11,.1) !important; color:#f59e0b !important; border-color:rgba(245,158,11,.22) !important; }
      .dp-file-add-btn:hover { background:rgba(245,158,11,.2) !important; border-color:rgba(245,158,11,.38) !important; }
      .dp-filter-pill--active { background:rgba(245,158,11,.12) !important; color:#f59e0b !important; border-color:rgba(245,158,11,.28) !important; }
      .dp-files-search-input:focus { border-color:rgba(245,158,11,.4) !important; }
      .dp-file-download-btn { background:rgba(255,255,255,.05) !important; color:var(--text-muted) !important; border-color:rgba(255,255,255,.1) !important; }
      .dp-file-download-btn:hover { background:rgba(245,158,11,.12) !important; color:#f59e0b !important; border-color:rgba(245,158,11,.25) !important; }

      /* View image / View code — same shape as Preview, different accents */
      .dp-file-viewimg-btn,
      .dp-file-viewcode-btn { display:inline-flex; align-items:center; gap:4px; padding:4px 9px; border-radius:7px; font-size:10px; font-weight:700; cursor:pointer; font-family:'Inter',sans-serif; white-space:nowrap; flex-shrink:0; transition:all .18s; }
      .dp-file-viewimg-btn  { background:rgba(16,185,129,.10); color:#10b981; border:1px solid rgba(16,185,129,.22); }
      .dp-file-viewimg-btn:hover  { background:rgba(16,185,129,.20); border-color:rgba(16,185,129,.4); box-shadow:0 0 10px rgba(16,185,129,.2); }
      .dp-file-viewcode-btn { background:rgba(59,130,246,.10); color:#60a5fa; border:1px solid rgba(59,130,246,.22); }
      .dp-file-viewcode-btn:hover { background:rgba(59,130,246,.20); border-color:rgba(59,130,246,.4); box-shadow:0 0 10px rgba(59,130,246,.2); }

      /* ══════════════════════════════════════════════════════════════════
         Registry toolbar — health strip + filter/search/sort/group
         ══════════════════════════════════════════════════════════════════ */
      .dp-reg-toolbar { position:sticky; top:0; z-index:5; background:var(--bg-primary); padding:8px 0 12px; margin:-4px 0 12px; border-bottom:1px solid var(--border-subtle); }
      [data-theme='light'] .dp-reg-toolbar { background:#FFFFFF; }
      .dp-reg-health { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px; padding:8px 12px; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.06); border-radius:8px; }
      [data-theme='light'] .dp-reg-health { background:#F8FAFC; border-color:#E2E8F0; }
      .dp-reg-h-item { font-size:11px; color:var(--text-secondary); display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:12px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); }
      .dp-reg-h-item strong { color:var(--text-primary); font-size:12px; font-weight:800; font-variant-numeric:tabular-nums; }
      .dp-reg-h-item--good strong { color:#10b981; }
      .dp-reg-h-item--bad { background:rgba(239,68,68,.08); border-color:rgba(239,68,68,.2); }
      .dp-reg-h-item--bad strong { color:#f87171; }
      .dp-reg-h-item--live strong { color:#f59e0b; }
      .dp-live-dot { width:6px; height:6px; border-radius:50%; background:#10b981; box-shadow:0 0 6px #10b981; animation:dpDotPulse 2s ease-in-out infinite; }
      @keyframes dpDotPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.5; transform:scale(1.3); } }

      .dp-reg-controls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .dp-reg-chips { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
      .dp-reg-chip { font-size:11px; font-weight:600; padding:5px 10px; border-radius:14px; background:rgba(255,255,255,.03); color:var(--text-secondary); border:1px solid rgba(255,255,255,.08); cursor:pointer; font-family:'Inter',sans-serif; white-space:nowrap; transition:all .15s; }
      .dp-reg-chip:hover { background:rgba(255,255,255,.06); color:var(--text-primary); }
      .dp-reg-chip--active { background:rgba(245,158,11,.14); color:#f59e0b; border-color:rgba(245,158,11,.32); }
      [data-theme='light'] .dp-reg-chip { background:#F8FAFC; color:#475569; border-color:#E2E8F0; }
      [data-theme='light'] .dp-reg-chip:hover { background:#F1F5F9; color:#0F172A; }
      [data-theme='light'] .dp-reg-chip--active { background:#0F172A; color:#FFFFFF; border-color:#0F172A; }

      .dp-reg-search { padding:6px 10px; font-size:12px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08); border-radius:6px; color:var(--text-primary); font-family:'Inter',sans-serif; outline:none; min-width:200px; }
      .dp-reg-search:focus { border-color:rgba(245,158,11,.4); background:rgba(255,255,255,.05); }
      [data-theme='light'] .dp-reg-search { background:#FFFFFF; border-color:#CBD5E1; }
      [data-theme='light'] .dp-reg-search:focus { border-color:#0F172A; box-shadow:0 0 0 2px rgba(15,23,42,.1); }

      /* Group headers */
      .dp-reg-group-header { display:flex; align-items:center; gap:8px; margin:14px 0 10px; padding:6px 0; font-size:12px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; border-bottom:1px solid var(--border-subtle); }
      .dp-reg-group-dot { width:8px; height:8px; border-radius:50%; }
      .dp-reg-group-count { font-size:10px; color:var(--text-muted); font-weight:600; padding:2px 6px; background:rgba(255,255,255,.04); border-radius:8px; margin-left:4px; }
      [data-theme='light'] .dp-reg-group-count { background:#F1F5F9; }
      .dp-reg-grid-inner { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:14px; }

      /* Field count chip on the "Captured Fields" label */
      .dp-field-count { display:inline-block; margin-left:6px; padding:1px 6px; font-size:9px; font-weight:800; background:rgba(255,255,255,.06); color:var(--text-muted); border-radius:8px; }
      [data-theme='light'] .dp-field-count { background:#F1F5F9; color:#475569; }

      /* Mapping pills (raw → canonical) */
      .dp-map-pill { display:inline-flex; align-items:center; gap:4px; padding:2px 7px; font-size:10px; background:rgba(99,102,241,.08); border:1px solid rgba(99,102,241,.18); color:#a5b4fc; border-radius:6px; margin-right:4px; margin-bottom:3px; font-family:var(--font-mono); }
      .dp-map-raw { color:var(--text-muted); }
      .dp-map-arrow { color:var(--text-muted); font-size:9px; }
      .dp-map-canon { color:#a5b4fc; font-weight:700; }
      [data-theme='light'] .dp-map-pill { background:#EFF6FF; border-color:#BFDBFE; color:#1D4ED8; }
      [data-theme='light'] .dp-map-raw { color:#64748B; }
      [data-theme='light'] .dp-map-canon { color:#1D4ED8; }

      /* Registry card action buttons */
      .dp-btn-testcap { background:rgba(245,158,11,.1) !important; color:#f59e0b !important; border-color:rgba(245,158,11,.22) !important; }
      .dp-btn-testcap:hover { background:rgba(245,158,11,.2) !important; border-color:rgba(245,158,11,.4) !important; }
      .dp-btn-rescan { background:rgba(20,184,166,.1) !important; color:#2dd4bf !important; border-color:rgba(20,184,166,.22) !important; }
      .dp-btn-rescan:hover { background:rgba(20,184,166,.2) !important; border-color:rgba(20,184,166,.4) !important; }
      .dp-btn-curl { background:rgba(139,92,246,.1) !important; color:#a78bfa !important; border-color:rgba(139,92,246,.22) !important; }
      .dp-btn-curl:hover { background:rgba(139,92,246,.2) !important; border-color:rgba(139,92,246,.4) !important; }
      .dp-btn-dup { width:28px !important; padding:0 !important; display:inline-flex !important; align-items:center; justify-content:center; }
      [data-theme='light'] .dp-btn-testcap  { background:#FFFBEB !important; color:#B45309 !important; border-color:#FDE68A !important; }
      [data-theme='light'] .dp-btn-rescan   { background:#ECFDF5 !important; color:#047857 !important; border-color:#A7F3D0 !important; }
      [data-theme='light'] .dp-btn-curl     { background:#EFF6FF !important; color:#1D4ED8 !important; border-color:#BFDBFE !important; }

      /* Card action bar — grid layout so 8 buttons wrap cleanly.
         Row 1: Preview · Analytics · Test · Rescan (auto-fit text buttons)
         Row 2: cURL (wide) · Duplicate · Edit · Delete (icon-only) */
      .dp-card .dp-card-actions {
        display:grid;
        grid-template-columns:1fr 1fr 1fr 1fr;
        gap:6px;
        padding-top:8px;
      }
      .dp-card .dp-card-actions .dp-btn {
        padding:7px 4px;
        font-size:11px;
        font-weight:600;
        gap:4px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        min-width:0;
        width:100%;
      }
      .dp-card .dp-card-actions .dp-btn svg { flex-shrink:0; }
      /* Force icon-only buttons to be square and self-contained */
      .dp-card .dp-card-actions .dp-btn-dup,
      .dp-card .dp-card-actions .dp-btn-edit,
      .dp-card .dp-card-actions .dp-btn-delete {
        justify-content:center;
        padding:7px 0;
      }
      /* Give text buttons a hover tooltip when text truncates */
      .dp-card .dp-card-actions .dp-btn { position:relative; }

      /* Card states — live pulse, orphan, capture pulse */
      .dp-card--live { box-shadow:0 0 0 1px rgba(16,185,129,.4), 0 0 16px rgba(16,185,129,.15); }
      .dp-card--orphan { opacity:.94; }
      @keyframes dpCardPulse {
        0%   { box-shadow:0 0 0 0 rgba(245,158,11,.5), 0 0 0 1px var(--dp-accent, #f59e0b); }
        50%  { box-shadow:0 0 0 8px rgba(245,158,11,0),  0 0 0 1px var(--dp-accent, #f59e0b); }
        100% { box-shadow:0 0 0 0 rgba(245,158,11,0),    0 0 0 1px var(--dp-accent, #f59e0b); }
      }
      .dp-card--pulse { animation:dpCardPulse 1.4s ease-out; }

      /* Flat / Tree segmented view control */
      .dp-view-seg { display:inline-flex; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08); border-radius:8px; padding:2px; gap:2px; flex-shrink:0; }
      .dp-view-seg-btn { padding:5px 10px; font-size:11px; font-weight:600; font-family:'Inter',sans-serif; background:transparent; border:0; color:var(--text-muted); border-radius:6px; cursor:pointer; transition:all .15s; white-space:nowrap; }
      .dp-view-seg-btn:hover { color:var(--text-primary); background:rgba(255,255,255,.04); }
      .dp-view-seg-btn--active { background:rgba(245,158,11,.14); color:#f59e0b; }
      .dp-view-seg-btn--active:hover { background:rgba(245,158,11,.2); }
      [data-theme='light'] .dp-view-seg { background:#F8FAFC; border-color:#E2E8F0; }
      [data-theme='light'] .dp-view-seg-btn { color:#64748B; }
      [data-theme='light'] .dp-view-seg-btn:hover { background:#F1F5F9; color:#0F172A; }
      [data-theme='light'] .dp-view-seg-btn--active { background:#0F172A; color:#FFFFFF; }
      [data-theme='light'] .dp-view-seg-btn--active:hover { background:#1E293B; }

      /* Rename / Replace — icon-only square buttons, same footprint as Download/Delete */
      .dp-file-rename-btn,
      .dp-file-replace-btn { width:28px; height:28px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.05); color:var(--text-muted); border:1px solid rgba(255,255,255,.1); border-radius:6px; cursor:pointer; transition:all .18s; flex-shrink:0; }
      .dp-file-rename-btn:hover  { background:rgba(245,158,11,.12); color:#f59e0b; border-color:rgba(245,158,11,.28); transform:scale(1.05); }
      .dp-file-replace-btn:hover { background:rgba(59,130,246,.12); color:#60a5fa; border-color:rgba(59,130,246,.28); transform:scale(1.05); }

      /* Light-mode overrides — spec: neutral surfaces + slate icons; upgrade CTA uses gold */
      [data-theme='light'] .dp-file-viewimg-btn  { background:#ECFDF5; color:#047857; border-color:#A7F3D0; }
      [data-theme='light'] .dp-file-viewimg-btn:hover  { background:#D1FAE5; border-color:#6EE7B7; box-shadow:none; }
      [data-theme='light'] .dp-file-viewcode-btn { background:#EFF6FF; color:#1D4ED8; border-color:#BFDBFE; }
      [data-theme='light'] .dp-file-viewcode-btn:hover { background:#DBEAFE; border-color:#93C5FD; box-shadow:none; }
      [data-theme='light'] .dp-file-rename-btn,
      [data-theme='light'] .dp-file-replace-btn { background:#F8FAFC; color:#475569; border-color:#CBD5E1; }
      [data-theme='light'] .dp-file-rename-btn:hover  { background:#FFFBEB; color:#B45309; border-color:#FDE68A; }
      [data-theme='light'] .dp-file-replace-btn:hover { background:#EFF6FF; color:#1D4ED8; border-color:#BFDBFE; }

      /* Search bar */
      .dp-search-bar-wrap { display:flex; align-items:center; gap:10px; flex-shrink:0; }
      .dp-search-bar-inner { display:flex; align-items:center; gap:8px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.09); border-radius:10px; padding:7px 12px; flex:1; max-width:400px; transition:border-color .2s, box-shadow .2s; }
      .dp-search-bar-inner:focus-within { border-color:rgba(99,102,241,.4); box-shadow:0 0 0 3px rgba(99,102,241,.1); }
      .dp-search-input { flex:1; background:none; border:none; outline:none; color:#f1f5f9; font-size:13px; font-family:'Inter',sans-serif; }
      .dp-search-input::placeholder { color:var(--text-placeholder); }
      .dp-search-clear { background:none; border:none; cursor:pointer; color:var(--text-muted); padding:0; display:flex; align-items:center; line-height:1; transition:color .15s; }
      .dp-search-clear:hover { color:#f87171; }
      .dp-search-count { font-size:11px; color:var(--text-muted); font-weight:600; white-space:nowrap; }

      /* Mini stats on page cards */
      .dp-card-mini-stats { display:flex; align-items:center; gap:10px; padding:6px 0; border-top:1px solid rgba(255,255,255,.05); border-bottom:1px solid rgba(255,255,255,.05); margin:6px 0; }
      .dp-mini-stat { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:var(--text-secondary); }
      .dp-mini-stat--g { color:#6ee7b7; }
      .dp-mini-stat--gold { color:#fcd34d; }
      .dp-mini-stat--muted { color:var(--text-muted); font-weight:400; }

      /* ─── Gold-Rush header (Scam Pages / The Vault) ────────────────────── */
      .dp-header--gold {
        display:flex; align-items:flex-start; justify-content:space-between; gap:20px;
        padding:22px 26px; margin-bottom:16px;
        background:
          radial-gradient(1200px 240px at 0% 0%, rgba(212,175,55,0.10), transparent 55%),
          linear-gradient(150deg, rgba(18,18,22,0.98), rgba(10,10,14,0.98));
        border:1px solid rgba(212,175,55,0.22);
        border-radius:16px;
        position:relative; overflow:hidden;
        box-shadow:0 8px 40px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(212,175,55,0.05);
      }
      .dp-header--gold::before {
        content:''; position:absolute; inset:0 0 auto 0; height:2px;
        background:linear-gradient(90deg, transparent, #D4AF37 40%, #FFD86E 50%, #D4AF37 60%, transparent);
        opacity:.75;
      }
      .dp-header-left { display:flex; flex-direction:column; gap:8px; min-width:0; flex:1; }
      .dp-header-eyebrow {
        display:inline-flex; align-items:center; gap:8px; align-self:flex-start;
        font-size:10px; font-weight:700; letter-spacing:1.4px; text-transform:uppercase;
        color:#D4AF37;
        padding:4px 10px; border-radius:99px;
        background:rgba(212,175,55,0.08); border:1px solid rgba(212,175,55,0.28);
      }
      .dp-header-eyebrow-dot {
        width:6px; height:6px; border-radius:50%; background:#D4AF37;
        box-shadow:0 0 8px #D4AF37;
        animation:dpGoldPulse 2.4s ease-in-out infinite;
      }
      @keyframes dpGoldPulse {
        0%,100% { opacity:1; transform:scale(1); }
        50%     { opacity:.55; transform:scale(1.25); }
      }
      .dp-title--gold {
        display:flex; align-items:center; gap:12px; flex-wrap:wrap;
        font-size:32px; font-weight:900; letter-spacing:-.5px; line-height:1.1;
        margin:0;
        background:linear-gradient(135deg, #FFF3B0 0%, #FFD86E 40%, #D4AF37 70%, #8B6914 100%);
        -webkit-background-clip:text; background-clip:text;
        -webkit-text-fill-color:transparent;
        text-shadow:0 2px 20px rgba(212,175,55,0.15);
      }
      .dp-title-glyph {
        display:inline-block;
        color:#D4AF37; -webkit-text-fill-color:#D4AF37;
        font-size:26px; line-height:1;
        text-shadow:0 0 12px rgba(212,175,55,0.7);
        animation:dpGoldGlow 3.5s ease-in-out infinite;
      }
      @keyframes dpGoldGlow {
        0%,100% { text-shadow:0 0 12px rgba(212,175,55,0.7); transform:rotate(0deg); }
        50%     { text-shadow:0 0 22px rgba(212,175,55,1); transform:rotate(180deg); }
      }
      .dp-title-count {
        font-size:14px; font-weight:700; letter-spacing:0;
        color:#D4AF37; -webkit-text-fill-color:#D4AF37;
        padding:3px 10px; border-radius:99px;
        background:rgba(212,175,55,0.10);
        border:1px solid rgba(212,175,55,0.28);
        text-shadow:none;
      }
      .dp-subtitle--gold {
        margin:0; font-size:13px; color:#94a3b8;
        display:flex; align-items:center; gap:6px; flex-wrap:wrap;
      }
      .dp-subtitle--gold > span:first-child,
      .dp-subtitle--gold #dp-hero-live-count { color:#10b981; font-weight:700; }
      .dp-subtitle--gold #dp-hero-off-count { color:#94a3b8; font-weight:700; }
      .dp-subtitle-sep { color:#4a4a54; margin:0 4px; }

      .dp-header-actions { display:flex; gap:10px; align-items:center; flex-shrink:0; }

      /* Gold-primary button */
      .dp-btn-hero--gold {
        background:linear-gradient(135deg, #FFD86E, #D4AF37 55%, #B8860B);
        color:#1a1600;
        border:1px solid rgba(255,216,110,.5);
        box-shadow:0 4px 16px rgba(212,175,55,.35), inset 0 1px 0 rgba(255,255,255,.35);
        text-shadow:0 1px 0 rgba(255,255,255,.25);
      }
      .dp-btn-hero--gold:hover {
        transform:translateY(-1px);
        box-shadow:0 6px 22px rgba(212,175,55,.55), inset 0 1px 0 rgba(255,255,255,.4);
        filter:brightness(1.05);
      }

      /* Gold-ghost + AI-ghost buttons */
      .dp-btn-ghost--gold {
        color:#D4AF37;
        border-color:rgba(212,175,55,.28);
        background:rgba(212,175,55,.06);
      }
      .dp-btn-ghost--gold:hover {
        color:#FFD86E; background:rgba(212,175,55,.12);
        border-color:rgba(212,175,55,.5);
      }
      .dp-btn-ghost--ai {
        color:#c084fc;
        border-color:rgba(139,92,246,.30);
        background:rgba(139,92,246,.08);
      }
      .dp-btn-ghost--ai:hover {
        color:#e9d5ff; background:rgba(139,92,246,.16);
        border-color:rgba(139,92,246,.5);
      }

      /* Gold search bar */
      .dp-search-bar-inner--gold {
        background:linear-gradient(180deg, rgba(212,175,55,0.05), rgba(212,175,55,0.02));
        border-color:rgba(212,175,55,0.22);
      }
      .dp-search-bar-inner--gold:focus-within {
        border-color:#D4AF37;
        box-shadow:0 0 0 3px rgba(212,175,55,.15);
      }
      .dp-search-bar-inner--gold .dp-search-input::placeholder { color:#78706b; }

      @media (max-width:820px) {
        .dp-header--gold { flex-direction:column; gap:14px; padding:18px 20px; }
        .dp-title--gold  { font-size:24px; }
        .dp-header-actions { width:100%; flex-wrap:wrap; }
      }

      /* ─── Filter Toolbar ───────────────────────────────────────────────── */
      .dp-toolbar-row { display:flex; align-items:center; gap:14px; margin-bottom:14px; flex-wrap:wrap; }
      .dp-filter-chips { display:flex; align-items:center; gap:6px; flex-wrap:wrap; flex:1; }
      .dp-chip { padding:5px 13px; background:rgba(255,255,255,.04); color:var(--text-muted); border:1px solid rgba(255,255,255,.08); border-radius:20px; font-size:11px; font-weight:600; cursor:pointer; font-family:'Inter',sans-serif; transition:all .18s; white-space:nowrap; user-select:none; }
      .dp-chip:hover { background:rgba(255,255,255,.08); color:var(--text-secondary); }
      .dp-chip--on { background:rgba(212,175,55,.14); color:#D4AF37; border-color:rgba(212,175,55,.32); box-shadow:0 0 10px rgba(212,175,55,.12); }
      .dp-chip--flag { background:rgba(239,68,68,.12); color:#f87171; border-color:rgba(239,68,68,.25); }
      .dp-view-toggle { display:flex; align-items:center; border:1px solid rgba(255,255,255,.1); border-radius:8px; overflow:hidden; flex-shrink:0; }
      .dp-view-toggle-btn { padding:5px 10px; background:none; border:none; color:var(--text-muted); cursor:pointer; transition:all .15s; display:flex; align-items:center; }
      .dp-view-toggle-btn:hover { color:var(--text-secondary); background:rgba(255,255,255,.05); }
      .dp-view-toggle-btn--on { background:rgba(212,175,55,.14); color:#D4AF37; }

      /* ─── Flag Badge ─────────────────────────────────────────────────── */
      /* Flag badge sits BELOW the status nav bar (was overlapping the
         "Active/Disabled" text and Deactivate button before). */
      .dp-flag-badge { position:absolute; top:38px; right:6px; z-index:3; display:inline-flex; align-items:center; gap:4px; padding:3px 8px; background:rgba(239,68,68,.18); border:1px solid rgba(239,68,68,.4); border-radius:8px; font-size:9px; font-weight:700; color:#f87171; cursor:pointer; transition:all .2s; animation:dpFlagPulse 2.5s ease-in-out infinite; box-shadow:0 2px 8px rgba(0,0,0,.35); }
      .dp-flag-badge:hover { background:rgba(239,68,68,.3); border-color:rgba(239,68,68,.6); transform:scale(1.05); }
      @keyframes dpFlagPulse { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)} 50%{box-shadow:0 0 0 5px rgba(239,68,68,0)} }

      /* ─── Sparkline ──────────────────────────────────────────────────── */
      .dp-sparkline-wrap { flex:1; display:flex; align-items:center; padding:4px 6px; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.05); border-radius:8px; min-width:0; }
      .dp-sparkline-wrap svg { width:100%; height:28px; }

      /* ─── List View ──────────────────────────────────────────────────── */
      .dp-list-view { display:flex; flex-direction:column; gap:6px; margin-top:6px; }
      .dp-list-row { display:flex; align-items:center; gap:12px; padding:10px 14px; background:linear-gradient(160deg,rgba(18,18,30,.98),rgba(11,11,20,.99)); border:1px solid rgba(255,255,255,.08); border-radius:12px; cursor:pointer; transition:all .2s; }
      .dp-list-row:hover { border-color:rgba(212,175,55,.3); background:rgba(212,175,55,.03); transform:translateX(2px); }
      .dp-list-row--flagged { border-color:rgba(239,68,68,.3); }
      .dp-list-row--disabled { opacity:.65; }
      .dp-list-logo { width:32px; height:32px; border-radius:8px; overflow:hidden; flex-shrink:0; border:1px solid rgba(255,255,255,.1); }
      .dp-list-name { font-size:13px; font-weight:700; color:#f1f5f9; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .dp-list-domain { font-size:11px; font-family:var(--font-mono); color:#34d399; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .dp-list-stat { font-size:12px; font-weight:700; min-width:50px; text-align:center; }
      .dp-list-stat--live { color:#10b981; }
      .dp-list-stat--total { color:var(--text-secondary); }
      .dp-list-stat--views { color:#818cf8; }
      .dp-list-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
      .dp-list-dot--on { background:#10b981; animation:statusPulse 2.2s ease-in-out infinite; }
      .dp-list-dot--off { background:var(--text-placeholder); }
      .dp-list-spark { width:80px; height:24px; flex-shrink:0; }

      /* ─── Pin ────────────────────────────────────────────────────────── */
      /* Pin (star) button sits BELOW the status nav bar so it doesn't cover
         the "Active" dot or the Deactivate button on hover. Fades in when the
         card is hovered, always visible when pinned. */
      .dp-pin-btn { position:absolute; top:38px; left:6px; z-index:3; width:22px; height:22px; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.55); border:1px solid rgba(255,255,255,.12); border-radius:6px; cursor:pointer; color:var(--text-muted); transition:all .2s; opacity:0; box-shadow:0 2px 8px rgba(0,0,0,.35); }
      .dp-site-card:hover .dp-pin-btn { opacity:1; }
      .dp-pin-btn--pinned { opacity:1 !important; background:rgba(212,175,55,.2); border-color:rgba(212,175,55,.4); color:#D4AF37; }
      .dp-pin-btn:hover { background:rgba(212,175,55,.15); color:#D4AF37; border-color:rgba(212,175,55,.3); }
      [data-theme='light'] .dp-pin-btn { background:#FFFFFF; border-color:#CBD5E1; color:#64748B; }
      [data-theme='light'] .dp-pin-btn:hover { background:#FFFBEB; color:#B45309; border-color:#FDE68A; }
      [data-theme='light'] .dp-pin-btn--pinned { background:#FFFBEB !important; border-color:#FDE68A !important; color:#B45309 !important; }
      [data-theme='light'] .dp-flag-badge { background:#FFF1F2; border-color:#FECDD3; color:#BE123C; box-shadow:0 2px 8px rgba(0,0,0,.08); }
      [data-theme='light'] .dp-flag-badge:hover { background:#FFE4E6; border-color:#FDA4AF; }
      .dp-pin-divider { grid-column:1/-1; display:flex; align-items:center; gap:8px; padding:4px 0; }
      .dp-pin-divider-line { flex:1; height:1px; background:rgba(212,175,55,.15); }
      .dp-pin-divider-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:rgba(212,175,55,.5); white-space:nowrap; }

      /* ─── Live Pulse ─────────────────────────────────────────────────── */
      @keyframes dpLivePulse { 0%{border-color:rgba(16,185,129,.8);box-shadow:0 0 20px rgba(16,185,129,.4)} 100%{border-color:rgba(var(--sc-r,99),var(--sc-g,102),var(--sc-b,241),.62);box-shadow:0 4px 24px rgba(0,0,0,.35)} }
      .dp-site-card--pulse { animation:dpLivePulse .8s ease-out !important; }
      .dp-live-bump { animation:dpCountBump .5s ease; }
      @keyframes dpCountBump { 0%{transform:scale(1)} 40%{transform:scale(1.35);color:#10b981} 100%{transform:scale(1)} }

      /* Settings tab panel styles are injected inline in initSettingsPanel() */
    `;
    document.head.appendChild(s);
  }

  return { injectStyles };
})();
