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
  const nodes=[...doc.querySelectorAll('#network-graph .network-node')];
  assert.equal(nodes.length,rows.length);
  assert.deepEqual(nodes.filter(node=>node.classList.contains('selected')).map(node=>node.dataset.network),[focus.country]);
  assert.deepEqual([...doc.querySelectorAll('#network-graph .network-edge.selected')].map(line=>line.dataset.a+'|'+line.dataset.b),[...doc.querySelectorAll('#network-graph .network-edge')].filter(line=>line.dataset.a===focus.country||line.dataset.b===focus.country).map(line=>line.dataset.a+'|'+line.dataset.b));
  assert.deepEqual([...doc.querySelectorAll('#twins-list .twin-card')].map(card=>card.dataset.network),expectedMatches(focus).map(m=>m.row.country));
}
(async()=>{
  window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.__testPaletteSimilarity=paletteSimilarity;window.__testColorStatistics=colorStatistics;window.__testClosestPalettes=closestPalettes;window.__testBuildNetwork=buildNetwork;');
  await new Promise(resolve=>window.setTimeout(resolve,40));
  assert.deepEqual(errors,[]);
  const eligible=rows.filter(r=>mask(r));
  assert.equal(doc.querySelectorAll('#network-select option').length,rows.length);
  const graphNodes=[...doc.querySelectorAll('#network-graph .network-node')];
  assert.deepEqual(graphNodes.map(node=>node.dataset.network).sort(),rows.map(row=>row.country).sort());
  const positions=graphNodes.map(node=>[parseFloat(node.style.left),parseFloat(node.style.top)]);
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)assert.ok(Math.abs(positions[i][0]-positions[j][0])>=96||Math.abs(positions[i][1]-positions[j][1])>=68,'network flag nodes must not overlap');
  // Kruskal's algorithm is independent of the app's Prim implementation.
  const possible=[];
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const score=expectedScore(rows[i],rows[j]);if(score>0)possible.push({i,j,score});}
  possible.sort((a,b)=>b.score-a.score);
  const parent=rows.map((_,i)=>i),rootOf=i=>{while(parent[i]!==i)i=parent[i];return i;};
  let expectedTotal=0,expectedEdges=0;
  for(const edge of possible){const a=rootOf(edge.i),b=rootOf(edge.j);if(a!==b){parent[a]=b;expectedTotal+=edge.score;expectedEdges++;}}
  const byName=new Map(rows.map(row=>[row.country,row])),actualEdges=[...doc.querySelectorAll('#network-graph .network-edge')];
  assert.equal(actualEdges.length,expectedEdges);
  let actualTotal=0;const pairs=new Set(),actualParent=new Map(rows.map(row=>[row.country,row.country]));
  function actualRoot(name){while(actualParent.get(name)!==name)name=actualParent.get(name);return name;}
  for(const line of actualEdges){const a=byName.get(line.dataset.a),b=byName.get(line.dataset.b),score=expectedScore(a,b);assert.ok(score>0);assert.equal(Number(line.dataset.score),score);const key=[a.country,b.country].sort().join('|');assert.ok(!pairs.has(key));pairs.add(key);const rootA=actualRoot(a.country),rootB=actualRoot(b.country);assert.notEqual(rootA,rootB,'network must not contain a cycle');actualParent.set(rootA,rootB);actualTotal+=score;}
  assert.ok(Math.abs(actualTotal-expectedTotal)<1e-8,'network must have maximum possible total similarity');
  const synthetic=window.__testBuildNetwork([{country:'A',colors:['red']},{country:'B',colors:['red']},{country:'C',colors:['blue']},{country:'D',colors:null}]);
  assert.equal(synthetic.rows.length,4);assert.equal(synthetic.edges.length,1);
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
  const neighbor=[...doc.querySelectorAll('#network-graph [data-network]')].find(node=>node.dataset.network!==initial.country),neighborName=neighbor.dataset.network;neighbor.click();
  assert.equal($('network-select').value,neighborName);checkGraph(rows.find(r=>r.country===neighborName));
  $('network-details').click();assert.ok($('details').open);assert.match($('detail-content').textContent,new RegExp(neighborName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));$('close-dialog').click();
  const twin=doc.querySelector('#twins-list [data-network]'),twinName=twin.dataset.network;twin.click();
  assert.equal($('network-select').value,twinName);checkGraph(rows.find(r=>r.country===twinName));
  const combo=doc.querySelector('.combo-card'),colors=combo.dataset.colors.split(','),combinationMask=mask({colors});combo.click();
  assert.equal($('match').value,'exact');assert.equal(Number($('result-count').textContent),eligible.filter(row=>mask(row)===combinationMask).length);
  for(const color of colorNames) assert.equal(doc.querySelector(`[data-color="${color}"]`).getAttribute('aria-pressed'),String(colors.includes(color)));
  assert.match(doc.querySelector('.network-disclaimer').textContent,/not evidence of shared origin/);
  assert.deepEqual(errors,[]);
  console.log(`PASS: ${rows.length} network nodes, ${actualEdges.length} maximum-similarity links, ${eligible.length*eligible.length} pair scores, ranked twins, color counts and interactions.`);
  window.close();
})().catch(e=>{console.error(e);process.exitCode=1;window.close();});
