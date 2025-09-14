const Tesseract = require('tesseract.js');
const fs = require('fs').promises;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Saves base64 image to a temp file asynchronously
 * @param {string} base64data
 * @returns {string} temp filename
 */
async function saveCaptchaImage(base64data) {
  const base64 = base64data.split(',')[1];
  const buffer = Buffer.from(base64, 'base64');
  const fileName = `captcha_${Date.now()}.png`;
  await fs.writeFile(fileName, buffer);
  return fileName;
}

/**
 * Uses OCR to extract 4-digit captcha code with retries
 * @param {string} fileName
 * @returns {string} captcha code or empty string
 */
async function ocrCaptcha(fileName) {
  let captchaCode = '';
  let attempts = 0;
  while (captchaCode.length !== 4 && attempts < 3) {
    const { data: { text } } = await Tesseract.recognize(fileName, 'eng');
    captchaCode = (text.match(/\d{4}/) || [''])[0];
    attempts++;
    if (captchaCode.length !== 4) {
      await delay(1000);
    }
  }
  return captchaCode;
}

/**
 * Solve captcha on Puppeteer page by its selectors
 * @param {object} page Puppeteer page
 * @param {string} captchaImgSelector
 * @param {string} captchaInputSelector
 */
async function solveCaptcha(page, captchaImgSelector, captchaInputSelector) {
  const maxOcrAttempts = 3;
  for (let attempt = 1; attempt <= maxOcrAttempts; attempt++) {
    try {
      await page.waitForSelector(captchaImgSelector, { visible: true, timeout: 15000 });
      await delay(4000);
      const captchaSrc = await page.evaluate(selector => {
        const img = document.querySelector(selector);
        return img?.getAttribute('ng-src') || img?.getAttribute('src');
      }, captchaImgSelector);
      if (!captchaSrc || !captchaSrc.startsWith('data:image')) throw new Error("Captcha missing or invalid");

      const fileName = await saveCaptchaImage(captchaSrc);
      const code = await ocrCaptcha(fileName);
      await fs.unlink(fileName);
      if (code.length === 4) {
        await page.type(captchaInputSelector, code);
        return code;
      }
    } catch {}
    await delay(1500);
  }
  throw new Error("OCR failed to get valid captcha");
}

module.exports = {
  solveCaptcha
};
