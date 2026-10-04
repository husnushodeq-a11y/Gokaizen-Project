// utils/absenCanvas.js
const { createCanvas, loadImage } = require("canvas");

// ===== KONFIGURASI =====
const ROWS_PER_COLUMN = 50;

const COLUMN_WIDTH = 380;
const PADDING_TOP = 80;
const PADDING_LEFT = 20;
const PADDING_BOTTOM = 50;
const LINE_SPACING = 45;

const AVATAR_SIZE = 32;
const JAM_SIZE = 20;

const days = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

// ===== AUTO FONT FIT =====
function fitFont(ctx, text, maxWidth, initial = 24) {
  let size = initial;
  while (size > 12) {
    ctx.font = `${size}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size--;
  }
  return size;
}

// ===== MAIN GENERATOR =====
async function generateAbsenImage(users, jamPath, startIndex = 0, dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);

  const title = `List Active Today - ${days[dateObj.getDay()]}, ${d} ${months[m - 1]} ${y}`;

  const columnCount = Math.ceil(users.length / ROWS_PER_COLUMN) || 1;
  const rows = Math.min(users.length, ROWS_PER_COLUMN);

  const width = PADDING_LEFT * 2 + columnCount * COLUMN_WIDTH;
  const height = PADDING_TOP + rows * LINE_SPACING + PADDING_BOTTOM;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = "#000";
  ctx.font = "36px Arial";
  ctx.fillText(title, PADDING_LEFT, 50);

  const jamImg = await loadImage(jamPath);

  for (let i = 0; i < users.length; i++) {
    const col = Math.floor(i / ROWS_PER_COLUMN);
    const row = i % ROWS_PER_COLUMN;

    const baseX = PADDING_LEFT + col * COLUMN_WIDTH;
    const yPos = PADDING_TOP + row * LINE_SPACING;

    const u = users[i];

    // ===== AVATAR CIRCLE =====
    if (u.avatarURL) {
      try {
        const avatar = await loadImage(u.avatarURL);

        ctx.save();
        ctx.beginPath();
        ctx.arc(
          baseX + AVATAR_SIZE / 2,
          yPos - AVATAR_SIZE / 2 + 8,
          AVATAR_SIZE / 2,
          0,
          Math.PI * 2
        );
        ctx.clip();

        ctx.drawImage(
          avatar,
          baseX,
          yPos - AVATAR_SIZE + 8,
          AVATAR_SIZE,
          AVATAR_SIZE
        );
        ctx.restore();
      } catch (err) {
        // skip avatar error
      }
    }

    // ===== TEXT =====
    const textX = baseX + AVATAR_SIZE + 10;
    const text = `${startIndex + i + 1}. ${u.username}`;
    const fontSize = fitFont(ctx, text, COLUMN_WIDTH - 120);

    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = "#000";
    ctx.fillText(text, textX, yPos);

    // ===== JAM ICON =====
    const jamX = textX + ctx.measureText(text).width + 6;
    ctx.drawImage(jamImg, jamX, yPos - JAM_SIZE + 6, JAM_SIZE, JAM_SIZE);

    // ===== TIME =====
    ctx.font = "18px Arial";
    ctx.fillStyle = "#555";
    ctx.fillText(u.time, jamX + JAM_SIZE + 6, yPos);
  }

  return canvas.toBuffer();
}

module.exports = { generateAbsenImage };