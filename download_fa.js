// Download Font Awesome 6.0.0 locally
const https = require('https');
const fs = require('fs');
const path = require('path');

const VENDOR = path.join(__dirname, 'vendor');
const WEBFONTS = path.join(VENDOR, 'webfonts');

if (!fs.existsSync(WEBFONTS)) fs.mkdirSync(WEBFONTS, { recursive: true });

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const BASE = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0';

  // 1. Download CSS
  console.log('Downloading all.min.css...');
  let css = (await download(`${BASE}/css/all.min.css`)).toString('utf8');
  
  // 2. Extract font file references
  const fontFiles = [
    'fa-solid-900.woff2',
    'fa-solid-900.ttf',
    'fa-regular-400.woff2', 
    'fa-regular-400.ttf',
    'fa-brands-400.woff2',
    'fa-brands-400.ttf',
  ];

  // 3. Download each font
  for (const f of fontFiles) {
    console.log(`Downloading ${f}...`);
    try {
      const data = await download(`${BASE}/webfonts/${f}`);
      fs.writeFileSync(path.join(WEBFONTS, f), data);
      console.log(`  OK (${data.length} bytes)`);
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }

  // 4. Rewrite CSS paths: ../webfonts/ -> webfonts/
  css = css.replace(/\.\.\/webfonts\//g, 'webfonts/');
  fs.writeFileSync(path.join(VENDOR, 'fontawesome-all.min.css'), css, 'utf8');
  console.log('\nSaved vendor/fontawesome-all.min.css (paths rewritten)');

  // 5. List results
  console.log('\nFiles in vendor/webfonts/:');
  fs.readdirSync(WEBFONTS).forEach(f => {
    const size = fs.statSync(path.join(WEBFONTS, f)).size;
    console.log(`  ${f} (${(size/1024).toFixed(1)} KB)`);
  });

  console.log('\nDone! Now update index.html to use vendor/fontawesome-all.min.css');
}

main().catch(e => { console.error(e); process.exit(1); });
