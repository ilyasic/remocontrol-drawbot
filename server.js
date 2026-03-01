const { Telegraf } = require('telegraf');
const express = require('express');
const { chromium } = require('playwright-core');
const sharp = require('sharp');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.log('⚠️ BOT_TOKEN not set. Bot disabled.');
  console.log('Add BOT_TOKEN to Secrets tab!');
}

const app = express();
app.get('/', (req, res) => {
  res.json({ status: 'running', bot: BOT_TOKEN ? 'enabled' : 'disabled' });
});
app.listen(3000, () => console.log('🌐 Server on port 3000'));

// Health check (wait for the bot token to be available)
if (!BOT_TOKEN) {
  console.log('Waiting for BOT_TOKEN...');
  // Keep running for health checks
  setInterval(() => {}, 1000);
  return;
}

const bot = new Telegraf(BOT_TOKEN);

bot.command('start', (ctx) => {
  ctx.reply('🦠 Parasite Bot Ready!\nSend me a DoodleGator URL, and I\'ll capture a screenshot.');
});

// Listen for messages containing URLs
bot.on('text', async (ctx) => {
  const messageText = ctx.message.text;
  
  // Check if the message contains a valid URL
  const urlPattern = /https?:\/\/[^\s]+/;
  const match = messageText.match(urlPattern);
  
  if (match) {
    const url = match[0];  // Extract URL from the message
    
    // Notify user that we are processing the URL
    await ctx.reply(`📸 Capturing screenshot of: ${url}`);
    
    try {
      // Use Playwright to take a screenshot of the provided URL
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });

      // Take screenshot and save it as a buffer
      const screenshotBuffer = await page.screenshot();
      
      // Optionally, you can resize or process the image using Sharp
      const processedImageBuffer = await sharp(screenshotBuffer)
        .resize(800)  // Resize to 800px width (adjust as needed)
        .toBuffer();

      // Send the processed image to the user
      await ctx.replyWithPhoto({ source: processedImageBuffer });

      await browser.close();
    } catch (error) {
      // Handle errors gracefully if something goes wrong
      console.error('Error capturing screenshot:', error);
      await ctx.reply('⚠️ Sorry, I encountered an error while processing the URL. Please try again.');
    }
  } else {
    // If no URL is found in the message
    await ctx.reply('❓ Please send a valid DoodleGator URL to capture a screenshot.');
  }
});

// Start the bot
bot.launch();
console.log('🤖 Bot started! Try /start in Telegram');
