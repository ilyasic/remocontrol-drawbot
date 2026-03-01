const { Telegraf } = require('telegraf');
const express = require('express');
const puppeteer = require('puppeteer');
const sharp = require('sharp');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.log('⚠️ BOT_TOKEN not set');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
let browser = null;
let page = null;
let isReady = false;

async function initBrowser(url) {
  try {
    console.log('🚀 Starting browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    
    console.log(`🌐 Loading: ${url.substring(0, 50)}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for canvas
    await page.waitForSelector('.main-canvas', { timeout: 30000 });
    
    // Inject API
    await page.evaluate(() => {
      window.parasite = {
        drawLine(x1, y1, x2, y2, color = '#000', width = 2) {
          const c = document.querySelector('.main-canvas');
          const ctx = c.getContext('2d');
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        },
        drawCircle(x, y, r, color = '#000', fill = false) {
          const c = document.querySelector('.main-canvas');
          const ctx = c.getContext('2d');
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          if (fill) ctx.fill();
          ctx.stroke();
        }
      };
    });

    isReady = true;
    console.log('✅ Ready!');
    return true;
  } catch (e) {
    console.error('❌ Init failed:', e.message);
    return false;
  }
}

// Commands
bot.command('start', (ctx) => {
  ctx.reply('🦠 Parasite Bot\nSend me a doodlegator URL');
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('http')) {
    ctx.reply('⏳ Loading...');
    const success = await initBrowser(text);
    if (success) {
      ctx.reply('✅ Loaded! Use /line, /circle, /pic');
    } else {
      ctx.reply('❌ Failed');
    }
  }
});

bot.command('line', async (ctx) => {
  if (!isReady) return ctx.reply('❌ No URL');
  const args = ctx.message.text.split(' ').slice(1);
  const [x1, y1, x2, y2, color = '#000', width = 2] = args;
  await page.evaluate((a) => window.parasite.drawLine(+a.x1, +a.y1, +a.x2, +a.y2, a.color, +a.width), {x1, y1, x2, y2, color, width});
  
  const canvas = await page.$('.main-canvas');
  const png = await canvas.screenshot();
  const jpg = await sharp(png).jpeg({ quality: 85 }).toBuffer();
  await ctx.replyWithPhoto({ source: jpg });
});

bot.command('circle', async (ctx) => {
  if (!isReady) return ctx.reply('❌ No URL');
  const args = ctx.message.text.split(' ').slice(1);
  const [x, y, r, color = '#000', fill = 'false'] = args;
  await page.evaluate((a) => window.parasite.drawCircle(+a.x, +a.y, +a.r, a.color, a.fill === 'true'), {x, y, r, color, fill});
  
  const canvas = await page.$('.main-canvas');
  const png = await canvas.screenshot();
  const jpg = await sharp(png).jpeg({ quality: 85 }).toBuffer();
  await ctx.replyWithPhoto({ source: jpg });
});

// Start
bot.launch();
console.log('🤖 Bot started');

// Keep alive
const app = express();
app.get('/', (req, res) => res.json({ status: isReady ? 'ready' : 'waiting' }));
app.listen(3000, () => console.log('🌐 Server on 3000'));
