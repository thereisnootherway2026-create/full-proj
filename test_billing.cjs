const { chromium } = require('playwright');

(async () => {
  console.log("Starting playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`CONSOLE ERROR: ${msg.text()}`);
      // Also log args if possible
      Promise.all(msg.args().map(arg => arg.jsonValue())).then(args => {
        console.log(`CONSOLE ERROR ARGS:`, JSON.stringify(args, null, 2));
      }).catch(() => {});
    } else {
      console.log(`CONSOLE: ${msg.text()}`);
    }
  });

  try {
    // Navigate to local dev server
    await page.goto('http://localhost:5173/');
    
    // We might need to login first. Let's see if we are already logged in or we need to type credentials.
    // Wait for a bit.
    await page.waitForTimeout(2000);
    
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes("Connexion")) {
      console.log("Needs login.");
      await page.fill('input[type="email"]', 'test@example.com'); // We need the actual test user
      await page.fill('input[type="password"]', 'password123'); // Guessing
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
    }
    
    // Check if we are on dashboard or need to go to billing
    await page.goto('http://localhost:5173/facturation');
    await page.waitForTimeout(2000);
    
    // Click "Nouvelle facture" (which is a button with "Nouveau" or "Nouvelle facture")
    const buttons = await page.$$('button');
    let clicked = false;
    for (const btn of buttons) {
      const text = await btn.textContent();
      if (text && text.toLowerCase().includes('nouvelle facture')) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    
    if (!clicked) {
      console.log("Could not find 'Nouvelle facture' button.");
      console.log(await page.evaluate(() => document.body.innerText));
      process.exit(1);
    }

    await page.waitForTimeout(1000);

    // Click submit inside the modal
    // It's probably "Enregistrer" or "Créer la facture" or "Soumettre"
    const modalButtons = await page.$$('button');
    for (const btn of modalButtons) {
      const text = await btn.textContent();
      if (text && (text.includes('Créer la facture') || text.includes('Valider') || text.includes('Enregistrer'))) {
        await btn.click();
        console.log("Clicked submit: " + text);
        break;
      }
    }

    await page.waitForTimeout(3000);
    
    // Get red error text
    const redText = await page.evaluate(() => {
      const errorDivs = document.querySelectorAll('.text-red-600, .text-red-500, [class*="text-red"]');
      let texts = [];
      errorDivs.forEach(d => texts.push(d.innerText));
      return texts;
    });
    console.log("RED ERROR TEXT:", redText);

  } catch (err) {
    console.error("Script error:", err);
  } finally {
    await browser.close();
  }
})();
