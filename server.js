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

if (!BOT_TOKEN) {
  console.log('Waiting for BOT_TOKEN...');
  // Keep running for health checks
  setInterval(() => {}, 1000);
  return;
}

const bot = new Telegraf(BOT_TOKEN);

bot.command('start', (ctx) => {
  ctx.reply('🦠 Parasite Bot Ready!\nSend me a doodlegator URL to start.');
});

bot.launch();
console.log('🤖 Bot started! Try /start in Telegram');
