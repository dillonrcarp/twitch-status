// index.js  — drop‑in replacement
import express from 'express';
import fetch from 'node-fetch';          // <-- keep if you’re on Node < 18.  On 18+ you can delete this line & the dep.
import 'dotenv/config';

const app   = express();
const cache = new Map();                 // key: channel login -> { live, expires }
let token   = { val: '', expires: 0 };

/* ------------------------------------------------------------------ */
/*  OAuth: get (or refresh) an app‑access token                       */
/* ------------------------------------------------------------------ */
async function getAppToken() {
  if (Date.now() < token.expires) return token.val;

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token` +
    `?client_id=${process.env.TWITCH_CLIENT_ID}` +
    `&client_secret=${process.env.TWITCH_CLIENT_SECRET}` +
    `&grant_type=client_credentials`,
    { method: 'POST' }
  ).then(r => r.json());

  // renew 5 min before expiry
  token = { val: res.access_token, expires: Date.now() + (res.expires_in - 300) * 1000 };
  return token.val;
}

/* ------------------------------------------------------------------ */
/*  Fetch live status for a single channel                             */
/* ------------------------------------------------------------------ */
async function fetchLive(channel) {
  const bearer = await getAppToken();
  const res = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${channel}`,
    {
      headers: {
        'Client-ID':    process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${bearer}`
      }
    }
  ).then(r => r.json());

  // Store result with 15 s TTL
  cache.set(channel, {
    live:    Array.isArray(res.data) && res.data.length > 0,
    expires: Date.now() + 15_000
  });
  return cache.get(channel).live;
}

/* ------------------------------------------------------------------ */
/*  GET /status/:channel  →  LIVE | OFFLINE                           */
/* ------------------------------------------------------------------ */
app.get('/status/:channel', async (req, res) => {
  const channel = req.params.channel.toLowerCase();

  try {
    const record = cache.get(channel);
    const live   = record && Date.now() < record.expires
      ? record.live
      : await fetchLive(channel);

    res.type('text').send(live ? 'LIVE' : 'OFFLINE');
  } catch (err) {
    console.error('Error fetching status:', err);
    res.type('text').send('OFFLINE');
  }
});

/* ------------------------------------------------------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`⇢ Twitch status API running on :${PORT}`));
