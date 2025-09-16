const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { PUPPETEER_OPTIONS, LOGIN_SITES } = require('./config');
const { solveCaptcha } = require('./captchaSolver');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Random mouse move inside viewport
async function randomMouseMove(page, times = 3) {
  const { width, height } = await page.viewport();
  for (let i = 0; i < times; i++) {
    const x = Math.floor(Math.random() * width * 0.9) + 10;
    const y = Math.floor(Math.random() * height * 0.9) + 10;
    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 8) + 3 });
    await delay(Math.random() * 400 + 100);
  }
}

// Helper: Random scroll on the page
async function randomScroll(page, times = 2) {
  for (let i = 0; i < times; i++) {
    const scrollY = Math.floor(Math.random() * 400);
    await page.evaluate(y => window.scrollBy(0, y), scrollY);
    await delay(Math.random() * 600 + 200);
  }
}

// Helper: Human-like typing (per character, random delay)
async function humanType(page, selector, text) {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char);
    await delay(Math.random() * 120 + 50); // 50ms to 170ms per char
  }
}

async function createBrowser() {
  return await puppeteer.launch(PUPPETEER_OPTIONS);
}

async function registerAccount(account, siteKey) {
  const { url, isBMW, registerSelector } = LOGIN_SITES[siteKey];
  const browser = await createBrowser();
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      await randomScroll(page, 2);
      await randomMouseMove(page, 4);

      try {
        await page.waitForSelector('span[translate="Common_Closed"]', { timeout: 5000 });
        await randomMouseMove(page, 2);
        await page.click('span[translate="Common_Closed"]');
        await delay(1000);
      } catch {}

      await page.waitForSelector(registerSelector, { timeout: 5000 });
      await randomMouseMove(page, 3);
      await page.click(registerSelector);
      await delay(1500);

      await page.waitForSelector('input[ng-model="$ctrl.user.account.value"]', { timeout: 10000 });

      await randomMouseMove(page, 2);
      await humanType(page, 'input[ng-model="$ctrl.user.account.value"]', account.username);
      await humanType(page, 'input[ng-model="$ctrl.user.password.value"]', account.password);
      await humanType(page, 'input[ng-model="$ctrl.user.confirmPassword.value"]', account.confirmPassword);
      await delay(1000);

      const accountExistSelector = 'div[ng-if="isOpen"][ng-bind="title"]';

      try {
        await page.waitForSelector(accountExistSelector, { timeout: 2500 });
        const msg = await page.$eval(accountExistSelector, el => el.innerText.trim());
        if (msg.toLowerCase().includes('account exist')) {
          return 'account already exist';
        }
      } catch {}

      await humanType(page, 'input[ng-model="$ctrl.user.name.value"]', account.fullname);
      await delay(1000);

      const captchaInputSelector = 'input[ng-model="$ctrl.code"]';
      await page.waitForSelector(captchaInputSelector, { visible: true });
      await randomMouseMove(page, 2);
      await page.click(captchaInputSelector);

      const captchaImgSelector = 'img._3MSK6A03OPsM8LoNU-b9qF';
      await page.waitForSelector(captchaImgSelector, { visible: true, timeout: 10000 });

      await solveCaptcha(page, captchaImgSelector, captchaInputSelector);

      await randomMouseMove(page, 2);
      await page.click('button[type="submit"]');
      await delay(5000);

      return null;
    }
  } catch (err) {
    if (attempt === 2) {
      return err.message || 'Unknown registration error';
    }
  } finally {
    await browser.close();
  }
}

async function tryLoginBMW(account) {
  const { url, loginOpenSelector, captchaImgSelector, circlesUlSelector, newWheelSelector, wheelStartSelector } = LOGIN_SITES.BMW;
  const browser = await createBrowser();
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    await randomScroll(page, 2);
    await randomMouseMove(page, 3);

    try {
      await page.waitForSelector('span[translate="Common_Closed"]', { timeout: 5000 });
      await randomMouseMove(page, 2);
      await page.click('span[translate="Common_Closed"]');
      await delay(1000);
    } catch {}

    await page.waitForSelector(loginOpenSelector, { visible: true });
    await randomMouseMove(page, 3);
    await page.click(loginOpenSelector);
    await delay(1500);

    const usernameSelector = 'input[ng-model="$ctrl.user.account.value"]';
    const passwordSelector = 'input[ng-model="$ctrl.user.password.value"]';
    const captchaInputSelector = 'input[ng-model="$ctrl.code"]';

    await page.waitForSelector(usernameSelector, { visible: true });
    await page.waitForSelector(passwordSelector, { visible: true });
    await page.waitForSelector(captchaInputSelector, { visible: true });

    await randomMouseMove(page, 2);
    await humanType(page, usernameSelector, account.username);
    await humanType(page, passwordSelector, account.password);
    await delay(1000);

    await randomMouseMove(page, 2);
    await page.click(captchaInputSelector);
    await delay(1500);

    await solveCaptcha(page, captchaImgSelector, captchaInputSelector);

    await randomMouseMove(page, 2);
    await page.click('button[type="submit"]');
    await delay(3000);

    const errorSelector = 'div[bind-html-compile="$ctrl.content"]';
    let loginError = null;
    try {
      await page.waitForSelector(errorSelector, { visible: true, timeout: 2000 });
      loginError = await page.$eval(errorSelector, el => el.textContent.trim());
      if (loginError) {
        await browser.close();
        return { spun: false, message: loginError, loginError: true };
      }
    } catch {}

    await delay(2000);

    await page.waitForSelector(circlesUlSelector, { visible: true, timeout: 10000 });

    const circles = await page.$$(circlesUlSelector + ' li');
    if (circles.length >= 2) {
      await randomMouseMove(page, 1);
      await circles[1].click();
      await delay(1500);
    }

    const [newPagePromise] = await Promise.all([
      new Promise(resolve => page.browser().once('targetcreated', target => resolve(target.page()))),
      page.click(newWheelSelector)
    ]);
    const newPage = await newPagePromise;
    await newPage.bringToFront();

    await newPage.waitForSelector(wheelStartSelector, { visible: true, timeout: 20000 });
    const startButtonSpan = await newPage.$(wheelStartSelector);
    if (!startButtonSpan) throw new Error("Start button span not found");

    await randomMouseMove(newPage, 2);
    const startButton = await startButtonSpan.evaluateHandle(span => span.parentElement);
    await startButton.click();

    let result = { spun: false, message: 'No bonus or error popup detected.' };
    const bonusSelector = 'p[ng-if="!$ctrl.notWinning"][ng-bind="$ctrl.description"]';
    const errorSelector2 = 'div[bind-html-compile="$ctrl.content"]';

    let found = false;
    for (let i = 0; i < 15; i++) {
      const bonusEl = await newPage.$(bonusSelector);
      if (bonusEl) {
        const bonusText = await newPage.evaluate(el => el.innerText.trim(), bonusEl);
        result = { spun: true, message: bonusText };
        found = true;
        break;
      }
      const errorEl = await newPage.$(errorSelector2);
      if (errorEl) {
        const errorText = await newPage.evaluate(el => el.innerText.trim(), errorEl);
        result = { spun: false, message: errorText };
        found = true;
        break;
      }
      await delay(1000);
    }

    await newPage.close();
    await browser.close();
    return result;

  } catch (err) {
    await browser.close();
    throw err;
  }
}

async function tryLoginNN77N(account) {
  const { url, loginOpenSelector, captchaImgSelector, circlesUlSelector, newWheelSelector, wheelStartSelector } = LOGIN_SITES.NN77N;
  const browser = await createBrowser();
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    await randomScroll(page, 2);
    await randomMouseMove(page, 3);

    try {
      await page.waitForSelector('span[translate="Common_Closed"]', { timeout: 5000 });
      await randomMouseMove(page, 2);
      await page.click('span[translate="Common_Closed"]');
      await delay(1000);
    } catch {}

    await page.waitForSelector(loginOpenSelector, { visible: true });
    await randomMouseMove(page, 2);
    await page.click(loginOpenSelector);
    await delay(1500);

    const usernameSelector = 'input[ng-model="$ctrl.user.account.value"]';
    const passwordSelector = 'input[ng-model="$ctrl.user.password.value"]';
    const captchaInputSelector = 'input[ng-model="$ctrl.code"]';

    await page.waitForSelector(usernameSelector, { visible: true });
    await page.waitForSelector(passwordSelector, { visible: true });
    await page.waitForSelector(captchaInputSelector, { visible: true });

    await randomMouseMove(page, 2);
    await humanType(page, usernameSelector, account.username);
    await humanType(page, passwordSelector, account.password);
    await delay(1000);

    await randomMouseMove(page, 2);
    await page.click(captchaInputSelector);
    await delay(1500);

    await solveCaptcha(page, captchaImgSelector, captchaInputSelector);

    await randomMouseMove(page, 2);
    await page.click('button[type="submit"]');
    await delay(3000);

    const errorSelector = 'div[bind-html-compile="$ctrl.content"]';
    let loginError = null;
    try {
      await page.waitForSelector(errorSelector, { visible: true, timeout: 2000 });
      loginError = await page.$eval(errorSelector, el => el.textContent.trim());
      if (loginError) {
        await browser.close();
        return { spun: false, message: loginError, loginError: true };
      }
    } catch {}

    await delay(2000);

    await page.waitForSelector(circlesUlSelector, { visible: true, timeout: 10000 });

    const circles = await page.$$(circlesUlSelector + ' li');
    if (circles.length >= 2) {
      await randomMouseMove(page, 1);
      await circles[1].click();
      await delay(1500);
    }

    const [newPagePromise] = await Promise.all([
      new Promise(resolve => page.browser().once('targetcreated', target => resolve(target.page()))),
      page.click(newWheelSelector)
    ]);
    const newPage = await newPagePromise;
    await newPage.bringToFront();

    await newPage.waitForSelector(wheelStartSelector, { visible: true, timeout: 20000 });
    const startButtonSpan = await newPage.$(wheelStartSelector);
    if (!startButtonSpan) throw new Error("Start button span not found");

    await randomMouseMove(newPage, 2);
    const startButton = await startButtonSpan.evaluateHandle(span => span.parentElement);
    await startButton.click();

    const successH2Sel = 'h2[translate="NewLuckyWheel_CongrazYouGet"]';
    const successDescSel = 'p[ng-bind="$ctrl.description"]';
    const errorDialogSel = 'gupw-dialog-alert';

    let outcome = null;
    try {
      outcome = await Promise.race([
        newPage.waitForSelector(successH2Sel, { visible: true, timeout: 10000 }).then(() => 'success'),
        newPage.waitForSelector(errorDialogSel, { visible: true, timeout: 10000 }).then(() => 'error')
      ]);
    } catch {
      outcome = null;
    }

    if (outcome === 'success') {
      const bonusDescription = await newPage.evaluate(sel => {
        const p = document.querySelector(sel);
        return p ? p.innerText.trim() : '';
      }, successDescSel);
      await newPage.close();
      await browser.close();
      return { spun: true, message: bonusDescription || 'N/A' };
    }

    let dialogAppeared = false;
    for (let i = 0; i < 10; i++) {
      const dialog = await newPage.$(errorDialogSel);
      if (dialog) {
        dialogAppeared = true;
        break;
      }
      await delay(800);
    }

    if (dialogAppeared) {
      const prizeCode = await newPage.evaluate(() => {
        const span = document.querySelector('gupw-dialog-alert span._3ckSgIbM5h7ensoDEfbKcE');
        return span ? span.innerText.trim() : null;
      });
      const dialogMessage = await newPage.evaluate(() => {
        const bodyDiv = document.querySelector('gupw-dialog-alert div.modal-body div[bind-html-compile]');
        return bodyDiv ? bodyDiv.innerText.trim() : null;
      });

      const confirmBtn = await newPage.$('gupw-dialog-alert button.btn-primary');
      if (confirmBtn) {
        await confirmBtn.click();
      }

      await newPage.close();
      await browser.close();
      return { spun: false, message: dialogMessage || 'Dialog shown' };
    }

    await newPage.close();
    await browser.close();
    return { spun: false, message: 'No result detected' };

  } catch (err) {
    await browser.close();
    throw err;
  }
}

module.exports = {
  registerAccount,
  tryLoginBMW,
  tryLoginNN77N,
};
