const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR STACK:', error.stack));
    
    await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
        document.querySelector('.fxbtn[data-fx="smear"]').click();
    });
    
    // Wait for canvas to draw
    await new Promise(r => setTimeout(r, 500));

    const dataUrl = await page.evaluate(async () => {
        return document.querySelector('canvas').toDataURL('image/png');
    });
    
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync('smear_test.png', base64Data, 'base64');
    
    console.log('Saved smear_test.png');
    await browser.close();
})();
