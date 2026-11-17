// QA3 helpers: paste at the start of a driver session (qa3/q.sh < qa3/helpers.js)
S.drag = async (x,y,dx,dy,steps=20,hold=30, mid) => { await page.mouse.move(x,y); await page.waitForTimeout(150); await page.mouse.down(); for (let k=1;k<=steps;k++){ await page.mouse.move(x+dx*k/steps,y+dy*k/steps); await page.waitForTimeout(hold);} if (mid) await mid(); await page.mouse.up(); };
S.sum = async () => { const s = await T(()=>window.trapla.summary()); return s && { bn: +(s.cost.total/1e9).toFixed(3), valid: s.valid, len: Math.round(s.length), v: s.violations.map(v=>`${v.title} @${(v.s0/1000).toFixed(2)}`) }; };
S.card = async () => (await page.locator('.ctx, #inspector, .inspector').first().innerText().catch(()=>'')).slice(0,1500);
S.start = async (title) => { const card = page.locator('div,section,article').filter({hasText: title}).filter({has: page.getByRole('button',{name:'Start'})}).last(); await card.getByRole('button',{name:'Start'}).click(); const t0=Date.now(); await idle(1500); return Date.now()-t0; };
return 'ok';
