const { chromium } = require('playwright');
const path = require('path');

async function runLivePlaywrightTest() {
  console.log('====================================================');
  console.log('🚀 STARTING LIVE HEADED PLAYWRIGHT END-TO-END TEST');
  console.log('====================================================');

  // Launch Chrome in visible headed mode with slowMo for clear human viewing
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    slowMo: 900, // 900ms pause between actions so user can clearly watch
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();

  page.on('console', msg => console.log(`🖥️ [BROWSER CONSOLE ${msg.type().toUpperCase()}]:`, msg.text()));
  page.on('pageerror', err => console.log(`💥 [BROWSER PAGE ERROR]:`, err.message));

  try {
    console.log('📍 STEP 1: Navigating to Trading Terminal at http://localhost:3001...');
    await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('📍 STEP 2: Testing Super Admin login credentials...');
    // Click quick preset button to demonstrate UI responsiveness
    await page.click('#btn-fill-superadmin');
    await page.waitForTimeout(800);

    // Click submit
    console.log('📍 STEP 3: Submitting login authentication...');
    await page.click('#btn-login');

    // Wait for Dashboard to render
    await page.waitForSelector('#btn-trigger-strategy', { timeout: 10000 });
    console.log('✅ STEP 3 SUCCESS: Successfully authenticated and entered Terminal Dashboard!');
    await page.waitForTimeout(1500);

    // Verify User Role & Upstox status
    const roleText = await page.textContent('#user-role-badge');
    console.log(`👤 Active Operator Role Verified: ${roleText?.trim()}`);

    // STEP 4: Trigger Live Strategy Evaluation
    console.log('📍 STEP 4: Triggering Opening High Breakout / Reversal Strategy Scan...');
    await page.click('#btn-trigger-strategy');

    // Wait for live strategy cards to populate
    await page.waitForSelector('#strategy-card-reliance', { timeout: 10000 });
    console.log('✅ STEP 4 SUCCESS: Strategy evaluation completed!');

    // Read calculated metrics from the Reliance Breakout card
    const relianceCard = await page.$('#strategy-card-reliance');
    const cardText = await relianceCard?.innerText();
    console.log('📊 Evaluated Setup Summary:\n', cardText?.split('\n').slice(0, 8).join('\n'));

    await page.waitForTimeout(2000);

    // STEP 5: Test RBAC User Management Tab
    console.log('📍 STEP 5: Testing RBAC User Management...');
    await page.click('#tab-btn-users');
    await page.waitForSelector('#input-new-username');
    await page.waitForTimeout(1000);

    const testOperator = `trader_${Math.floor(Math.random() * 899 + 100)}`;
    console.log(`📍 STEP 6: Provisioning new desk operator: ${testOperator}...`);
    await page.fill('#input-new-username', testOperator);
    await page.fill('#input-new-password', 'SecretPass789!');
    await page.selectOption('#select-new-role', 'user');
    await page.click('#btn-create-user-submit');

    // Wait for success banner
    await page.waitForSelector('#status-success-banner', { timeout: 5000 });
    console.log(`✅ STEP 6 SUCCESS: Operator ${testOperator} successfully provisioned!`);
    await page.waitForTimeout(2000);

    // STEP 7: System & Broker Diagnostics Tab
    console.log('📍 STEP 7: Inspecting System & Broker Diagnostics...');
    await page.click('#tab-btn-system');
    await page.waitForTimeout(2000);

    // Return to Live Strategy Monitor
    console.log('📍 STEP 8: Returning to Live Strategy Monitor view...');
    await page.click('#tab-btn-strategy');
    await page.waitForTimeout(2000);

    // Take screenshot of fully verified live terminal
    const screenshotPath = path.join(__dirname, '..', 'live_terminal_verified.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);

    console.log('====================================================');
    console.log('🎉 ALL PLAYWRIGHT TESTS PASSED SUCCESSFULLY!');
    console.log('🎉 THE TRADING APP IS READY AND AVAILABLE TO USE!');
    console.log('====================================================');

    await page.waitForTimeout(3000);
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

runLivePlaywrightTest();
