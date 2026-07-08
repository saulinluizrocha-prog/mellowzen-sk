const https = require('https');
const crypto = require('crypto');

const CONFIG = {
  api_key: 'c66289394c2a6e8515c8e8b382fba719',
  offer_id: '15011',
  user_id: '75329',
  api_domain: 'https://t-api.org',
};

function checkSum(jsonData) {
  return crypto.createHash('sha1').update(jsonData + CONFIG.api_key).digest('hex');
}

function callTerraApi(data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ user_id: CONFIG.user_id, data });
    const checksum = checkSum(payload);

    const url = new URL(`${CONFIG.api_domain}/api/lead/create?check_sum=${checksum}`);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.status === 'ok') {
            resolve(parsed.data);
          } else {
            reject(new Error(parsed.error || 'API error'));
          }
        } catch (e) {
          reject(new Error('JSON parse error: ' + body));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(payload);
    req.end();
  });
}

function parseFormBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const params = new URLSearchParams(body);
        const result = {};
        for (const [key, value] of params.entries()) {
          result[key] = value;
        }
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function getIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  const clientIp = req.headers['x-forwarded-for'];
  if (cfIp) return cfIp;
  if (clientIp) return clientIp.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  let post;
  try {
    post = await parseFormBody(req);
  } catch (e) {
    res.status(400).send('Bad Request');
    return;
  }

  if (!post.name || !post.phone) {
    const referer = req.headers['referer'] || '/';
    res.writeHead(302, { Location: referer });
    res.end();
    return;
  }

  const query = new URL(req.url, `https://${req.headers.host}`).searchParams;

  const data = {
    name: post.name.trim(),
    phone: post.phone.trim(),
    offer_id: CONFIG.offer_id,
    country: post.country || 'SK',
    region: post.region || null,
    city: post.city || null,
    count: post.count || null,
    address: post.address || null,
    email: post.email || null,
    zip: post.zip || null,
    user_comment: post.user_comment || null,
    referer: query.get('referer') || req.headers['referer'] || null,
    user_agent: req.headers['user-agent'] || 'Unknown',
    ip: getIp(req),
    utm_source: query.get('utm_source') || null,
    utm_medium: query.get('utm_medium') || null,
    utm_campaign: query.get('utm_campaign') || null,
    utm_term: query.get('utm_term') || null,
    utm_content: query.get('utm_content') || null,
    sub_id: query.get('sub_id') || null,
    sub_id_1: query.get('sub_id_1') || null,
    sub_id_2: query.get('sub_id_2') || null,
    sub_id_3: query.get('sub_id_3') || null,
    sub_id_4: query.get('sub_id_4') || null,
  };

  try {
    const lead = await callTerraApi(data);
    const successUrl = `/success.html?id=${lead.id || ''}`;
    res.writeHead(302, { Location: successUrl });
    res.end();
  } catch (e) {
    res.status(500).send('Erro ao processar pedido: ' + e.message);
  }
};
