const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text(), msg.location()));
    page.on('pageerror', error => console.log('PAGE ERROR STACK:', error.stack));
    
    await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle2' });
    await browser.close();
})();
