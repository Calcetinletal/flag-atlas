// Run with: node test_palette.cjs /path/to/node_modules/jsdom
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require(process.argv[2]);
const root=__dirname;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data.json')));
const colorNames=['red','blue','green','yellow','black','white','orange','purple','brown'];
const errors=[],consoleSpy=new VirtualConsole();
consoleSpy.on('jsdomError',e=>errors.push(e.message));consoleSpy.on('error',(...e)=>errors.push(e.join(' ')));
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{
  url:'http://localhost/',runScripts:'outside-only',virtualConsole:consoleSpy,
  beforeParse(window){
    window.fetch=async file=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))});
    window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  }
});
const {window}=dom,doc=window.document,$=id=>doc.getElementById(id);
// An independent bitmask path is used for expected sets and scores.
function mask(row){if(!Array.isArray(row.colors)||!row.colors.length||row.colors.some(c=>!colorNames.includes(c)))return 0;return row.colors.reduce((m,c)=>m|(1<<colorNames.indexOf(c)),0);}
function bitCount(value){let count=0;while(value){value&=value-1;count++;}return count;}
function expectedScore(a,b){const union=mask(a)|mask(b);return union?bitCount(mask(a)&mask(b))/bitCount(union):0;}
function expectedMatches(focus){return rows.filter(row=>row.country!==focus.country&&mask(row)).map(row=>({row,score:expectedScore(focus,row)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.row.country.localeCompare(b.row.country)).slice(0,8);}
function checkGraph(focus){
  const matches=expectedMatches(focus),eligible=matches.map(m=>m.row.country);
  const nodes=[...doc.querySelectorAll('#network-graph .neighbor-node')];
  assert.deepEqual(nodes.map(n=>n.dataset.network),eligible,`${focus.country}: network nodes`);
  const core=[...doc.querySelectorAll('#network-graph [data-edge="center"]')];
  assert.deepEqual(core.map(line=>line.dataset.b),eligible,`${focus.country}: central links`);
  const expected=[];
  for(let i=0;i<matches.length;i++)for(let j=i+1;j<matches.length;j++)if(expectedScore(matches[i].row,matches[j].row)>=2/3)expected.push(matches[i].row.country+'|'+matches[j].row.country);
  const neighbor=[...doc.querySelectorAll('#network-graph [data-edge="neighbor"]')].map(line=>line.dataset.a+'|'+line.dataset.b);
  assert.deepEqual(neighbor,expected,`${focus.country}: neighbor links`);
  assert.deepEqual([...doc.querySelectorAll('#twins-list .twin-card')].map(card=>card.dataset.network),eligible);
}
(async()=>{
  window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.__testPaletteSimilarity=paletteSimilarity;window.__testColorStatistics=colorStatistics;window.__testClosestPalettes=closestPalettes;');
  await new Promise(resolve=>window.setTimeout(resolve,40));
  assert.deepEqual(errors,[]);
  const eligible=rows.filter(r=>mask(r));
  assert.equal(doc.querySelectorAll('#network-select option').length,eligible.length);
  assert.match($('palette-denominator').textContent,new RegExp(`${eligible.length}`));
  const statistics=window.__testColorStatistics(rows);
  for(const color of colorNames){
    const expected=eligible.filter(r=>mask(r)&(1<<colorNames.indexOf(color))).length;
    assert.equal(statistics.counts.find(c=>c.color===color).count,expected,`count of ${color}`);
    const bar=[...doc.querySelectorAll('#palette-bars li')].find(li=>li.querySelector('.stat-color').textContent.trim()===color);
    assert.ok(bar);assert.match(bar.querySelector('.stat-number').textContent,new RegExp(`^${expected}\\b`));
  }
  const groups=new Map();
  for(const row of eligible){const key=mask(row);groups.set(key,(groups.get(key)||0)+1);}
  assert.equal(statistics.combos.length,groups.size);
  for(const item of statistics.combos) assert.equal(item.count,groups.get(mask({colors:item.colors})),`complete palette ${item.colors}`);
  assert.equal(statistics.combos.reduce((sum,item)=>sum+item.count,0),eligible.length);
  const expectedCombos=[...groups].map(([key,count])=>({colors:colorNames.filter((_,i)=>key&(1<<i)),count})).sort((a,b)=>b.count-a.count||a.colors.join(',').localeCompare(b.colors.join(','))).slice(0,6);
  assert.deepEqual([...doc.querySelectorAll('.combo-card')].map(card=>({colors:card.dataset.colors.split(','),count:Number(card.querySelector('strong').textContent.match(/^\d+/)[0])})),expectedCombos);
  for(const focus of eligible){
    for(const other of eligible){const actual=window.__testPaletteSimilarity(focus,other);assert.ok(Math.abs(actual.score-expectedScore(focus,other))<1e-12,`${focus.country}/${other.country}`);}
    const expected=expectedMatches(focus).map(x=>x.row.country);
    assert.deepEqual(Array.from(window.__testClosestPalettes(rows,focus),x=>x.row.country),expected,`${focus.country}: ranked matches`);
  }
  assert.equal(window.__testPaletteSimilarity({colors:['red','blue']},{colors:['blue','green']}).score,1/3);
  assert.equal(window.__testPaletteSimilarity({colors:['red']},{colors:['green']}).score,0);
  assert.equal(window.__testPaletteSimilarity({colors:['red']},{colors:['red']}).score,1);
  assert.equal(window.__testPaletteSimilarity({colors:null},{colors:['red']}).score,0);
  assert.equal(window.__testPaletteSimilarity({colors:['unsupported']},{colors:['red']}).score,0);
  assert.equal(window.__testPaletteSimilarity({colors:[]},{colors:['red']}).score,0);
  assert.equal(window.__testPaletteSimilarity({colors:['red','red']},{colors:['red']}).score,1);
  for(const focus of eligible){$('network-select').value=focus.country;$('network-select').dispatchEvent(new window.Event('change',{bubbles:true}));checkGraph(focus);}
  const initial=eligible.find(row=>expectedMatches(row).length>0);$('network-select').value=initial.country;$('network-select').dispatchEvent(new window.Event('change',{bubbles:true}));
  const neighbor=doc.querySelector('#network-graph [data-network]'),neighborName=neighbor.dataset.network;neighbor.click();
  assert.equal($('network-select').value,neighborName);checkGraph(rows.find(r=>r.country===neighborName));
  $('network-details').click();assert.ok($('details').open);assert.match($('detail-content').textContent,new RegExp(neighborName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));$('close-dialog').click();
  const twin=doc.querySelector('#twins-list [data-network]'),twinName=twin.dataset.network;twin.click();
  assert.equal($('network-select').value,twinName);checkGraph(rows.find(r=>r.country===twinName));
  const combo=doc.querySelector('.combo-card'),colors=combo.dataset.colors.split(','),combinationMask=mask({colors});combo.click();
  assert.equal($('match').value,'exact');assert.equal(Number($('result-count').textContent),eligible.filter(row=>mask(row)===combinationMask).length);
  for(const color of colorNames) assert.equal(doc.querySelector(`[data-color="${color}"]`).getAttribute('aria-pressed'),String(colors.includes(color)));
  assert.match(doc.querySelector('.network-disclaimer').textContent,/not evidence of shared origin/);
  assert.deepEqual(errors,[]);
  console.log(`PASS: ${eligible.length} flags, ${eligible.length*eligible.length} pair scores, all ranked neighborhoods and graph links, all color counts and combinations, and palette/network interactions.`);
  window.close();
})().catch(e=>{console.error(e);process.exitCode=1;window.close();});
