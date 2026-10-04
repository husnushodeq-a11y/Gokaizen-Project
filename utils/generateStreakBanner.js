// utils/generateStreakBanner.js
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');

async function generateStreakBanner({ name1, avatar1, name2, avatar2, streak }) {
  const width = 800;
  const height = 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // --- Background ---
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0a0a0a');
  gradient.addColorStop(1, '#1f1f1f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // --- Load avatars ---
  const [img1, img2] = await Promise.all([loadImage(avatar1), loadImage(avatar2)]);
  const size = 128;

  // User 1 avatar (left)
  ctx.save();
  ctx.beginPath();
  ctx.arc(150, height / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img1, 150 - size / 2, height / 2 - size / 2, size, size);
  ctx.restore();

  // User 2 avatar (right)
  ctx.save();
  ctx.beginPath();
  ctx.arc(width - 150, height / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img2, width - 150 - size / 2, height / 2 - size / 2, size, size);
  ctx.restore();

  // --- Tentukan flame berdasarkan streak ---
  let flameLevel = 1;
  if (streak >= 50) flameLevel = 5;
  else if (streak >= 20) flameLevel = 4;
  else if (streak >= 10) flameLevel = 3;
  else if (streak >= 5) flameLevel = 2;

  const flamePath = path.join(__dirname, '..', 'assets', `flame${flameLevel}.png`);
  const flame = await loadImage(flamePath);

  // --- Gambar flame di tengah ---
  const flameWidth = 160;
  const flameHeight = 160;
  ctx.drawImage(flame, width / 2 - flameWidth / 2, height / 2 - flameHeight / 2, flameWidth, flameHeight);

  // --- Text ---
  ctx.font = 'bold 36px Sans';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(`🔥 ${streak} Day Streak 🔥`, width / 2, height - 50);

  // Simpan hasil banner
  const bannerPath = path.join(__dirname, '..', 'temp', `streak-banner-${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(bannerPath, buffer);

  return bannerPath;
}

module.exports = { generateStreakBanner };
