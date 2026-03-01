const { Telegraf } = require('telegraf');
const express = require('express');
const { chromium } = require('playwright-core');
const sharp = require('sharp');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ Set BOT_TOKEN in .replit or environment');
  process.exit(1);
}

class ParasiteBot {
  constructor() {
    this.bot = new Telegraf(BOT_TOKEN);
    this.browser = null;
    this.page = null;
    this.isReady = false;
    this.currentUrl = null;
  }

  async initialize(url) {
    try {
      console.log('🚀 Launching parasite browser...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      this.page = await this.browser.newPage();
      await this.page.setViewportSize({ width: 1200, height: 800 });
      
      console.log(`🌐 Infecting: ${url.substring(0, 50)}...`);
      
      // Block unnecessary resources for speed
      await this.page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2}', route => {
        route.abort();
      });

      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // Wait for canvas with multiple attempts
      let canvasFound = false;
      for (let i = 0; i < 10; i++) {
        const canvas = await this.page.$('.main-canvas');
        if (canvas) {
          canvasFound = true;
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!canvasFound) {
        throw new Error('Canvas not found after 10 seconds');
      }

      console.log('✅ Canvas infected!');

      // Inject parasite API
      await this.page.addInitScript(() => {
        window.parasite = {
          getMainCanvas() {
            return document.querySelector('.main-canvas');
          },

          getTempCanvas() {
            return document.querySelector('.temp-canvas');
          },

          // Direct canvas drawing (bypasses UI)
          drawLine(x1, y1, x2, y2, color = '#000000', width = 2) {
            const c = this.getMainCanvas();
            if (!c) return { error: 'No main canvas' };
            const ctx = c.getContext('2d');
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            return { success: true };
          },

          drawCircle(x, y, radius, color = '#000000', fill = false, width = 2) {
            const c = this.getMainCanvas();
            if (!c) return { error: 'No main canvas' };
            const ctx = c.getContext('2d');
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            if (fill) ctx.fill();
            ctx.stroke();
            return { success: true };
          },

          drawRect(x, y, w, h, color = '#000000', fill = false) {
            const c = this.getMainCanvas();
            if (!c) return { error: 'No main canvas' };
            const ctx = c.getContext('2d');
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            if (fill) ctx.fillRect(x, y, w, h);
            else ctx.strokeRect(x, y, w, h);
            return { success: true };
          },

          clearCanvas() {
            const c = this.getMainCanvas();
            if (!c) return { error: 'No main canvas' };
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);
            return { success: true };
          },

          // Get current image data
          getImageData() {
            const c = this.getMainCanvas();
            if (!c) return null;
            return c.toDataURL('image/png');
          }
        };
      });

      this.isReady = true;
      this.currentUrl = url;
      console.log('✅ Parasite fully attached!');
      return true;
      
    } catch (err) {
      console.error('❌ Infection failed:', err.message);
      if (this.browser) await this.browser.close();
      return false;
    }
  }

  // Click UI element by selector
  async clickUI(selector) {
    try {
      const el = await this.page.$(selector);
      if (el) {
        await el.click();
        await new Promise(r => setTimeout(r, 300)); // Wait for UI update
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // Click tool by index (from our scan)
  async clickTool(index) {
    const tools = await this.page.$$('.circle-switch');
    if (tools[index]) {
      await tools[index].click();
      await new Promise(r => setTimeout(r, 300));
      return true;
    }
    return false;
  }

  // Set specific tool
  async setTool(name) {
    const tools = {
      'brush': 0,
      'eraser': 1,
      'tool2': 2,  // unknown
      'tool3': 3,  // unknown
      'palette': 4,
      'undo': 5,
      'redo': 6,
      'clear': 7,
      'layers': 8,
      'tool9': 9   // unknown
    };
    
    const idx = tools[name];
    if (idx !== undefined) {
      await this.clickTool(idx);
      console.log(`🛠️ Tool set: ${name}`);
      return true;
    }
    return false;
  }

  setupCommands() {
    this.bot.command('start', (ctx) => {
      ctx.reply(
        '🦠 *DOODLE PARASITE BOT*\n\n' +
        '*How to use:*\n' +
        '1️⃣ Send me a fresh doodlegator URL\n' +
        '2️⃣ I infect the page\n' +
        '3️⃣ You control it remotely\n\n' +
        '*Commands:*\n' +
        '`/line x1 y1 x2 y2 [#color] [width]` - Draw line\n' +
        '`/circle x y radius [#color] [fill]` - Draw circle\n' +
        '`/rect x y w h [#color] [fill]` - Draw rectangle\n' +
        '`/tool brush|eraser|clear|palette` - Switch tool\n' +
        '`/clear` - Clear canvas\n' +
        '`/pic` - Screenshot\n' +
        '`/status` - Check status\n\n' +
        '⚠️ URL expires ~24h, get fresh from @doodlegatorbot',
        { parse_mode: 'Markdown' }
      );
    });

    // Handle URL paste
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      
      if (text.includes('doodlegator.top') && text.startsWith('http')) {
        ctx.reply('🦠 Attaching parasite to host...');
        
        // Kill old infection
        if (this.browser) {
          await this.browser.close();
          this.isReady = false;
        }
        
        const success = await this.initialize(text);
        
        if (success) {
          ctx.reply(
            '✅ *PARASITE ATTACHED!*\n\n' +
            'The host is under your control.\n' +
            'Try: `/line 100 100 400 400 #ff0000 5`',
            { parse_mode: 'Markdown' }
          );
          await this.sendPic(ctx);
        } else {
          ctx.reply('❌ Failed to attach. URL may be expired or invalid.');
        }
        return;
      }
    });

    this.bot.command('line', async (ctx) => {
      if (!this.isReady) return ctx.reply('❌ No host attached. Send doodlegator URL first.');
      
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 4) {
        return ctx.reply('Usage: `/line 100 100 400 400 #ff0000 5`');
      }
      
      const [x1, y1, x2, y2, color = '#000000', width = 2] = args;
      
      try {
        await this.page.evaluate((a) => {
          return window.parasite.drawLine(+a.x1, +a.y1, +a.x2, +a.y2, a.color, +a.width);
        }, {x1, y1, x2, y2, color, width});
        
        await this.sendPic(ctx);
      } catch (e) {
        ctx.reply('❌ Drawing failed: ' + e.message);
      }
    });

    this.bot.command('circle', async (ctx) => {
      if (!this.isReady) return ctx.reply('❌ No host attached. Send URL first.');
      
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 3) {
        return ctx.reply('Usage: `/circle 400 300 50 #3498db true`');
      }
      
      const [x, y, r, color = '#000000', fill = 'false'] = args;
      
      try {
        await this.page.evaluate((a) => {
          return window.parasite.drawCircle(+a.x, +a.y, +a.r, a.color, a.fill === 'true');
        }, {x, y, r, color, fill});
        
        await this.sendPic(ctx);
      } catch (e) {
        ctx.reply('❌ Drawing failed: ' + e.message);
      }
    });

    this.bot.command('rect', async (ctx) => {
      if (!this.isReady) return ctx.reply('❌ No host attached. Send URL first.');
      
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 4) {
        return ctx.reply('Usage: `/rect 100 100 200 150 #00ff00 true`');
      }
      
      const [x, y, w, h, color = '#000000', fill = 'false'] = args;
      
      try {
        await this.page.evaluate((a) => {
          return window.parasite.drawRect(+a.x, +a.y, +a.w, +a.h, a.color, a.fill === 'true');
        }, {x, y, w, h, color, fill});
        
        await this.sendPic(ctx);
      } catch (e) {
        ctx.reply('❌ Drawing failed: ' + e.message);
      }
    });

    this.bot.command('tool', async (ctx) => {
      if (!this.isReady) return ctx.reply('❌ No host attached.');
      
      const args = ctx.message.text.split(' ').slice(1);
      const toolName = args[0]?.toLowerCase();
      
      if (!toolName) {
        return ctx.reply('Usage: `/tool brush` or `/tool eraser` or `/tool clear`');
      }
      
      const success = await this.setTool(toolName);
      if (success) {
        ctx.reply(`🛠️ Tool activated: *${toolName}*`, { parse_mode: 'Markdown' });
      } else {
        ctx.reply('❌ Unknown tool. Try: brush, eraser, clear, palette, undo, redo, layers');
      }
    });

    this.bot.command('clear', async (ctx) => {
      if (!this.isReady) return ctx.reply('❌ No host attached.');
      
      await this.setTool('clear');
      ctx.reply('🧹 Canvas purged!');
      await this.sendPic(ctx);
    });

    this.bot.command('pic', async (ctx) => {
      if (!this.isReady) return ctx.reply('❌ No host attached.');
      await this.sendPic(ctx);
    });

    this.bot.command('status', (ctx) => {
      if (this.isReady) {
        ctx.reply(
          '✅ *PARASITE ACTIVE*\n' +
          `Host: ${this.currentUrl?.substring(0, 40)}...\n` +
          'Ready for commands.',
          { parse_mode: 'Markdown' }
        );
      } else {
        ctx.reply('❌ No host. Send doodlegator URL to attach.');
      }
    });
  }

  async sendPic(ctx) {
    try {
      const canvas = await this.page.$('.main-canvas');
      if (!canvas) {
        return ctx.reply('❌ Canvas lost! Host may have disconnected.');
      }
      
      const png = await canvas.screenshot({ type: 'png' });
      const jpg = await sharp(png)
        .resize(800, 600, { fit: 'inside' })
        .jpeg({ quality: 85 })
        .toBuffer();
      
      await ctx.replyWithPhoto({ source: jpg });
    } catch (e) {
      console.error('Screenshot failed:', e);
      ctx.reply('❌ Failed to capture canvas');
    }
  }

  start() {
    // Keep-alive server
    const app = express();
    app.get('/', (req, res) => res.json({
      status: this.isReady ? 'parasite_active' : 'waiting_for_host',
      host: this.isReady ? 'connected' : 'none',
      timestamp: Date.now()
    }));
    app.listen(3000, '0.0.0.0', () => {
      console.log('🌐 Keep-alive server on port 3000');
    });

    this.setupCommands();
    this.bot.launch();
    console.log('🦠 PARASITE BOT READY');
    console.log('Waiting for host (doodlegator URL)...');
  }
}

new ParasiteBot().start();