/**
 * SFTP helpers — walk a local directory and upload it via an ssh2 client's
 * sftp channel. Extracted so both the full Host wizard (routes/website-deploy.js)
 * and the on-demand domain attach (services/vpsDomain.js) can use them.
 */

const fs   = require('fs');
const path = require('path');

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

function sftpUploadDir(client, localDir, remoteDir, onProgress) {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) return reject(err);
      const entries = walkDir(localDir);
      const dirs  = entries.filter(e => e.isDir);
      const files = entries.filter(e => !e.isDir);
      let uploaded = 0;

      const mkdirs = () => {
        function mkdir(i) {
          if (i >= dirs.length) return next();
          const rp = path.posix.join(remoteDir, dirs[i].rel);
          sftp.mkdir(rp, () => mkdir(i + 1)); // ignore "exists" errors
        }
        mkdir(0);
      };
      const next = () => {
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
      };

      sftp.mkdir(remoteDir, () => mkdirs());
    });
  });
}

module.exports = { walkDir, sftpUploadDir };
