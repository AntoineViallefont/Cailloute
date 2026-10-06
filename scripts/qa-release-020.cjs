const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const folder = 'livraison/apercus-0.1.20';
    fs.mkdirSync(folder, { recursive: true });
    await page.goto('http://127.0.0.1:5187');
    await page.getByRole('button', { name: /^Filtres/ }).waitFor();
    const waitUntil = async (fn, arg, timeout = 60000) => {
      const started = Date.now();
      while (!(await page.evaluate(fn, arg))) {
        if (Date.now() - started > timeout) throw new Error('Condition non satisfaite : ' + fn.toString());
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    };
    const waitForTiles = () => waitUntil(() => {
      const map = document.querySelector('.map');
      const rect = map.getBoundingClientRect();
      const visible = [...map.querySelectorAll('canvas')].filter(c => {
        const r = c.getBoundingClientRect();
        return r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top;
      });
      return visible.length > 0 && visible.every(c => c.classList.contains('leaflet-tile-loaded') && c.getContext('2d').getImageData(128, 128, 1, 1).data[3] > 0);
    });
    const cities = [
      ['paris', 48.8566, 2.3522], ['brest', 48.3904, -4.4861],
      ['lille', 50.6292, 3.0573], ['nice', 43.7102, 7.262],
      ['ajaccio', 41.9192, 8.7386], ['bastia', 42.6973, 9.4509],
    ];
    const coverage = [];
    for (const [name, lat, lon] of cities) {
      await page.evaluate(({ lat, lon }) => {
        localStorage.setItem('mapView', JSON.stringify([lat, lon, 13]));
      }, { lat, lon });
      await page.reload();
      await page.getByRole('button', { name: /^Filtres/ }).waitFor();
      await waitUntil(({ lat, lon }) => {
        const v = JSON.parse(localStorage.getItem('mapViewport') || 'null');
        return v && v.zoom === 13 && Math.abs((v.north + v.south) / 2 - lat) < .01 && Math.abs((v.east + v.west) / 2 - lon) < .01;
      }, { lat, lon });
      await waitUntil(async ({ lat, lon }) => {
        const { db } = await import('/src/store.ts');
        return (await db.places.toArray()).some(p => Math.abs(p.lat - lat) < .04 && Math.abs(p.lon - lon) < .04);
      }, { lat, lon });
      const count = await page.evaluate(async ({ lat, lon }) => {
        const { db } = await import('/src/store.ts');
        return (await db.places.toArray()).filter(p => Math.abs(p.lat - lat) < .04 && Math.abs(p.lon - lon) < .04).length;
      }, { lat, lon });
      assert.ok(count > 0, 'Aucun lieu autour de ' + name);
      coverage.push({ name, count });
      if (name === 'ajaccio') { await waitForTiles(); await page.screenshot({ path: `${folder}/carte-ajaccio.png` }); }
    }
    await page.evaluate(() => localStorage.setItem('mapView', JSON.stringify([46.3, 2.5, 5])));
    await page.reload();
    await waitUntil(() => JSON.parse(localStorage.getItem('mapViewport') || '{}').zoom === 5);
    // Attendre une vraie tuile IGN, puis le dessin du canevas au zoom national.
    await waitForTiles();
    await page.screenshot({ path: `${folder}/carte-france.png` });
    await page.getByRole('button', { name: /^Filtres/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('button[data-category="transit"]').click();
    assert.equal(await dialog.locator('button[data-category="transit"]').getAttribute('aria-pressed'), 'false');
    const pmr = dialog.getByRole('button', { name: 'PMR', exact: true });
    await pmr.click();
    assert.equal(await pmr.getAttribute('aria-pressed'), 'true');
    const tariff = dialog.getByRole('group', { name: 'Tarif', exact: true });
    assert.equal(await tariff.getByRole('button').count(), 3);
    assert.equal(await tariff.getByRole('button', { name: 'Tous', exact: true }).count(), 0);
    assert.equal(await tariff.evaluate(el => el.parentElement.nextElementSibling.querySelector('h3').textContent), 'Note minimale');
    const colors = {};
    for (const label of ['Gratuit', 'Payant', 'Non renseigné']) {
      const button = tariff.getByRole('button', { name: label, exact: true });
      colors[label] = await button.evaluate(el => getComputedStyle(el).color);
      await button.click();
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      await button.click();
      assert.equal(await button.getAttribute('aria-pressed'), 'false');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('filters-v7')).price), 'all');
    }
    await tariff.getByRole('button', {name: 'Gratuit', exact: true}).click();
    await pmr.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${folder}/filtres-jour.png` });
    await page.evaluate(() => { localStorage.setItem('theme', JSON.stringify('dark')); document.documentElement.dataset.theme = 'dark'; });
    await page.screenshot({ path: `${folder}/filtres-nuit.png` });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ coverage, zoomNational: 5, pmrSansTransports: true, colors, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
