import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'extension', 'icons');

// Ensure icons directory exists
mkdirSync(iconsDir, { recursive: true });

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background - dark blue
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.15);
  ctx.fill();

  // Ticket shape - bright blue
  ctx.fillStyle = '#3498db';
  const margin = size * 0.15;
  const ticketWidth = size - margin * 2;
  const ticketHeight = size * 0.5;
  const ticketY = (size - ticketHeight) / 2;

  ctx.beginPath();
  ctx.roundRect(margin, ticketY, ticketWidth, ticketHeight, size * 0.08);
  ctx.fill();

  // Notches on sides
  ctx.fillStyle = '#1a1a2e';
  const notchRadius = size * 0.06;
  ctx.beginPath();
  ctx.arc(margin, size / 2, notchRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(size - margin, size / 2, notchRadius, 0, Math.PI * 2);
  ctx.fill();

  // Dashed line
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.setLineDash([size * 0.04, size * 0.04]);
  ctx.beginPath();
  ctx.moveTo(size * 0.35, ticketY + size * 0.1);
  ctx.lineTo(size * 0.35, ticketY + ticketHeight - size * 0.1);
  ctx.stroke();

  return canvas;
}

// Generate icons
const sizes = [16, 48, 128];

sizes.forEach(size => {
  const canvas = drawIcon(size);
  const buffer = canvas.toBuffer('image/png');
  const path = join(iconsDir, `icon${size}.png`);
  writeFileSync(path, buffer);
  console.log(`Generated: ${path}`);
});

console.log('Done! Icons generated successfully.');
