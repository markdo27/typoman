const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Listen to console logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    
    await page.goto(`file:${path.join(__dirname, 'index.html')}`);
    await page.setViewport({width: 1200, height: 800});
    
    // Force click via evaluate to bypass visibility issues
    await page.evaluate(() => {
        document.getElementById('strobeToggle').click();
        const btns = document.querySelectorAll('.scbtn');
        if(btns.length > 0){
            btns[0].click(); // Shutter
            btns[1].click(); // Split
            btns[2].click(); // BugEye
        }
    });
    
    // Let anim loop run for a bit
    await new Promise(r => setTimeout(r, 1000));

    const dataUrl = await page.evaluate(async () => {
        return window.lastSnapshotDataURL || document.querySelector('canvas').toDataURL('image/png');
    });
    
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync('strobe_test.png', base64Data, 'base64');
    console.log("Saved strobe_test.png");

    await browser.close();
})();
