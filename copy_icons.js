const fs = require('fs');
const path = require('path');

// 1. Klargjør vendor-filer fra node_modules hvis de finnes
const vendorDir = path.join(__dirname, 'vendor');
if (!fs.existsSync(vendorDir)) {
    fs.mkdirSync(vendorDir, { recursive: true });
}

const quillJsSrc = path.join(__dirname, 'node_modules', 'quill', 'dist', 'quill.js');
const quillCssSrc = path.join(__dirname, 'node_modules', 'quill', 'dist', 'quill.snow.css');
const html2canvasSrc = path.join(__dirname, 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js');

if (fs.existsSync(quillJsSrc)) {
    fs.copyFileSync(quillJsSrc, path.join(vendorDir, 'quill.js'));
}
if (fs.existsSync(quillCssSrc)) {
    fs.copyFileSync(quillCssSrc, path.join(vendorDir, 'quill.snow.css'));
}
if (fs.existsSync(html2canvasSrc)) {
    fs.copyFileSync(html2canvasSrc, path.join(vendorDir, 'html2canvas.min.js'));
}

// 2. Klargjør dist/ for Tauri frontendDist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

const distVendorDir = path.join(distDir, 'vendor');
if (!fs.existsSync(distVendorDir)) {
    fs.mkdirSync(distVendorDir, { recursive: true });
}

['index.html', 'renderer.js', 'styles.css'].forEach(file => {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(distDir, file));
    }
});

['quill.js', 'quill.snow.css', 'html2canvas.min.js'].forEach(file => {
    const src = path.join(vendorDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(distVendorDir, file));
    }
});

// 3. Klargjør ikoner og ressurser KUN dersom mappen ikke eksisterer fra før
const iconsDir = path.join(__dirname, 'src-tauri', 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });

    const icoSrc = path.join(__dirname, 'app_ikon.ico');
    const pngSrc = path.join(__dirname, 'ikon.png');

    if (fs.existsSync(icoSrc)) {
        fs.copyFileSync(icoSrc, path.join(iconsDir, 'icon.ico'));
    }

    if (fs.existsSync(pngSrc)) {
        fs.copyFileSync(pngSrc, path.join(iconsDir, '32x32.png'));
        fs.copyFileSync(pngSrc, path.join(iconsDir, '128x128.png'));
        fs.copyFileSync(pngSrc, path.join(iconsDir, '128x128@2x.png'));
        fs.copyFileSync(pngSrc, path.join(iconsDir, 'Square310x310Logo.png'));
        fs.copyFileSync(pngSrc, path.join(iconsDir, 'icon.icns'));
    }
}

console.log('Tauri ikoner, dist og vendor-ressurser er klargjort.');
