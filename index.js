// index.js  – full drop‑in
import express from 'express';
// If you’re on Node 18+ you can delete the next line
// import fetch from 'node-fetch';
import 'dotenv/config';

const app   = express();
const cache = new Map();                // login -> { live, expires }
let token   = { val: '', expires: 0 };

/* ---------- token ---------- */
async function getAppToken() {
  if (Date.now() < token.expires) return token.val;

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token` +
    `?client_id=${process.env.TWITCH_CLIENT_ID}` +
    `&client_secret=${process.env.TWITCH_CLIENT_SECRET}` +
    `&grant_type=client_credentials`,
    { method: 'POST' }
  ).then(r => r.json());

  token = { val: res.access_token, expires: Date.now() + (res.expires_in - 300) * 1000 };
  return token.val;
}

/* ---------- live check ---------- */
async function fetchLive(login) {
  const bearer = await getAppToken();

  const res = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${login}`,
    {
      headers: {
        'Client-ID':    process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${bearer}`
      }
    }
  ).then(r => r.json());

  cache.set(login, {
    live:    Array.isArray(res.data) && res.data.length > 0,
    expires: Date.now() + 15_000            // 15‑second TTL
  });

  return cache.get(login).live;
}

/* ---------- route: /status/:channel ---------- */
app.get('/status/:channel', async (req, res) => {
  const login = req.params.channel.toLowerCase();

  try {
    const record = cache.get(login);
    const live   = record && Date.now() < record.expires
      ? record.live
      : await fetchLive(login);

    res.type('text').send(live ? 'LIVE' : 'OFFLINE');
  } catch (err) {
    console.error('status error', err);
    res.type('text').send('OFFLINE');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`⇢ Twitch status API on :${PORT}`));
