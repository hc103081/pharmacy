import { chromium } from 'playwright';

async function checkLogs() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });
  
  page.on('pageerror', error => {
    consoleLogs.push({
      type: 'pageerror',
      text: error.message,
      stack: error.stack
    });
  });
  
  try {
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 });
    
    // Wait a bit for any async operations
    await page.waitForTimeout(3000);
    
    // Get page title and URL
    const title = await page.title();
    const url = page.url();
    
    console.log('\n=== PAGE INFO ===');
    console.log('Title:', title);
    console.log('URL:', url);
    
    console.log('\n=== CONSOLE LOGS ===');
    if (consoleLogs.length === 0) {
      console.log('No console logs captured');
    } else {
      consoleLogs.forEach((log, i) => {
        console.log(`${i + 1}. [${log.type}] ${log.text}`);
        if (log.location) {
          console.log(`   Location: ${log.location.url}:${log.location.lineNumber}:${log.location.columnNumber}`);
        }
        if (log.stack) {
          console.log(`   Stack: ${log.stack}`);
        }
      });
    }
    
    // Take screenshot
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
    console.log('\nScreenshot saved to debug-screenshot.png');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

checkLogs();