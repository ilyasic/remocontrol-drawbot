const { Telegraf } = require('telegraf');
const express = require('express');
const { chromium } = require('playwright-core');
const sharp = require('sharp');

// CONFIGURATION - Set these in Render Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const DRAWING_URL = process.env.DRAWING_URL || 'https://your-drawing-app-url.com';

if (!BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN environment variable required');
  process.exit(1);
}

class DrawingBot {
  constructor() {
    this.bot = new Telegraf(BOT_TOKEN);
    this.browser = null;
    this.page = null;
    this.isReady = false;
    this.initPromise = this.initialize();
  }

  async initialize() {
    try {
      console.log('Launching browser...');
      
      // Launch with Render-compatible settings
      this.browser = await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      this.page = await this.browser.newPage();
      await this.page.setViewportSize({ width: 800, height: 600 });
      
      console.log(`Loading drawing UI: ${DRAWING_URL}`);
      await this.page.goto(DRAWING_URL, { waitUntil: 'networkidle' });
      
      // Wait for canvas
      await this.page.waitForSelector('canvas', { timeout: 30000 });
      
      // Inject drawing API
      await this.page.addInitScript(() => {
        window.botAPI = {
          drawLine(x1, y1, x2, y2, color = '#000', width = 2) {
            const canvas = document.querySelector('canvas');
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            return { success: true };
          },
          
          drawCircle(x, y, radius, color = '#000', fill = false) {
            const canvas = document.querySelector('canvas');
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            if (fill) ctx.fill();
            ctx.stroke();
            return { success: true };
          },
          
          clearCanvas() {
            const canvas = document.querySelector('canvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return { success: true };
          },
          
          drawStroke(points, color = '#000', width = 2) {
            const canvas = document.querySelector('canvas');
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
              ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
            return { success: true };
          }
        };
      });

      this.isReady = true;
      console.log('✅ Bot ready!');
      this.setupCommands();
      
    } catch (error) {
      console.error('Initialization failed:', error);
      throw error;
    }
  }

  setupCommands() {
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        '🎨 *Drawing Bot Ready!*\n\n' +
        '*Commands:*\n' +
        '`/line x1 y1 x2 y2 [color] [width]` - Draw line\n' +
        '`/circle x y radius [color] [fill]` - Draw circle\n' +
        '`/stroke [{"x":100,"y":100},...]` - Freehand\n' +
        '`/clear` - Clear canvas\n' +
        '`/pic` - Get current image\n' +
        '`/demo` - Draw sample\n\n' +
        'Example: `/line 100 100 300 300 #ff0000 5`',
        { parse_mode: 'Markdown' }
      );
    });

    this.bot.command('line', async (ctx) => {
      if (!this.isReady) return ctx.reply('⏳ Bot still starting...');
      
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 4) {
        return ctx.reply('❌ Usage: `/line x1 y1 x2 y2 [color] [width]`');
      }

      const [x1, y1, x2, y2, color = '#000000', width = '2'] = args;
      
      try {
        await this.page.evaluate((cmd) => {
          return window.botAPI.drawLine(
            parseFloat(cmd.x1), parseFloat(cmd.y1),
            parseFloat(cmd.x2), parseFloat(cmd.y2),
            cmd.color, parseFloat(cmd.width)
          );
        }, { x1, y1, x2, y2, color, width });

        await this.sendCanvas(ctx);
      } catch (e) {
        ctx.reply('❌ Error: ' + e.message);
      }
    });

    this.bot.command('circle', async (ctx) => {
      if (!this.isReady) return ctx.reply('⏳ Bot still starting...');
      
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 3) {
        return ctx.reply('❌ Usage: `/circle x y radius [color] [fill]`');
      }

      const [x, y, radius, color = '#000000', fill = 'false'] = args;
      
      try {
        await this.page.evaluate((cmd) => {
          return window.botAPI.drawCircle(
            parseFloat(cmd.x), parseFloat(cmd.y),
            parseFloat(cmd.radius), cmd.color, cmd.fill === 'true'
          );
        }, { x, y, radius, color, fill });

        await this.sendCanvas(ctx);
      } catch (e) {
        ctx.reply('❌ Error: ' + e.message);
      }
    });

    this.bot.command('stroke', async (ctx) => {
      if (!this.isReady) return ctx.reply('⏳ Bot still starting...');
      
      try {
        const jsonStr = ctx.message.text.split(' ').slice(1).join(' ');
        const points = JSON.parse(jsonStr);
        
        if (!Array.isArray(points) || points.length < 2) {
          return ctx.reply('❌ Need at least 2 points: `[{"x":100,"y":100},{"x":200,"y":200}]`');
        }

        await this.page.evaluate((cmd) => {
          return window.botAPI.drawStroke(cmd.points, '#e74c3c', 3);
        }, { points });

        await this.sendCanvas(ctx);
      } catch (e) {
        ctx.reply('❌ Invalid JSON: ' + e.message);
      }
    });

    this.bot.command('clear', async (ctx) => {
      if (!this.isReady) return ctx.reply('⏳ Bot still starting...');
      
      await this.page.evaluate(() => window.botAPI.clearCanvas());
      ctx.reply('🧹 Canvas cleared!');
      await this.sendCanvas(ctx);
    });

    this.bot.command('pic', async (ctx) => {
      if (!this.isReady) return ctx.reply('⏳ Bot still starting...');
      await this.sendCanvas(ctx);
    });

    this.bot.command('demo', async (ctx) => {
      if (!this.isReady) return ctx.reply('⏳ Bot still starting...');
      
      ctx.reply('🎨 Drawing demo...');
      
      // Draw house
      const commands = [
        { type: 'line', x1: 200, y1: 400, x2: 200, y2: 250, color: '#8b4513', width: 3 },
        { type: 'line', x1: 200, y1: 250, x2: 400, y2: 250, color: '#8b4513', width: 3 },
        { type: 'line', x1: 400, y1: 250, x2: 400, y2: 400, color: '#8b4513', width: 3 },
        { type: 'line', x1: 400, y1: 400, x2: 200, y2: 400, color: '#8b4513', width: 3 },
        { type: 'line', x1: 200, y1: 250, x2: 300, y2: 150, color: '#e74c3c', width: 3 },
        { type: 'line', x1: 300, y1: 150, x2: 400, y2: 250, color: '#e74c3c', width: 3 },
        { type: 'circle', x: 550, y: 150, radius: 40, color: '#f1c40f', fill: true },
      ];

      for (const cmd of commands) {
        if (cmd.type === 'line') {
          await this.page.evaluate((c) => window.botAPI.drawLine(c.x1, c.y1, c.x2, c.y2, c.color, c.width), cmd);
        } else if (cmd.type === 'circle') {
          await this.page.evaluate((c) => window.botAPI.drawCircle(c.x, c.y, c.radius, c.color, c.fill), cmd);
        }
        await new Promise(r => setTimeout(r, 200)); // Animation delay
      }

      await this.sendCanvas(ctx);
    });
  }

  async sendCanvas(ctx) {
    try {
      const canvas = await this.page.$('canvas');
      const screenshot = await canvas.screenshot({ type: 'png' });
      
      // Optimize for Telegram
      const optimized = await sharp(screenshot)
        .resize(800, 600, { fit: 'inside' })
        .jpeg({ quality: 85 })
        .toBuffer();

      await ctx.replyWithPhoto({ source: optimized });
    } catch (e) {
      console.error('Screenshot error:', e);
      ctx.reply('❌ Failed to capture canvas');
    }
  }

  start() {
    // Keep alive for Render
    const app = express();
    app.get('/', (req, res) => {
      res.json({ 
        status: this.isReady ? 'ready' : 'starting',
        timestamp: new Date().toISOString()
      });
    });
    app.listen(process.env.PORT || 3000, () => {
      console.log('Keep-alive server running');
    });

    // Start bot
    this.bot.launch();
    console.log('🤖 Bot started');
  }
}

// Run
const bot = new DrawingBot();
bot.start();