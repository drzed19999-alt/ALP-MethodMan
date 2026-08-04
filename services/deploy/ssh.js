/**
 * SSH execution helpers using the ssh2 library.
 * All functions work with a connected ssh2 Client instance.
 */

const { Client } = require('ssh2');

// Open an SSH connection and resolve with the connected Client
function sshConnect({ host, port = 22, username = 'root', privateKey, password }) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const auth   = { host, port: parseInt(port, 10), username,
                     readyTimeout: 15000, keepaliveInterval: 5000 };

    if (privateKey) {
      auth.privateKey = privateKey;
    } else if (password) {
      auth.password = password;
    } else {
      return reject(new Error('No SSH authentication method provided (need key or password)'));
    }

    client
      .on('ready', () => resolve(client))
      .on('error', reject)
      .connect(auth);
  });
}

// Run a command and collect all stdout/stderr — returns { code, stdout, stderr }
function sshExec(client, cmd) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    client.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data',          d => { stdout += d; });
      stream.stderr.on('data',   d => { stderr += d; });
      stream.on('close', code    => resolve({ code, stdout, stderr }));
    });
  });
}

// Run a command and stream output line-by-line via onLine(line, channel)
// channel is 'stdout' or 'stderr'
function sshExecStream(client, cmd, onLine) {
  return new Promise((resolve, reject) => {
    client.exec(cmd, (err, stream) => {
      if (err) return reject(err);

      let bufOut = '';
      let bufErr = '';

      const flush = (buf, channel) => {
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          if (line) onLine(line, channel);
          buf = buf.slice(nl + 1);
        }
        return buf;
      };

      stream.on('data', d => { bufOut = flush(bufOut + String(d), 'stdout'); });
      stream.stderr.on('data', d => { bufErr = flush(bufErr + String(d), 'stderr'); });
      stream.on('close', code => {
        if (bufOut.trim()) onLine(bufOut.trim(), 'stdout');
        if (bufErr.trim()) onLine(bufErr.trim(), 'stderr');
        resolve(code);
      });
    });
  });
}

module.exports = { sshConnect, sshExec, sshExecStream };
