/**
 * SFTP helpers — walk a local directory and upload it via an ssh2 client's
 * sftp channel. Extracted so both the full Host wizard (routes/website-deploy.js)
 * and the on-demand domain attach (services/vpsDomain.js) can use them.
 */

const fs   = require('fs');
const path = require('path');
const { sshExec } = require('./ssh');

function walkDir(rootDir) {
  const results = [];
  function walk(dir, base) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.posix.join(base, entry.name);
      if (entry.isDirectory()) { results.push({ abs, rel, isDir: true }); walk(abs, rel); }
      else if (entry.isFile()) { results.push({ abs, rel, isDir: false, size: fs.statSync(abs).size }); }
    }
  }
  walk(rootDir, '');
  return results;
}

async function sftpUploadDir(client, localDir, remoteDir, onProgress) {
  const entries = walkDir(localDir);
  const dirs  = entries.filter(e => e.isDir);
  const files = entries.filter(e => !e.isDir);

  // Create remote root + all subdirectories via SSH mkdir -p (reliable & recursive)
  const allDirs = [remoteDir, ...dirs.map(d => path.posix.join(remoteDir, d.rel))];
  await sshExec(client, `mkdir -p ${allDirs.join(' ')}`);

  // Upload files via SFTP channel
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) return reject(err);
      let uploaded = 0;
      function upload(i) {
        if (i >= files.length) return resolve({ files: files.length });
        const rp = path.posix.join(remoteDir, files[i].rel);
        sftp.fastPut(files[i].abs, rp, (e) => {
          if (e) return reject(new Error(`Upload ${files[i].rel} failed: ${e.message}`));
          uploaded++;
          if (onProgress) onProgress(uploaded, files.length, files[i].rel);
          upload(i + 1);
        });
      }
      upload(0);
    });
  });
}

module.exports = { walkDir, sftpUploadDir };
