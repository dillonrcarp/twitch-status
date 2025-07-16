import express from 'express';
import 'dotenv/config';

const app = express();
let cached = { live: false, expires: 0 };
let token  = { val: '', expires: 0 };

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

async function poll() {
  if (Date.now() < cached.expires) return;

  const bearer = await getAppToken();
  const res = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${process.env.CHANNEL_LOGIN}`,
    { headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${bearer}` } }
  ).then(r => r.json());

  cached = { live: res.data?.length > 0, expires: Date.now() + 15_000 };
}

app.get('/status', async (_, res) => {
  try { await poll(); }
  catch { return res.type('text').send('OFFLINE'); }
  res.type('text').send(cached.live ? 'LIVE' : 'OFFLINE');
});

app.listen(3000, () => console.log('⇢ live‑status API ready'));
