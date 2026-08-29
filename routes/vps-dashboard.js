/**
 * VPS Dashboard — live metrics + control actions.
 *
 *   GET  /api/vps-dashboard/metrics
 *          → parallel SSH probe of every configured VPS. Returns uptime,
 *            load, cpu/mem/disk, nginx status, and per-site antibot info.
 *            Cached briefly to keep polling cheap.
 *
 *   POST /api/vps-dashboard/action
 *          body: { target: 'site'|'vps'|'panel', slug?, host?, website_id?, action, params? }
 *          → dispatches a control action. Small text results (log tails,
 *            command output, ok/fail) return JSON here.
 *          → long-running actions (deploy, content sync) create an SSE
 *            session and return { session_id } to stream via
 *            /api/deploy/stream.
 *
 * super_admin / god only. Read cred material never sent to client.
 */
'use strict';

const path            = require('path');
const fs              = require('fs');
const dns             = require('dns').promises;
const { EventEmitter } = require('events');
const router          = require('express').Router();
const { getAdapter }  = require('../database/adapter');
const { authenticateToken, requireRole, requirePage, requireAction } = require('../middleware/auth');
const { sshConnect, sshExec } = require('../services/deploy/ssh');
const { sftpUploadDir }       = require('../services/deploy/sftp');
const { writeAudit }          = require('../services/audit');
const CF                      = require('../services/providers/cloudflare');
const { attachDomainToVps, sidecarPortFor } = require('../services/vpsDomain');
const { deployAntibot, buildProxyLocations } = require('../services/antibot-vps/deploy');

// Share the SSE session map with routes/deploy.js so long-running actions
// (sync / deploy) can stream through the existing /api/deploy/stream endpoint.
const deployRoute = require('./deploy');
const sessions    = deployRoute._sessions || (deployRoute._sessions = new Map());

router.use(authenticateToken);
router.use(requireRole('super_admin', 'god'));
// God's Pages toggle for "vps" now actually gates the API — unticking it in
// User Management blocks every /api/vps-dashboard/* call immediately.
router.use(requirePage('vps'));

const XPAGES_DIR = path.join(__dirname, '..', 'xPages');

// ─── Shared helpers ─────────────────────────────────────────────────────────

function createSession(type) {
  const id      = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const emitter = new EventEmitter();
  const session = { id, type, status: 'running', startedAt: Date.now(), emitter, logs: [] };
  sessions.set(id, session);
  setTimeout(() => sessions.delete(id), 10 * 60 * 1000);
  return session;
}
function sessionEmit(s, evt) { s.logs.push(evt); s.emitter.emit('e', evt); }

// Load hosts scoped to the effective caller. Reads from the `vpses` registry
// so VPSes persist across website transfers — unlike the old vps_host-on-
// websites aggregation, which lost the VPS the moment the last website using
// it was reassigned. Panel VPS still comes from settings (infra, not user
// asset). Non-god sees only their own registered VPSes; unrestricted god sees
// every registered VPS + the panel VPS.
async function loadHostsMap(effectiveUserId = null) {
  const db = getAdapter();
  const scoped = effectiveUserId != null;

  const vpsRows = scoped
    ? await db.all(
        `SELECT id, owner_id, host, ssh_port, ssh_user, ssh_pass, ssh_key, label
         FROM vpses WHERE owner_id = ?`,
        [effectiveUserId]
      )
    : await db.all(
        `SELECT id, owner_id, host, ssh_port, ssh_user, ssh_pass, ssh_key, label
         FROM vpses`
      );

  // Gather sites in a single query (avoids N+1) — keyed by vps_id.
  // Also fetch vps_ssh_pass/key so we can backfill a vpses row that's missing auth.
  const vpsIds = vpsRows.map(r => r.id);
  let siteRows = [];
  if (vpsIds.length) {
    const placeholders = vpsIds.map(() => '?').join(',');
    siteRows = await db.all(
      `SELECT id, name, demo_slug, owner_id, vps_id, vps_ssh_pass, vps_ssh_key
       FROM websites
       WHERE vps_id IN (${placeholders})`,
      vpsIds
    );
  }
  const sitesByVpsId = new Map();
  const authByVpsId = new Map();
  for (const s of siteRows) {
    if (!sitesByVpsId.has(s.vps_id)) sitesByVpsId.set(s.vps_id, []);
    sitesByVpsId.get(s.vps_id).push({ id: s.id, name: s.name, slug: s.demo_slug });
    if (!authByVpsId.has(s.vps_id) && (s.vps_ssh_pass || s.vps_ssh_key)) {
      authByVpsId.set(s.vps_id, { pass: s.vps_ssh_pass, key: s.vps_ssh_key });
    }
  }

  const panelRows = await db.all(
    `SELECT key, value FROM settings
     WHERE key IN ('panel_vps_host','panel_vps_ssh_port','panel_vps_ssh_user','deploy_ssh_pass','deploy_ssh_key','panel_domain','deploy_app_dir','deploy_pm2_name','deploy_git_branch')`
  );
  const pc = Object.fromEntries(panelRows.map(r => [r.key, r.value]));

  const hosts = new Map();
  for (const v of vpsRows) {
    let pass = v.ssh_pass, key = v.ssh_key;
    if (!pass && !key) {
      const wb = authByVpsId.get(v.id);
      if (wb) { pass = wb.pass; key = wb.key; }
    }
    hosts.set(v.host, {
      host: v.host, isPanel: false,
      vpsId: v.id, ownerId: v.owner_id,
      port: v.ssh_port || 22,
      user: v.ssh_user || 'root',
      pass, key,
      label: v.label || null,
      sites: sitesByVpsId.get(v.id) || [],
    });
  }

  // Panel VPS — unrestricted-god only. It's infrastructure config, not a
  // client asset, and lives in settings rather than the vpses registry.
  if (!scoped && pc.panel_vps_host) {
    const host = pc.panel_vps_host;
    if (!hosts.has(host)) {
      hosts.set(host, {
        host, isPanel: true, vpsId: null, ownerId: null,
        port: pc.panel_vps_ssh_port || 22,
        user: pc.panel_vps_ssh_user || 'root',
        pass: pc.deploy_ssh_pass, key: pc.deploy_ssh_key,
        sites: [],
      });
    } else {
      hosts.get(host).isPanel = true;
    }
    hosts.get(host).panel = {
      domain:    pc.panel_domain || '',
      appDir:    pc.deploy_app_dir || '/var/www/alp',
      pm2Name:   pc.deploy_pm2_name || 'alp',
      gitBranch: pc.deploy_git_branch || 'main',
    };
  }
  return { hosts, pc };
}

async function connectHost(host) {
  return sshConnect({
    host: host.host, port: host.port, username: host.user,
    password: host.pass || undefined,
    privateKey: host.key || undefined,
  });
}

async function loadWebsite(id) {
  const db = getAdapter();
  return db.get(`SELECT * FROM websites WHERE id = ?`, [id]);
}

// ─── Metrics probe ──────────────────────────────────────────────────────────
// Runs on every host in parallel. Each host probe is bounded so one dead
// server doesn't stall the whole dashboard.

const PROBE_TIMEOUT_MS = 12000;   // generous — SSH handshake can take 3-6s under load
const METRICS_TTL_MS   = 15_000;
const DOWN_STREAK_TO_TRUST = 2;   // require N consecutive failures before flagging as down
// Per-effective-user cache. Key is the effective user id (or the string
// '__all__' when god is unrestricted). Prevents one user's cached results from
// being served to another.
const metricsCache = new Map(); // uidKey → { data, at }

// Per-host state carried across polls: last successful probe + streak of failures.
// Prevents one flaky SSH handshake from flipping the card to red for 30s.
const _hostState = new Map(); // host → { lastGood: probeResult|null, failStreak: 0, lastError: string|null }

async function probeHost(host) {
  const label = host.host;
  const started = Date.now();
  const result = {
    host: host.host,
    is_panel: !!host.isPanel,
    reachable: false, ssh_ok: false,
    uptime: null, load: null,
    cpu_percent: null, mem_percent: null,
    disk_percent: null, disk_available: null,
    nginx_active: null, nginx_conn: null,
    provider: null,
    sites: [],
    error: null,
    probed_ms: 0,
  };

  let conn = null;
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), PROBE_TIMEOUT_MS));

  try {
    conn = await Promise.race([connectHost(host), timeout]);
    result.reachable = true;
    result.ssh_ok = true;

    // Single shell round-trip: run all metric commands separated by markers.
    const script = [
      'echo "@@UPTIME"; uptime',
      'echo "@@LOAD";   cat /proc/loadavg 2>/dev/null | awk \'{print $1" "$2" "$3}\'',
      'echo "@@CPU";    top -bn1 -n 1 2>/dev/null | grep -E "^%?Cpu" | head -1',
      'echo "@@MEM";    free -m | grep -E "^Mem:" | awk \'{print $2" "$3}\'',
      'echo "@@DISK";   df -h / | tail -1 | awk \'{print $5" "$4}\'',
      'echo "@@NGINX";  systemctl is-active nginx 2>/dev/null || echo unknown',
      'echo "@@NGXCON"; ss -tn state established 2>/dev/null | wc -l',
      'echo "@@ANTIBOT"; systemctl list-units --type=service --state=running 2>/dev/null | grep alp-antibot- | awk \'{print $1}\' || true',
      // Provider fingerprint from DMI. sys_vendor is what most cloud hosts
      // write ("DigitalOcean", "Vultr", "Amazon EC2", etc). Fall back to
      // bios_vendor and product_name if sys_vendor is generic ("QEMU", "KVM").
      'echo "@@VENDOR";  cat /sys/class/dmi/id/sys_vendor 2>/dev/null | tr -d "\\n"; echo; cat /sys/class/dmi/id/bios_vendor 2>/dev/null | tr -d "\\n"; echo; cat /sys/class/dmi/id/product_name 2>/dev/null | tr -d "\\n"; echo',
      'echo "@@END"',
    ].join('; ');

    const out = await Promise.race([sshExec(conn, script), timeout]);
    const stdout = String(out.stdout || out);
    const sections = parseMarkers(stdout);

    // Uptime
    if (sections.UPTIME) {
      const m = sections.UPTIME.match(/up\s+(.+?),\s+\d+ user/);
      if (m) result.uptime = m[1].trim();
    }
    // Load
    if (sections.LOAD) {
      const parts = sections.LOAD.trim().split(/\s+/).slice(0, 3).map(Number);
      if (parts.length === 3) result.load = parts;
    }
    // CPU — parse "%Cpu(s):  4.7 us,  2.1 sy, ... 92.5 id,..."
    if (sections.CPU) {
      const idleM = sections.CPU.match(/([\d.]+)\s*id/);
      if (idleM) result.cpu_percent = Math.max(0, Math.min(100, +(100 - parseFloat(idleM[1])).toFixed(1)));
    }
    // Mem
    if (sections.MEM) {
      const [total, used] = sections.MEM.trim().split(/\s+/).map(Number);
      if (total && used != null) result.mem_percent = +(used * 100 / total).toFixed(1);
    }
    // Disk
    if (sections.DISK) {
      const [pct, avail] = sections.DISK.trim().split(/\s+/);
      const n = parseInt((pct || '').replace('%', ''), 10);
      if (!isNaN(n)) result.disk_percent = n;
      if (avail) result.disk_available = avail;
    }
    // Nginx
    if (sections.NGINX) {
      const s = sections.NGINX.trim();
      result.nginx_active = s === 'active';
    }
    if (sections.NGXCON) {
      const n = parseInt(sections.NGXCON.trim(), 10);
      if (!isNaN(n)) result.nginx_conn = n;
    }
    // Antibot sidecars — list of active service names
    const activeSidecars = new Set();
    if (sections.ANTIBOT) {
      for (const line of sections.ANTIBOT.split(/\r?\n/)) {
        const m = line.match(/^alp-antibot-([\w-]+)\.service/);
        if (m) activeSidecars.add(m[1]);
      }
    }
    // Provider fingerprint from DMI. Three lines: sys_vendor, bios_vendor,
    // product_name. sys_vendor is usually authoritative for known clouds;
    // fall through to the others when it's a generic hypervisor tag.
    if (sections.VENDOR) {
      const [sysVendor = '', biosVendor = '', productName = ''] = sections.VENDOR.split(/\r?\n/).map(s => s.trim());
      const provider = detectProvider(sysVendor, biosVendor, productName);
      if (provider) {
        result.provider = provider;
        result.provider_raw = { sys_vendor: sysVendor, bios_vendor: biosVendor, product_name: productName };
      }
    }
    // PTR fallback — when DMI is missing or a generic hypervisor tag,
    // reverse-DNS the host and try to pull a provider out of the PTR. Runs
    // from the panel, not via SSH — cached per host for 6h.
    if (isGenericProvider(result.provider)) {
      try {
        const ptr = await inferProviderFromPtr(host.host);
        if (ptr && ptr.provider) {
          const raw = result.provider_raw || {};
          result.provider = ptr.provider;
          result.provider_raw = { ...raw, ptr: ptr.ptr, ptr_note: `resolved via PTR (DMI was ${raw.sys_vendor || 'empty'})` };
        } else if (ptr && ptr.ptr) {
          // No rule matched but we have a PTR — attach it for the tooltip.
          result.provider_raw = { ...(result.provider_raw || {}), ptr: ptr.ptr };
        }
      } catch { /* PTR errors are non-fatal — keep the DMI answer */ }
    }
    if (host.label) result.label = host.label;
    if (host.vpsId) result.vps_id = host.vpsId;
    if (host.ownerId) result.owner_id = host.ownerId;
    result.sites = host.sites.map(s => ({
      id: s.id, name: s.name, slug: s.slug,
      antibot_active: activeSidecars.has(s.slug),
    }));

    // Panel-specific: pm2 status
    if (host.isPanel && host.panel) {
      try {
        const pm = await Promise.race([sshExec(conn, `pm2 jlist 2>/dev/null | head -c 20000`), timeout]);
        const arr = JSON.parse(String(pm.stdout || pm).trim() || '[]');
        const proc = arr.find(p => p.name === host.panel.pm2Name);
        if (proc) {
          result.panel = {
            pm2_name: proc.name,
            pm2_status: proc.pm2_env?.status,
            pm2_uptime_ms: proc.pm2_env?.pm_uptime ? (Date.now() - proc.pm2_env.pm_uptime) : null,
            pm2_restarts: proc.pm2_env?.restart_time,
            pm2_mem_mb: proc.monit?.memory ? Math.round(proc.monit.memory / 1024 / 1024) : null,
            pm2_cpu: proc.monit?.cpu,
          };
        }
      } catch (_) { /* pm2 not installed or timed out */ }
    }
  } catch (e) {
    result.error = e.message;
  } finally {
    if (conn) { try { conn.end(); } catch (_) {} }
    result.probed_ms = Date.now() - started;
  }
  return result;
}

// Is this label a generic hypervisor tag (unhelpful — we should try harder
// with a PTR lookup if we can)?
const _GENERIC_PROVIDER_RE = /^(QEMU|KVM|Xen|Bochs|Hyper-V|VMware|VirtualBox|Parallels)$/i;
function isGenericProvider(label) {
  return !label || _GENERIC_PROVIDER_RE.test(String(label));
}

// PTR-based provider inference. Matches the resolved reverse-DNS hostname
// against known cloud PTR patterns. Runs from the panel (not via SSH), so
// zero remote round-trip cost — but still needs the panel itself to have
// working DNS.
const _PTR_RULES = [
  { re: /\.contaboserver\.net$|\.contabo\.host$|\.contabo\.net$/i,   label: 'Contabo' },
  { re: /\.hetzner\.(?:com|de|cloud)$|\.your-server\.de$/i,           label: 'Hetzner' },
  { re: /\.digitalocean\.com$/i,                                      label: 'DigitalOcean' },
  { re: /\.linodeusercontent\.com$|\.linode\.com$/i,                  label: 'Linode' },
  { re: /\.googleusercontent\.com$|\.googleapis\.com$|\.1e100\.net$/i,label: 'GCP' },
  { re: /\.compute(?:-\d+)?\.amazonaws\.com$|\.ec2\.internal$/i,      label: 'AWS' },
  { re: /\.cloudapp\.(?:net|azure\.com)$|\.azurewebsites\.net$/i,     label: 'Azure' },
  { re: /\.ovh\.(?:net|ca|com)$|\.kimsufi\.com$|\.soyoustart\.com$/i, label: 'OVH' },
  { re: /\.vultr\.com$|\.vultrusercontent\.com$/i,                    label: 'Vultr' },
  { re: /\.oraclecloud\.com$|\.oracle-cloud\.com$/i,                  label: 'Oracle Cloud' },
  { re: /\.aliyuncs\.com$|\.alibaba(?:cloud)?\.com$/i,                label: 'Alibaba Cloud' },
  { re: /\.scaleway\.com$|\.online\.net$|\.dedibox\.fr$/i,            label: 'Scaleway' },
  { re: /\.upcloud\.(?:com|host)$/i,                                  label: 'UpCloud' },
  { re: /\.leaseweb\.(?:com|net)$/i,                                  label: 'Leaseweb' },
  { re: /\.hostwinds\.com$/i,                                         label: 'Hostwinds' },
  { re: /\.namecheap(?:hosting)?\.com$/i,                             label: 'Namecheap' },
  { re: /\.ionos\.(?:com|net)$/i,                                     label: 'IONOS' },
  { re: /\.timeweb\.(?:cloud|ru)$/i,                                  label: 'Timeweb' },
  { re: /\.serverion\.com$/i,                                         label: 'Serverion' },
  { re: /\.rackspace\.com$|\.rackspacecloud\.com$/i,                  label: 'Rackspace' },
];

// Cache PTR results per host — reverse-DNS answers rarely change and we're
// polling every 30s. Small in-memory LRU-ish shape (bounded by usage; VPS
// counts are tiny). Entry shape: { ptr, provider, at }.
const _ptrCache = new Map();
const _PTR_TTL_MS = 6 * 60 * 60 * 1000;   // 6h — providers effectively never change
const _PTR_LOOKUP_TIMEOUT_MS = 2500;

async function inferProviderFromPtr(host) {
  if (!host || typeof host !== 'string') return null;
  // Skip anything that isn't an IP. Hostnames are already their own PTR.
  const isIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');
  if (!isIp) return null;

  const now = Date.now();
  const hit = _ptrCache.get(host);
  if (hit && (now - hit.at) < _PTR_TTL_MS) return hit;

  let names = [];
  try {
    const p = dns.reverse(host);
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('ptr timeout')), _PTR_LOOKUP_TIMEOUT_MS));
    names = await Promise.race([p, timeout]);
  } catch {
    _ptrCache.set(host, { ptr: null, provider: null, at: now });
    return null;
  }

  const ptr = (names && names[0]) ? String(names[0]).toLowerCase() : null;
  let provider = null;
  if (ptr) {
    for (const r of _PTR_RULES) if (r.re.test(ptr)) { provider = r.label; break; }
  }
  const entry = { ptr, provider, at: now };
  _ptrCache.set(host, entry);
  return entry;
}

// Map a raw DMI vendor string to a friendly provider label. Falls back to a
// short lower-cased tag when the raw string is a generic hypervisor
// ("QEMU"/"KVM"/"Bochs") — the operator can still see something rather than
// "Unknown" and dig deeper if they care. Returns null when we have nothing.
function detectProvider(sysVendor, biosVendor, productName) {
  const hay = [sysVendor, biosVendor, productName].filter(Boolean).join(' | ');
  if (!hay) return null;

  const rules = [
    { re: /digitalocean/i,                     label: 'DigitalOcean' },
    { re: /amazon|amzn|xen.*aws/i,             label: 'AWS' },
    { re: /google(?:\s+compute)?|gce/i,        label: 'GCP' },
    { re: /microsoft\s+corp|azure/i,           label: 'Azure' },
    { re: /vultr/i,                            label: 'Vultr' },
    { re: /linode|akamai/i,                    label: 'Linode' },
    { re: /hetzner/i,                          label: 'Hetzner' },
    { re: /ovh/i,                              label: 'OVH' },
    { re: /contabo/i,                          label: 'Contabo' },
    { re: /oracle/i,                           label: 'Oracle Cloud' },
    { re: /alibaba|aliyun/i,                   label: 'Alibaba Cloud' },
    { re: /scaleway/i,                         label: 'Scaleway' },
    { re: /upcloud/i,                          label: 'UpCloud' },
    { re: /leaseweb/i,                         label: 'Leaseweb' },
    { re: /vmware/i,                           label: 'VMware' },
    { re: /innotek|virtualbox/i,               label: 'VirtualBox' },
    { re: /parallels/i,                        label: 'Parallels' },
  ];
  for (const r of rules) if (r.re.test(hay)) return r.label;

  // Generic hypervisor tags — surface them but flag as generic so the UI can
  // render a muted badge.
  if (/qemu/i.test(hay))   return 'QEMU';
  if (/kvm/i.test(hay))    return 'KVM';
  if (/xen/i.test(hay))    return 'Xen';
  if (/bochs/i.test(hay))  return 'Bochs';
  if (/hyper-?v/i.test(hay)) return 'Hyper-V';

  // Last resort — first non-empty raw value, trimmed to something displayable.
  const raw = (sysVendor || biosVendor || productName || '').trim();
  if (!raw) return null;
  return raw.length > 24 ? raw.slice(0, 24) + '…' : raw;
}

function parseMarkers(stdout) {
  const out = {};
  const re = /@@(\w+)\r?\n([\s\S]*?)(?=@@\w+|$)/g;
  let m;
  while ((m = re.exec(stdout)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

/**
 * Reconcile a raw probe result with per-host state.
 * If this probe failed but we have a recent good one, keep showing the last
 * good metrics with a `stale: true` flag so the UI doesn't flip red for a
 * single-poll blip. Only after DOWN_STREAK_TO_TRUST consecutive failures do
 * we actually surface reachable=false.
 */
function reconcileProbe(host, raw) {
  const state = _hostState.get(host) || { lastGood: null, failStreak: 0, lastError: null };
  if (raw.reachable && raw.ssh_ok) {
    state.lastGood   = raw;
    state.failStreak = 0;
    state.lastError  = null;
    _hostState.set(host, state);
    return { ...raw, stale: false, fail_streak: 0 };
  }
  // This probe failed
  state.failStreak = (state.failStreak || 0) + 1;
  state.lastError  = raw.error || 'probe failed';
  _hostState.set(host, state);

  if (state.lastGood && state.failStreak < DOWN_STREAK_TO_TRUST) {
    // Serve last-good with a stale marker so UI doesn't flip red on one blip
    return { ...state.lastGood, stale: true, fail_streak: state.failStreak, last_error: state.lastError };
  }
  // Trust the failure — either no prior good state or we've failed enough times
  return { ...raw, stale: false, fail_streak: state.failStreak, last_error: state.lastError };
}

router.get('/metrics', async (req, res) => {
  const now = Date.now();
  const uid = req.effectiveUserId;
  const cacheKey = uid == null ? '__all__' : String(uid);
  const hit = metricsCache.get(cacheKey);
  if (hit && now - hit.at < METRICS_TTL_MS && !req.query.fresh) {
    return res.json({ ...hit.data, cached: true, age_ms: now - hit.at });
  }
  try {
    const { hosts } = await loadHostsMap(uid);
    const list = Array.from(hosts.values());
    const raws = await Promise.all(list.map(h => probeHost(h).catch(e => ({ host: h.host, error: e.message, reachable: false }))));
    const results = raws.map(r => reconcileProbe(r.host, r));
    const data = { vps: results };
    metricsCache.set(cacheKey, { data, at: now });
    res.json({ ...data, cached: false, age_ms: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Actions ────────────────────────────────────────────────────────────────

async function withHostConn(host, fn) {
  const conn = await connectHost(host);
  try { return await fn(conn); }
  finally { try { conn.end(); } catch (_) {} }
}

/**
 * Run an SSH command and return { code, stdout, stderr, truncated }.
 * Caps output at 32 KB so a runaway log doesn't pin the panel.
 */
async function runCmd(host, cmd) {
  return withHostConn(host, async (conn) => {
    const r = await sshExec(conn, cmd);
    let stdout = String(r.stdout || '');
    let stderr = String(r.stderr || '');
    const CAP = 32 * 1024;
    let truncated = false;
    if (stdout.length > CAP) { stdout = stdout.slice(-CAP); truncated = true; }
    if (stderr.length > CAP) { stderr = stderr.slice(-CAP); truncated = true; }
    return { code: r.code, stdout, stderr, truncated };
  });
}

async function hostForWebsite(websiteId, effectiveUserId = null) {
  const w = await loadWebsite(websiteId);
  if (!w) throw new Error('website not found');
  // Refuse to expose a host the caller does not own.
  if (effectiveUserId != null && Number(w.owner_id) !== Number(effectiveUserId)) {
    throw new Error('website not found');
  }
  // Prefer the vps_id → vpses join. Fall back to the legacy embedded creds
  // on the website row until the vps_host/vps_ssh_* columns are dropped, so
  // rows that predate the registry (or weren't wired by migration 010) still
  // work without a manual re-save.
  const db = getAdapter();
  let host, port, user, pass, key;
  if (w.vps_id) {
    const v = await db.get(
      `SELECT host, ssh_port, ssh_user, ssh_pass, ssh_key
       FROM vpses WHERE id = ?`,
      [w.vps_id]
    );
    if (v) {
      host = v.host;
      port = v.ssh_port || 22;
      user = v.ssh_user || 'root';
      pass = v.ssh_pass;
      key  = v.ssh_key;
    }
  }
  if (!host) {
    host = w.vps_host;
    port = w.vps_ssh_port || 22;
    user = w.vps_ssh_user || 'root';
    pass = w.vps_ssh_pass;
    key  = w.vps_ssh_key;
  }
  if (!host) throw new Error('website has no VPS configured');
  return { host, port, user, pass, key, website: w };
}

async function hostByIp(host, effectiveUserId = null) {
  const { hosts } = await loadHostsMap(effectiveUserId);
  const h = hosts.get(host);
  if (!h) throw new Error('unknown host: ' + host);
  return h;
}

// ─── Site actions ─────────────────────────────────────────────────────
async function actionSyncContent(host, session) {
  const slug = host.website.demo_slug;
  const localDir = path.join(XPAGES_DIR, slug);
  if (!fs.existsSync(localDir)) throw new Error(`xPages/${slug}/ not found locally`);
  const remote = `/var/www/${slug}`;
  sessionEmit(session, { type: 'log', message: `Syncing xPages/${slug}/ → ${host.host}:${remote}` });

  await withHostConn(host, async (conn) => {
    await sshExec(conn, `mkdir -p ${remote}`);
    await sftpUploadDir(conn, localDir, remote, (n, total, name) => {
      if (n % 5 === 0 || n === total) sessionEmit(session, { type: 'log', message: `  ${n}/${total}  ${name}` });
    });
    // Restart antibot so it re-serves fresh content
    await sshExec(conn, `systemctl restart alp-antibot-${slug} 2>/dev/null || true`);
  });
  sessionEmit(session, { type: 'log', message: `✓ sync complete` });
}

// ─── VPS action dispatcher ─────────────────────────────────────────────────

router.post('/action', requireAction('vps', 'control'), async (req, res) => {
  const { target, action, website_id, host: hostIp, params = {} } = req.body || {};
  if (!target || !action) return res.status(400).json({ error: 'target and action required' });

  try {
    // ── Long-running actions → SSE session ────────────────────────────────
    if (
      (target === 'site' && action === 'sync-content') ||
      (target === 'panel' && action === 'deploy')
    ) {
      const session = createSession(`${target}_${action}`);
      writeAudit(req, `VPS action: ${target}/${action}`, 'vps', { target, action, website_id, host: hostIp });
      res.json({ session_id: session.id });

      (async () => {
        try {
          if (target === 'site' && action === 'sync-content') {
            const h = await hostForWebsite(website_id, req.effectiveUserId);
            await actionSyncContent(h, session);
          } else if (target === 'panel' && action === 'deploy') {
            if (req.effectiveUserId != null) throw new Error('panel deploy is god-only');
            const { hosts, pc } = await loadHostsMap();
            const h = Array.from(hosts.values()).find(x => x.isPanel);
            if (!h) throw new Error('panel VPS not configured');
            const appDir  = pc.deploy_app_dir  || '/var/www/alp';
            const branch  = pc.deploy_git_branch || 'main';
            const pm2Name = pc.deploy_pm2_name || 'alp';
            sessionEmit(session, { type: 'log', message: `Deploying to ${h.host}:${appDir}` });
            await withHostConn(h, async (conn) => {
              const steps = [
                { cmd: `cd ${appDir} && git fetch origin ${branch}`,  label: 'git fetch' },
                { cmd: `cd ${appDir} && git reset --hard origin/${branch}`, label: 'git reset' },
                { cmd: `cd ${appDir} && npm ci --omit=dev 2>&1 | tail -20 || npm install --omit=dev 2>&1 | tail -20`, label: 'npm install' },
                { cmd: `pm2 restart ${pm2Name}`, label: 'pm2 restart' },
                { cmd: `pm2 list | head -5`,     label: 'pm2 list' },
              ];
              for (const step of steps) {
                sessionEmit(session, { type: 'log', message: `\n$ ${step.label}` });
                const r = await sshExec(conn, step.cmd);
                if (r.stdout) sessionEmit(session, { type: 'log', message: String(r.stdout).trim() });
                if (r.stderr) sessionEmit(session, { type: 'log', message: '! ' + String(r.stderr).trim() });
                if (r.code !== 0) throw new Error(`${step.label} exited ${r.code}`);
              }
            });
          }
          session.status = 'done';
          sessionEmit(session, { type: 'done', message: 'Action complete.' });
        } catch (e) {
          session.status = 'error';
          sessionEmit(session, { type: 'error', message: e.message });
        }
      })();
      return;
    }

    // ── Synchronous actions → JSON response ────────────────────────────────
    let result;

    if (target === 'site') {
      const h = await hostForWebsite(website_id, req.effectiveUserId);
      const slug = h.website.demo_slug;
      switch (action) {
        case 'restart-antibot':
          result = await runCmd(h, `systemctl restart alp-antibot-${slug} && systemctl is-active alp-antibot-${slug}`);
          break;
        case 'tail-antibot':
          result = await runCmd(h, `tail -n ${Math.max(10, Math.min(500, Number(params.lines) || 100))} /var/log/alp-antibot-${slug}.log 2>&1 || journalctl -u alp-antibot-${slug} --no-pager -n 100 2>&1`);
          break;
        case 'tail-access':
          result = await runCmd(h, `tail -n ${Math.max(10, Math.min(500, Number(params.lines) || 100))} /var/log/nginx/access.log 2>&1`);
          break;
        case 'antibot-status':
          result = await runCmd(h, `systemctl status alp-antibot-${slug} --no-pager 2>&1 | head -20`);
          break;
        default:
          return res.status(400).json({ error: `unknown site action: ${action}` });
      }
    } else if (target === 'vps') {
      const h = await hostByIp(hostIp, req.effectiveUserId);
      switch (action) {
        case 'test-ssh':
          try {
            const r = await runCmd(h, 'echo ok && uname -srm');
            result = { ok: r.code === 0, output: r.stdout.trim(), stderr: r.stderr };
          } catch (e) { result = { ok: false, error: e.message }; }
          break;
        case 'restart-nginx':
          result = await runCmd(h, 'systemctl restart nginx && systemctl is-active nginx');
          break;
        case 'nginx-status':
          result = await runCmd(h, 'systemctl status nginx --no-pager | head -15');
          break;
        case 'nginx-reload':
          result = await runCmd(h, 'nginx -t 2>&1 && systemctl reload nginx && echo reloaded');
          break;
        case 'disk-usage':
          result = await runCmd(h, 'df -h && echo --- && du -sh /var/www/* 2>/dev/null | sort -rh | head -20');
          break;
        case 'firewall':
          result = await runCmd(h, '(ufw status 2>/dev/null || iptables -L INPUT -n | head -30) 2>&1');
          break;
        default:
          return res.status(400).json({ error: `unknown vps action: ${action}` });
      }
    } else if (target === 'panel') {
      if (req.effectiveUserId != null) return res.status(403).json({ error: 'panel actions are god-only' });
      const { hosts, pc } = await loadHostsMap();
      const h = Array.from(hosts.values()).find(x => x.isPanel);
      if (!h) return res.status(400).json({ error: 'panel VPS not configured' });
      const pm2Name = pc.deploy_pm2_name || 'alp';
      switch (action) {
        case 'restart-panel':
          result = await runCmd(h, `pm2 restart ${pm2Name} && pm2 list | head -5`);
          break;
        case 'tail-pm2':
          result = await runCmd(h, `pm2 logs ${pm2Name} --nostream --lines ${Math.max(10, Math.min(500, Number(params.lines) || 100))} 2>&1 | tail -200`);
          break;
        case 'pm2-status':
          result = await runCmd(h, `pm2 list && echo --- && pm2 show ${pm2Name} 2>&1 | head -30`);
          break;
        default:
          return res.status(400).json({ error: `unknown panel action: ${action}` });
      }
    } else {
      return res.status(400).json({ error: `unknown target: ${target}` });
    }

    writeAudit(req, `VPS action: ${target}/${action}`, 'vps', { target, action, website_id, host: hostIp });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /add ─────────────────────────────────────────────────────────────
// Creates a standalone VPS in the vpses registry and provisions it
// (nginx, certbot, firewall, /var/www). Streams setup progress via SSE.
router.post('/add', requireAction('vps', 'control'), async (req, res) => {
  const { host, ssh_port, ssh_user, ssh_pass, ssh_key, auth_mode, label } = req.body || {};
  if (!host || typeof host !== 'string') return res.status(400).json({ error: 'host is required' });
  if (auth_mode === 'key' && !ssh_key)   return res.status(400).json({ error: 'SSH key is required' });
  if (auth_mode !== 'key' && !ssh_pass)  return res.status(400).json({ error: 'SSH password is required' });

  const db = getAdapter();
  const ownerId = req.effectiveUserId != null ? req.effectiveUserId : req.user.id;

  const existing = await db.get(`SELECT id FROM vpses WHERE host = ? AND owner_id = ?`, [host, ownerId]);
  if (existing) return res.status(409).json({ error: 'You already have a VPS registered with this host' });

  await db.run(
    `INSERT INTO vpses (owner_id, host, ssh_port, ssh_user, ssh_pass, ssh_key, label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ownerId, host, ssh_port || 22, ssh_user || 'root', auth_mode === 'key' ? null : ssh_pass, auth_mode === 'key' ? ssh_key : null, label || null]
  );
  await writeAudit(req, `Added standalone VPS ${host}`, 'vps', { host, label });
  metricsCache.clear();

  const session = createSession('vps-provision');
  const emit = (msg) => sessionEmit(session, { type: 'log', message: msg });

  res.json({ ok: true, host, session_id: session.id });

  // Provision in background
  (async () => {
    let client;
    try {
      emit(`Connecting to ${host}:${ssh_port || 22}…`);
      client = await sshConnect({
        host,
        port: Number(ssh_port) || 22,
        username: ssh_user || 'root',
        password: auth_mode === 'key' ? undefined : ssh_pass,
        privateKey: auth_mode === 'key' ? ssh_key : undefined,
      });
      emit('Connected');

      const run = async (label, cmd) => {
        emit(`\n── ${label}`);
        const r = await sshExec(client, cmd);
        if (r.stdout && r.stdout.trim()) emit(r.stdout.trim());
        if (r.stderr && r.stderr.trim()) emit('! ' + r.stderr.trim());
      };

      await run('Updating package lists', 'apt-get update -qq');
      await run('Installing nginx', 'DEBIAN_FRONTEND=noninteractive apt-get install -yqq nginx');
      await run('Installing certbot', 'DEBIAN_FRONTEND=noninteractive apt-get install -yqq certbot python3-certbot-nginx');
      await run('Installing ufw firewall', 'DEBIAN_FRONTEND=noninteractive apt-get install -yqq ufw');
      await run('Configuring firewall', [
        'ufw default deny incoming',
        'ufw default allow outgoing',
        'ufw allow ssh',
        'ufw allow 80/tcp',
        'ufw allow 443/tcp',
        'echo y | ufw enable',
      ].join(' && '));
      await run('Creating web root', 'mkdir -p /var/www && chown www-data:www-data /var/www');
      await run('Enabling & starting nginx', 'systemctl enable nginx && systemctl start nginx');
      await run('Verifying nginx', 'nginx -t && systemctl status nginx --no-pager -l | head -5');

      sessionEmit(session, { type: 'done', message: `VPS ${host} provisioned and ready` });
    } catch (err) {
      emit(`\nProvisioning failed: ${err.message}`);
      sessionEmit(session, { type: 'error', message: err.message });
    } finally {
      if (client) try { client.end(); } catch (_) {}
    }
  })();
});

// ─── POST /move-site ───────────────────────────────────────────────────────
// Moves a website from its current VPS to a different one. Updates the
// website's vps_id FK. The target VPS must exist in the vpses registry.
router.post('/move-site', requireAction('vps', 'control'), async (req, res) => {
  const { website_id, target_vps_id } = req.body || {};
  if (!website_id || !target_vps_id) return res.status(400).json({ error: 'website_id and target_vps_id required' });

  const db = getAdapter();

  const website = await db.get(`SELECT id, name, demo_slug, owner_id, vps_id FROM websites WHERE id = ?`, [website_id]);
  if (!website) return res.status(404).json({ error: 'website not found' });
  if (req.effectiveUserId != null && Number(website.owner_id) !== Number(req.effectiveUserId)) {
    return res.status(403).json({ error: 'not your website' });
  }

  const targetVps = await db.get(`SELECT id, host, ssh_port, ssh_user, ssh_pass, ssh_key FROM vpses WHERE id = ?`, [target_vps_id]);
  if (!targetVps) return res.status(404).json({ error: 'target VPS not found' });

  if (Number(website.vps_id) === Number(target_vps_id)) {
    return res.json({ ok: true, message: 'already on that VPS', host: targetVps.host });
  }

  const slug = website.demo_slug || (website.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const session = createSession('move-site');
  const emit = (msg) => sessionEmit(session, { type: 'log', message: msg });

  res.json({ ok: true, session_id: session.id, host: targetVps.host });

  // Run full deployment in background
  (async () => {
    try {
      // 1. Update DB — point website to new VPS
      emit(`Updating database — ${website.name || slug} → ${targetVps.host}`);
      await db.run(
        `UPDATE websites SET vps_id = ?, vps_host = ?, vps_ssh_port = ?, vps_ssh_user = ?, vps_ssh_pass = ?, vps_ssh_key = ? WHERE id = ?`,
        [target_vps_id, targetVps.host, targetVps.ssh_port, targetVps.ssh_user, targetVps.ssh_pass, targetVps.ssh_key, website_id]
      );
      emit('✓ Database updated');

      // 2. Connect to target VPS
      emit(`Connecting to target VPS ${targetVps.host}`);
      const client = await sshConnect({
        host: targetVps.host,
        port: targetVps.ssh_port || 22,
        username: targetVps.ssh_user || 'root',
        password: targetVps.ssh_pass || undefined,
        privateKey: targetVps.ssh_key || undefined,
      });
      emit(`✓ Connected to ${targetVps.host}`);

      // 3. Sync website files
      emit(`Syncing site files (xPages/${slug}) to /var/www/${slug}`);
      const localDir  = path.join(XPAGES_DIR, slug);
      const remoteDir = `/var/www/${slug}`;
      if (fs.existsSync(localDir)) {
        await sshExec(client, `mkdir -p ${remoteDir}`);
        const uploaded = await sftpUploadDir(client, localDir, remoteDir);
        await sshExec(client, `chown -R www-data:www-data ${remoteDir} 2>/dev/null || true`);
        emit(`✓ Synced ${uploaded.files} file(s) to ${remoteDir}`);

        // Rewrite tracker script tags
        try {
          const panelDomainRow = await db.get(`SELECT value FROM settings WHERE key = 'panel_domain'`);
          const panelDomain = (panelDomainRow && panelDomainRow.value) || process.env.PANEL_DOMAIN || '';
          const wsRow = await db.get(`SELECT api_key FROM websites WHERE id = ?`, [website_id]);
          const apiKey = wsRow && wsRow.api_key;
          if (panelDomain && apiKey) {
            const trackerUrl = `https://${panelDomain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')}/tracker.js`;
            const escSrc = trackerUrl.replace(/[&|]/g, '\\$&');
            const escKey = String(apiKey).replace(/[&|]/g, '\\$&');
            const listed = await sshExec(client, `find ${remoteDir} -type f -name "*.html" 2>/dev/null`);
            const htmlFiles = listed.stdout.trim().split('\n').filter(Boolean);
            for (const f of htmlFiles) {
              await sshExec(client, `sed -i 's|src="[^"]*tracker\\.js"|src="${escSrc}"|g' "${f}"`);
              await sshExec(client, `sed -i 's|data-api-key="[^"]*"|data-api-key="${escKey}"|g' "${f}"`);
              await sshExec(client, `sed -i 's|%%API_KEY%%|${escKey}|g' "${f}"`);
            }
            emit(`✓ Rewrote tracker in ${htmlFiles.length} html file(s)`);
          }
        } catch (e) {
          emit(`⚠ Tracker rewrite failed (non-fatal): ${e.message}`);
        }
      } else {
        emit(`⚠ Local xPages/${slug} not found — skipping file sync`);
      }

      // 4. Deploy antibot sidecar
      emit('Deploying antibot cloaking sidecar');
      const sidecarPort = sidecarPortFor(slug);
      try {
        const panelDomRow = await db.get(`SELECT value FROM settings WHERE key = 'panel_domain'`);
        const pd = (panelDomRow && panelDomRow.value) || '';
        const panelUrl = pd ? `https://${pd.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim()}` : '';
        const info = await deployAntibot({
          ssh: client, slug, docroot: remoteDir,
          port: sidecarPort, panelUrl, onLog: (line) => emit(line),
        });
        emit(`✓ Antibot sidecar healthy on :${info.port}`);
      } catch (e) {
        emit(`⚠ Antibot deploy failed (non-fatal): ${e.message}`);
      }

      // 5. Deploy domains — nginx + SSL + DNS for each domain on this website
      const domains = await db.all(
        `SELECT id, domain, cf_zone_id FROM domains WHERE website_id = ? AND hosting_provider = 'vps'`,
        [website_id]
      );
      const dnsResults = [];
      for (const d of domains) {
        if (!d.cf_zone_id) {
          emit(`⚠ ${d.domain} has no CF zone — skipping`);
          dnsResults.push({ domain: d.domain, ok: false, error: 'no cf_zone_id' });
          continue;
        }
        try {
          emit(`Deploying domain ${d.domain} on new VPS`);
          await attachDomainToVps({
            websiteId: website_id,
            domain: d.domain,
            cfZoneId: d.cf_zone_id,
            onStep: (label) => emit(`[${d.domain}] ${label}`),
            onLog: (line) => emit(`[${d.domain}] ${line}`),
          });
          dnsResults.push({ domain: d.domain, ok: true });
          emit(`✓ ${d.domain} fully deployed on ${targetVps.host}`);
        } catch (e) {
          dnsResults.push({ domain: d.domain, ok: false, error: e.message });
          emit(`✗ ${d.domain} deploy failed: ${e.message}`);
        }
      }

      try { client.end(); } catch {}

      const ok = dnsResults.filter(r => r.ok).length;
      const fail = dnsResults.filter(r => !r.ok).length;
      await writeAudit(req, `Moved website "${website.name || slug}" to VPS ${targetVps.host}`, 'vps', {
        website_id, from_vps_id: website.vps_id, to_vps_id: target_vps_id, to_host: targetVps.host, dns: dnsResults,
      });
      metricsCache.clear();
      session.status = 'done';
      sessionEmit(session, { type: 'done', message: `Move complete — ${ok} domain(s) deployed, ${fail} failed` });
    } catch (err) {
      session.status = 'error';
      sessionEmit(session, { type: 'error', message: `Move failed: ${err.message}` });
    }
  })();
});

// ─── POST /assign ──────────────────────────────────────────────────────────
// God-only: assign a registered VPS to a different user.
router.post('/assign', async (req, res) => {
  if (req.effectiveUserId != null) return res.status(403).json({ error: 'god-only' });
  const { vps_id, owner_id } = req.body || {};
  if (!vps_id) return res.status(400).json({ error: 'vps_id required' });

  const db = getAdapter();
  const vps = await db.get(`SELECT id, host, owner_id FROM vpses WHERE id = ?`, [vps_id]);
  if (!vps) return res.status(404).json({ error: 'VPS not found' });

  if (owner_id != null) {
    const user = await db.get(`SELECT id, username FROM users WHERE id = ?`, [owner_id]);
    if (!user) return res.status(404).json({ error: 'user not found' });
    await db.run(`UPDATE vpses SET owner_id = ? WHERE id = ?`, [owner_id, vps_id]);
    await writeAudit(req, `Assigned VPS ${vps.host} to user ${user.username}`, 'vps', { vps_id, host: vps.host, owner_id, username: user.username });
  } else {
    await db.run(`UPDATE vpses SET owner_id = NULL WHERE id = ?`, [vps_id]);
    await writeAudit(req, `Unassigned VPS ${vps.host} (owner cleared)`, 'vps', { vps_id, host: vps.host });
  }
  metricsCache.clear();
  res.json({ ok: true });
});

// ─── POST /remove ──────────────────────────────────────────────────────────
// Removes a VPS from the panel. For a registered VPS: deletes the vpses row
// — the ON DELETE SET NULL on websites.vps_id clears it from every attached
// website in the same transaction. Legacy vps_host/ssh_* columns on those
// websites are also nulled so the row is truly clean. For the panel VPS:
// deletes the panel_vps_* setting rows.
// The remote box itself is never touched — nginx, files, and antibot
// sidecars keep running until the operator tears them down manually.
router.post('/remove', requireAction('vps', 'control'), async (req, res) => {
  const { host, is_panel } = req.body || {};
  if (!host || typeof host !== 'string') return res.status(400).json({ error: 'host required' });

  const db = getAdapter();
  try {
    if (is_panel) {
      if (req.effectiveUserId != null) return res.status(403).json({ error: 'panel VPS is god-only' });
      const keys = ['panel_vps_host', 'panel_vps_ssh_port', 'panel_vps_ssh_user'];
      for (const k of keys) {
        await db.run(`DELETE FROM settings WHERE key = ?`, [k]);
      }
      await writeAudit(req, `Removed panel VPS ${host}`, 'vps', { host });
      metricsCache.clear();
      _hostState.delete(host);
      return res.json({ ok: true, target: 'panel', host });
    }

    // Registry-based path: find the (owner, host) vpses row the caller is
    // allowed to delete. Non-god must own it; unrestricted god can remove
    // any registered VPS.
    const vpsRow = req.effectiveUserId != null
      ? await db.get(`SELECT id, owner_id FROM vpses WHERE host = ? AND owner_id = ?`, [host, req.effectiveUserId])
      : await db.get(`SELECT id, owner_id FROM vpses WHERE host = ?`, [host]);

    // Legacy fallback: if the registry has no matching row, fall through to
    // the old vps_host-on-websites strip so pre-migration data can still be
    // cleaned up from the UI.
    let sitesUpdated = 0;
    if (vpsRow) {
      const attached = await db.all(
        `SELECT id, name FROM websites WHERE vps_id = ?`,
        [vpsRow.id]
      );
      // Wipe legacy embedded cols on every attached website so a rollback
      // of the vps_id column doesn't resurrect stale creds.
      if (attached.length) {
        const ids = attached.map(s => s.id);
        const placeholders = ids.map(() => '?').join(',');
        await db.run(
          `UPDATE websites
              SET vps_host = NULL, vps_ssh_pass = NULL, vps_ssh_key = NULL, vps_id = NULL
            WHERE id IN (${placeholders})`,
          ids
        );
        sitesUpdated = attached.length;
      }
      // Now safe to remove the registry row. ON DELETE SET NULL would clear
      // vps_id anyway, but we just handled it explicitly above.
      await db.run(`DELETE FROM vpses WHERE id = ?`, [vpsRow.id]);
      await writeAudit(req, `Removed VPS ${host}${sitesUpdated ? ` (detached from ${sitesUpdated} website${sitesUpdated !== 1 ? 's' : ''})` : ''}`, 'vps', { vps_id: vpsRow.id, host, sites: attached });
    } else {
      // Legacy path — no registry row, fall back to the old strip.
      const sites = req.effectiveUserId != null
        ? await db.all(`SELECT id, name FROM websites WHERE vps_host = ? AND owner_id = ?`, [host, req.effectiveUserId])
        : await db.all(`SELECT id, name FROM websites WHERE vps_host = ?`, [host]);
      if (!sites.length) return res.status(404).json({ error: 'no VPS with that host' });
      const ids = sites.map(s => s.id);
      const placeholders = ids.map(() => '?').join(',');
      await db.run(
        `UPDATE websites
            SET vps_host = NULL, vps_ssh_pass = NULL, vps_ssh_key = NULL, vps_id = NULL
          WHERE id IN (${placeholders})`,
        ids
      );
      sitesUpdated = sites.length;
      await writeAudit(req, `Removed VPS ${host} from ${sites.length} website${sites.length !== 1 ? 's' : ''} (legacy)`, 'vps', { host, sites });
    }

    metricsCache.clear();
    _hostState.delete(host);
    res.json({ ok: true, target: 'vps', host, sites_updated: sitesUpdated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /detach-site ─────────────────────────────────────────────────────
// Unassigns a single website from its VPS without touching the remote box.
router.post('/detach-site', requireAction('vps', 'control'), async (req, res) => {
  const { website_id } = req.body || {};
  if (!website_id) return res.status(400).json({ error: 'website_id required' });

  const db = getAdapter();
  const w = await db.get(`SELECT id, name, slug, vps_id, vps_host FROM websites WHERE id = ?`, [website_id]);
  if (!w) return res.status(404).json({ error: 'Website not found' });
  if (!w.vps_id && !w.vps_host) return res.status(400).json({ error: 'Website is not assigned to any VPS' });

  await db.run(
    `UPDATE websites SET vps_id = NULL, vps_host = NULL, vps_ssh_pass = NULL, vps_ssh_key = NULL WHERE id = ?`,
    [website_id]
  );
  await writeAudit(req, `Detached website ${w.name || w.slug} from VPS`, 'vps', {
    website_id, name: w.name, slug: w.slug, vps_id: w.vps_id, vps_host: w.vps_host,
  });
  metricsCache.clear();
  res.json({ ok: true });
});

module.exports = router;
