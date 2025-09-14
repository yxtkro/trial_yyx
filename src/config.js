module.exports = {
  ADMIN_USER_ID: 1226644586,
  TRIAL_CODES: ["GALIT2", "AKOSA0", "MAGNANAKAW2", "SAKABAN5", "NGBAYAN5"],
  MAX_ACCOUNTS_TOTAL: 12,
  MAX_ACCOUNTS_PER_MESSAGE: 6,
  RATE_LIMIT_MS: process.env.RATE_LIMIT_MS ? parseInt(process.env.RATE_LIMIT_MS) : 10000,
  LOG_FILE: process.env.LOG_FILE || 'logs/bot-usage.log',
  PUPPETEER_OPTIONS: {
    headless: true,
    slowMo: 40,
    defaultViewport: { width: 1280, height: 800 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1280,800'
    ],
  },
  LOGIN_SITES: {
    BMW: {
      url: 'https://05bmw.com?r=NW44EK',
      isBMW: true,
      registerSelector: 'span._3mCDiKdouGMmZfJFbIxy5G.ppUNnOlkVUpue-NNt6vxo',
      loginOpenSelector: 'div._2mBNgBjbvImj-b_6WuwAFm',
      captchaImgSelector: 'img.dVSNlKsQ1qaz1uSto7bNM',
      circlesUlSelector: 'ul._1f9NenqKkFJGmyt8Rb8Kuh',
      newWheelSelector: 'img[ng-src*="NewLuckyWheel"]',
      wheelStartSelector: 'span[translate="NewLuckyWheel_Start"]'
    },
    NN77N: {
      url: 'https://nn77n.com',
      isBMW: false,
      registerSelector: 'button.ng-binding.ppUNnOlkVUpue-NNt6vxo',
      loginOpenSelector: '._2mBNgBjbvImj-b_6WuwAFm',
      captchaImgSelector: 'img.dVSNlKsQ1qaz1uSto7bNM',
      circlesUlSelector: 'ul._1f9NenqKkFJGmyt8Rb8Kuh',
      newWheelSelector: 'img[ng-src*="NewLuckyWheel"], img[src*="NewLuckyWheel"]',
      wheelStartSelector: 'span[translate="NewLuckyWheel_Start"]'
    }
  }
};
