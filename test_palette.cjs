// Run with: node test_palette.cjs /path/to/node_modules/jsdom
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require(process.argv[2]);
const root=__dirname;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data.json')));
const geography=JSON.parse(fs.readFileSync(path.join(root,'geography_m49.json'))).by_iso_alpha2;
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
const pendingFrames=new Map();let nextFrameId=0;
window.requestAnimationFrame=callback=>{const id=++nextFrameId;pendingFrames.set(id,callback);return id;};
window.cancelAnimationFrame=id=>pendingFrames.delete(id);
// An independent bitmask path is used for expected sets and scores.
function mask(row){if(!Array.isArray(row.colors)||!row.colors.length||row.colors.some(c=>!colorNames.includes(c)))return 0;return row.colors.reduce((m,c)=>m|(1<<colorNames.indexOf(c)),0);}
function bitCount(value){let count=0;while(value){value&=value-1;count++;}return count;}
function expectedScore(a,b){const union=mask(a)|mask(b);return union?bitCount(mask(a)&mask(b))/bitCount(union):0;}
function expectedMatches(focus,scope=rows){return scope.filter(row=>row.country!==focus.country&&mask(row)).map(row=>({row,score:expectedScore(focus,row)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.row.country.localeCompare(b.row.country)).slice(0,8);}
function checkGraph(focus){
  const nodes=[...doc.querySelectorAll('#network-graph .network-node')];
  assert.equal(nodes.length,rows.length);
  assert.deepEqual(nodes.filter(node=>node.classList.contains('selected')).map(node=>node.dataset.network),[focus.country]);
  assert.deepEqual([...doc.querySelectorAll('#network-graph .network-edge.highlighted')].map(line=>line.dataset.a+'|'+line.dataset.b),[...doc.querySelectorAll('#network-graph .network-edge')].filter(line=>line.dataset.a===focus.country||line.dataset.b===focus.country).map(line=>line.dataset.a+'|'+line.dataset.b));
  assert.deepEqual([...doc.querySelectorAll('#twins-list .twin-card')].map(card=>card.dataset.network),expectedMatches(focus).map(m=>m.row.country));
}
(async()=>{
  window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.__testPaletteSimilarity=paletteSimilarity;window.__testColorStatistics=colorStatistics;window.__testClosestPalettes=closestPalettes;window.__testBuildNetwork=buildNetwork;window.__testStepNetwork=stepNetwork;');
  await new Promise(resolve=>window.setTimeout(resolve,40));
  assert.deepEqual(errors,[]);
  assert.equal(pendingFrames.size,1,'initial layout schedules animation');
  const initialNode=doc.querySelector('#network-graph .network-node'),initialX=parseFloat(initialNode.style.left),initialY=parseFloat(initialNode.style.top);
  for(let i=0;i<8;i++){const [id,frame]=pendingFrames.entries().next().value;pendingFrames.delete(id);frame();}
  assert.ok(Math.hypot(parseFloat(initialNode.style.left)-initialX,parseFloat(initialNode.style.top)-initialY)>0,'animation frames move nodes');
  const eligible=rows.filter(r=>mask(r));
  assert.equal(doc.querySelectorAll('#network-select option').length,rows.length);
  const graphNodes=[...doc.querySelectorAll('#network-graph .network-node')];
  assert.deepEqual(graphNodes.map(node=>node.dataset.network).sort(),rows.map(row=>row.country).sort());
  function verifyEdges(mode,subset=rows){
    const actual=[...doc.querySelectorAll('#network-graph .network-edge')],expected=new Map();
    const score=(a,b)=>mode==='year'?(Number.isInteger(a.flag_origin_year)&&Number.isInteger(b.flag_origin_year)?1/(1+Math.abs(a.flag_origin_year-b.flag_origin_year)/50):0):expectedScore(a,b);
    for(const row of subset){
      const nearest=subset.filter(other=>other.country!==row.country).map(other=>({other,score:score(row,other)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.other.country.localeCompare(b.other.country)).slice(0,2);
      for(const item of nearest){const key=[row.country,item.other.country].sort().join('|');expected.set(key,item.score);}
    }
    assert.equal(actual.length,expected.size);
    const seen=new Set();
    for(const line of actual){const key=[line.dataset.a,line.dataset.b].sort().join('|');assert.ok(expected.has(key));assert.ok(!seen.has(key));seen.add(key);assert.ok(Math.abs(Number(line.dataset.score)-expected.get(key))<1e-12);}
  }
  verifyEdges('color');
  const synthetic=window.__testBuildNetwork([{country:'A',colors:['red'],flag_origin_year:1900},{country:'B',colors:['red'],flag_origin_year:1905},{country:'C',colors:['blue'],flag_origin_year:null},{country:'D',colors:null,flag_origin_year:2000}],'year');
  assert.equal(synthetic.nodes.length,4);assert.equal(synthetic.nodes.filter(node=>!node.known).length,1);assert.ok(synthetic.edges.every(edge=>synthetic.nodes[edge.a].known&&synthetic.nodes[edge.b].known));
  function averageDistance(graph,predicate){let total=0,count=0;for(let i=0;i<graph.nodes.length;i++)for(let j=i+1;j<graph.nodes.length;j++){const a=graph.nodes[i],b=graph.nodes[j];if(predicate(a.row,b.row)){total+=Math.hypot(a.x-b.x,a.y-b.y);count++;}}assert.ok(count);return total/count;}
  for(const mode of ['color','year']){
    const graph=window.__testBuildNetwork(rows,mode),before=graph.nodes.map(node=>[node.x,node.y]);
    for(let tick=0;tick<180;tick++)window.__testStepNetwork(graph,Math.max(.12,(180-tick)/180));
    assert.ok(graph.nodes.some((node,i)=>Math.hypot(node.x-before[i][0],node.y-before[i][1])>5),mode+' nodes should move');
    for(const node of graph.nodes)assert.ok(Number.isFinite(node.x)&&Number.isFinite(node.y)&&node.x>=26&&node.x<=1474&&node.y>=26&&node.y<=970,'valid layout coordinates');
    if(mode==='color')assert.ok(averageDistance(graph,(a,b)=>expectedScore(a,b)===1)<averageDistance(graph,(a,b)=>expectedScore(a,b)<.34),'identical palettes should cluster more closely on average');
    else {
      assert.ok(averageDistance(graph,(a,b)=>Number.isInteger(a.flag_origin_year)&&Number.isInteger(b.flag_origin_year)&&Math.abs(a.flag_origin_year-b.flag_origin_year)<=5)<averageDistance(graph,(a,b)=>Number.isInteger(a.flag_origin_year)&&Number.isInteger(b.flag_origin_year)&&Math.abs(a.flag_origin_year-b.flag_origin_year)>=100),'nearby dates should cluster more closely on average');
      const older=graph.nodes.filter(node=>node.known&&node.row.flag_origin_year<1800),newer=graph.nodes.filter(node=>node.known&&node.row.flag_origin_year>=1950);
      assert.ok(older.reduce((sum,node)=>sum+node.x,0)/older.length<newer.reduce((sum,node)=>sum+node.x,0)/newer.length,'older flags tend left');
    }
    if(process.argv[3]&&process.argv[4]){
      // Approximate standalone preview of the computed geometry, not a browser screenshot.
      const {createCanvas,Image}=require(process.argv[3]),canvas=createCanvas(graph.width,graph.height),ctx=canvas.getContext('2d');
      ctx.fillStyle='#edf3ea';ctx.fillRect(0,0,graph.width,graph.height);
      ctx.strokeStyle='rgba(75,126,98,.32)';ctx.lineWidth=1.2;
      for(const edge of graph.edges){const a=graph.nodes[edge.a],b=graph.nodes[edge.b];ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
      if(graph.unknown){ctx.strokeStyle='#91aa9a';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(55,845);ctx.lineTo(1445,845);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#6e8476';ctx.font='bold 12px sans-serif';ctx.fillText(mode==='year'?'ORIGIN YEAR UNKNOWN':'COLOR DATA UNAVAILABLE',55,864);}
      for(const node of graph.nodes){const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=fs.readFileSync(path.join(root,node.row.image));});ctx.save();ctx.beginPath();ctx.arc(node.x,node.y,20,0,Math.PI*2);ctx.clip();ctx.drawImage(img,node.x-20,node.y-20,40,40);ctx.restore();ctx.strokeStyle='#fffef8';ctx.lineWidth=2;ctx.beginPath();ctx.arc(node.x,node.y,20,0,Math.PI*2);ctx.stroke();}
      fs.writeFileSync(process.argv[4]+'-'+mode+'.png',canvas.toBuffer('image/png'));
    }
  }
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
  $('network-mode').value='year';$('network-mode').dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(doc.querySelectorAll('#network-graph .network-node').length,rows.length);verifyEdges('year');
  const undated=rows.filter(row=>!Number.isInteger(row.flag_origin_year));
  assert.equal(doc.querySelectorAll('#network-graph .network-node.unavailable').length,undated.length);
  for(const row of undated)assert.ok(![...doc.querySelectorAll('#network-graph .network-edge')].some(line=>line.dataset.a===row.country||line.dataset.b===row.country));
  $('network-select').value=undated[0].country;$('network-select').dispatchEvent(new window.Event('change',{bubbles:true}));assert.match($('twins-list').textContent,/No comparable origin year/);
  const dated=rows.find(row=>Number.isInteger(row.flag_origin_year));$('network-select').value=dated.country;$('network-select').dispatchEvent(new window.Event('change',{bubbles:true}));
  const expectedYears=rows.filter(row=>row.country!==dated.country&&Number.isInteger(row.flag_origin_year)).sort((a,b)=>Math.abs(a.flag_origin_year-dated.flag_origin_year)-Math.abs(b.flag_origin_year-dated.flag_origin_year)||a.country.localeCompare(b.country)).slice(0,8);
  assert.deepEqual([...doc.querySelectorAll('#twins-list .twin-card')].map(card=>card.dataset.network),expectedYears.map(row=>row.country));
  $('network-zoom-in').click();assert.equal($('network-zoom-label').textContent,'90%');$('network-zoom-out').click();assert.equal($('network-zoom-label').textContent,'75%');
  $('network-mode').value='color';$('network-mode').dispatchEvent(new window.Event('change',{bubbles:true}));verifyEdges('color');
  const dragged=doc.querySelector('#network-graph .network-node'),leftBefore=parseFloat(dragged.style.left),topBefore=parseFloat(dragged.style.top);
  dragged.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100}));
  dragged.dispatchEvent(new window.MouseEvent('pointermove',{bubbles:true,clientX:390,clientY:280}));
  assert.ok(Math.abs(parseFloat(dragged.style.left)-leftBefore)>5||Math.abs(parseFloat(dragged.style.top)-topBefore)>5,'dragging moves a node');
  dragged.dispatchEvent(new window.MouseEvent('pointerup',{bubbles:true,clientX:390,clientY:280}));
  await new Promise(resolve=>window.setTimeout(resolve,5));
  const initial=eligible.find(row=>expectedMatches(row).length>0);$('network-select').value=initial.country;$('network-select').dispatchEvent(new window.Event('change',{bubbles:true}));
  const neighbor=[...doc.querySelectorAll('#network-graph [data-network]')].find(node=>node.dataset.network!==initial.country),neighborName=neighbor.dataset.network;neighbor.click();
  assert.equal($('network-select').value,neighborName);checkGraph(rows.find(r=>r.country===neighborName));
  const hovered=[...doc.querySelectorAll('#network-graph [data-network]')].find(node=>node.dataset.network!==neighborName),hoverName=hovered.dataset.network;
  hovered.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true}));
  const direct=[...doc.querySelectorAll('#network-graph .network-edge')].filter(line=>line.dataset.a===hoverName||line.dataset.b===hoverName);
  const directNames=new Set(direct.map(line=>line.dataset.a===hoverName?line.dataset.b:line.dataset.a));
  assert.deepEqual([...doc.querySelectorAll('#network-graph .network-node.neighbor')].map(node=>node.dataset.network).sort(),[...directNames].sort());
  assert.equal(doc.querySelectorAll('#network-graph .network-edge.highlighted').length,direct.length);
  hovered.dispatchEvent(new window.MouseEvent('pointerout',{bubbles:true}));checkGraph(rows.find(r=>r.country===neighborName));
  const allEdges=[...doc.querySelectorAll('#network-graph .network-edge')];
  for(const node of doc.querySelectorAll('#network-graph .network-node')){
    const name=node.dataset.network,expected=allEdges.filter(edge=>edge.dataset.a===name||edge.dataset.b===name);
    node.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true}));
    const got=[...doc.querySelectorAll('#network-graph .network-edge.highlighted')];
    assert.deepEqual(got,expected,name+' hover highlights exactly its direct links');
    const expectedNeighbors=new Set(expected.map(edge=>edge.dataset.a===name?edge.dataset.b:edge.dataset.a));
    assert.deepEqual([...doc.querySelectorAll('#network-graph .network-node.neighbor')].map(item=>item.dataset.network).sort(),[...expectedNeighbors].sort(),name+' hover neighbors');
  }
  hovered.dispatchEvent(new window.FocusEvent('focusin',{bubbles:true}));assert.equal(doc.querySelector('.highlight-target').dataset.network,hoverName);
  hovered.dispatchEvent(new window.FocusEvent('focusout',{bubbles:true}));checkGraph(rows.find(r=>r.country===neighborName));
  $('network-links').value='all';$('network-links').dispatchEvent(new window.Event('change',{bubbles:true}));assert.ok($('network-graph').classList.contains('show-all-links'));
  $('network-links').value='focus';$('network-links').dispatchEvent(new window.Event('change',{bubbles:true}));assert.ok(!$('network-graph').classList.contains('show-all-links'));
  $('network-details').click();assert.ok($('details').open);assert.match($('detail-content').textContent,new RegExp(neighborName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));$('close-dialog').click();
  const twin=doc.querySelector('#twins-list [data-network]'),twinName=twin.dataset.network;twin.click();
  assert.equal($('network-select').value,twinName);checkGraph(rows.find(r=>r.country===twinName));
  const regions=[...$('network-region').options].map(option=>option.value);
  for(const region of regions){
    $('network-region').value=region;$('network-region').dispatchEvent(new window.Event('change',{bubbles:true}));
    const subset=rows.filter(row=>region==='all'||(region==='unclassified'?!geography[row.iso_alpha2]:geography[row.iso_alpha2]?.region===region));
    assert.deepEqual([...doc.querySelectorAll('#network-graph .network-node')].map(node=>node.dataset.network).sort(),subset.map(row=>row.country).sort(),region);
    verifyEdges('color',subset);
    const subregions=[...$('network-subregion').options].map(option=>option.value);
    for(const sub of subregions.filter(value=>value!=='all')){
      $('network-subregion').value=sub;$('network-subregion').dispatchEvent(new window.Event('change',{bubbles:true}));
      const narrowed=subset.filter(row=>geography[row.iso_alpha2]?.subregion===sub);
      assert.deepEqual([...doc.querySelectorAll('#network-graph .network-node')].map(node=>node.dataset.network).sort(),narrowed.map(row=>row.country).sort(),region+' / '+sub);
      verifyEdges('color',narrowed);
      const focus=narrowed.find(row=>row.country===$('network-select').value);
      assert.deepEqual([...doc.querySelectorAll('#twins-list .twin-card')].map(card=>card.dataset.network),expectedMatches(focus,narrowed).map(match=>match.row.country));
    }
  }
  $('network-region').value='Asia';$('network-region').dispatchEvent(new window.Event('change',{bubbles:true}));
  $('network-subregion').value='Eastern Asia';$('network-subregion').dispatchEvent(new window.Event('change',{bubbles:true}));
  $('network-mode').value='year';$('network-mode').dispatchEvent(new window.Event('change',{bubbles:true}));
  const eastAsia=rows.filter(row=>geography[row.iso_alpha2]?.region==='Asia'&&geography[row.iso_alpha2]?.subregion==='Eastern Asia');
  assert.deepEqual([...doc.querySelectorAll('#network-graph .network-node')].map(node=>node.dataset.network).sort(),eastAsia.map(row=>row.country).sort());verifyEdges('year',eastAsia);
  $('network-mode').value='color';$('network-mode').dispatchEvent(new window.Event('change',{bubbles:true}));
  $('network-region').value='all';$('network-region').dispatchEvent(new window.Event('change',{bubbles:true}));
  const combo=doc.querySelector('.combo-card'),colors=combo.dataset.colors.split(','),combinationMask=mask({colors});combo.click();
  assert.equal($('match').value,'exact');assert.equal(Number($('result-count').textContent),eligible.filter(row=>mask(row)===combinationMask).length);
  for(const color of colorNames) assert.equal(doc.querySelector(`[data-color="${color}"]`).getAttribute('aria-pressed'),String(colors.includes(color)));
  assert.match(doc.querySelector('.network-disclaimer').textContent,/not evidence of shared origin/);
  assert.deepEqual(errors,[]);
  const fallback=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only',beforeParse(w){
    w.fetch=async file=>file==='geography_m49.json'?{ok:false}:{ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))};
    w.console.warn=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  }});
  fallback.window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));await new Promise(resolve=>fallback.window.setTimeout(resolve,35));
  assert.match(fallback.window.document.querySelector('.network-geography-note').textContent,/unavailable/);
  assert.equal(fallback.window.document.querySelectorAll('#network-graph .network-node').length,rows.length);
  assert.ok([...fallback.window.document.querySelectorAll('#network-region option')].some(option=>option.value==='unclassified'));fallback.window.close();
  console.log(`PASS: ${rows.length} moving flag nodes, color and year links, simulated grouping, unknown years, zoom, ${eligible.length*eligible.length} color scores, ranked neighbors and interactions.`);
  window.close();
})().catch(e=>{console.error(e);process.exitCode=1;window.close();});
