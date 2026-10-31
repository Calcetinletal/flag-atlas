'use strict';

const palette = {red:'#d95145',blue:'#366d9c',green:'#418365',yellow:'#e2c253',black:'#25353a',white:'#fff',orange:'#ed8952',purple:'#865e90',brown:'#835d43'};
const periods = [
  {id:'before1800', label:'<1800', test:y=>y<1800},
  {id:'1800', label:'1800s', test:y=>y>=1800&&y<1900},
  {id:'1900', label:'1900–49', test:y=>y>=1900&&y<1950},
  {id:'1950', label:'1950–99', test:y=>y>=1950&&y<2000},
  {id:'2000', label:'2000+', test:y=>y>=2000}
];
const $ = id => document.getElementById(id);
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL = s => { try { const u = new URL(s); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const state = {rows:[], accounts:{}, curated:{}, milestones:{}, selected:new Set(), limit:24, score:0, rounds:0, pair:[], answered:false};
const yearText = row => row.flag_origin_year == null ? 'Unknown' : (row.origin_basis.includes('approximate') ? 'c. ' : '') + row.flag_origin_year;
const scopeText = scope => scope === 'UN member' ? 'UN member' : scope.replace('Additional ', '');
const imageHTML = row => row.image ? `<img src="${escapeHTML(row.image)}" alt="" loading="lazy">` : '<span class="missing-flag">ILLUSTRATION<br>UNAVAILABLE</span>';
const dotsHTML = colors => (colors || []).map(c => `<span class="dot" style="background:${palette[c]}" title="${c}"></span>`).join('');

function initColors(){
  $('colors').innerHTML = Object.entries(palette).map(([name,color]) => `<button type="button" class="color-option" data-color="${name}" aria-pressed="false"><span class="swatch" style="--swatch:${color}"></span>${name}</button>`).join('');
  $('colors').addEventListener('click', event => {
    const button = event.target.closest('[data-color]'); if(!button) return;
    const color = button.dataset.color;
    state.selected.has(color) ? state.selected.delete(color) : state.selected.add(color);
    button.setAttribute('aria-pressed', String(state.selected.has(color)));
    $('color-count').textContent = `${state.selected.size} selected`;
    state.limit = 24; render();
  });
}

function filteredRows(){
  const query = $('search').value.trim().toLocaleLowerCase();
  const era = $('era').value, scope = $('scope').value, mode = $('match').value;
  return state.rows.filter(row => {
    if(query && !row.country.toLocaleLowerCase().includes(query)) return false;
    if(scope === 'UN member' && row.scope !== scope) return false;
    if(scope === 'other' && row.scope === 'UN member') return false;
    if(era === 'unknown' && row.flag_origin_year !== null) return false;
    if(era !== 'all' && era !== 'unknown' && (row.flag_origin_year === null || !periods.find(p=>p.id===era).test(row.flag_origin_year))) return false;
    if(state.selected.size){
      if(!row.colors) return false;
      const colors = new Set(row.colors), selected = [...state.selected];
      if(mode === 'any' && !selected.some(c=>colors.has(c))) return false;
      if(mode !== 'any' && !selected.every(c=>colors.has(c))) return false;
      if(mode === 'exact' && colors.size !== state.selected.size) return false;
    }
    return true;
  });
}

function render(){
  const rows = filteredRows();
  const sort = $('sort').value;
  rows.sort((a,b) => sort === 'name' ? a.country.localeCompare(b.country) : (a.flag_origin_year === null ? 1 : b.flag_origin_year === null ? -1 : (sort === 'oldest' ? a.flag_origin_year-b.flag_origin_year : b.flag_origin_year-a.flag_origin_year)) || a.country.localeCompare(b.country));
  $('result-count').textContent = rows.length;
  const counts = periods.map(p => rows.filter(r=>r.flag_origin_year !== null && p.test(r.flag_origin_year)).length);
  const max = Math.max(1,...counts);
  $('timeline').innerHTML = periods.map((p,i) => { const h = Math.round(counts[i]/max*68); return `<button class="bar-wrap ${$('era').value===p.id?'active':''}" data-period="${p.id}" title="${p.label}: ${counts[i]}" aria-label="${p.label}: ${counts[i]} flags. Filter this period."><span class="bar-value" style="--height:${h}px">${counts[i]}</span><span class="bar" style="height:${h}px"></span><span class="bar-label">${p.label}</span></button>`; }).join('');
  const cards = rows.slice(0,state.limit);
  $('cards').innerHTML = cards.map(row=>`<button class="card" type="button" data-country="${escapeHTML(row.country)}" aria-label="Explore ${escapeHTML(row.country)}"><span class="flag-frame">${imageHTML(row)}</span><span class="card-top"><span class="card-name">${escapeHTML(row.country)}</span><span class="card-year">${yearText(row)}</span></span><span class="card-type">${escapeHTML(scopeText(row.scope))}</span><span class="dots">${dotsHTML(row.colors)}</span></button>`).join('');
  $('empty').hidden = rows.length !== 0;
  $('more').hidden = rows.length <= state.limit;
}

function reset(){
  $('search').value = ''; $('era').value = 'all'; $('scope').value = 'all'; $('match').value = 'all'; $('sort').value = 'name';
  state.selected.clear(); state.limit=24; $('color-count').textContent='0 selected';
  document.querySelectorAll('.color-option').forEach(b=>b.setAttribute('aria-pressed','false'));
  render();
}

// Color sets are derived from the displayed illustrations, not official color lists.
const NETWORK_LIMIT=8;
function detectedColors(row){
  if(!Array.isArray(row.colors) || !row.colors.length || row.colors.some(c=>!Object.hasOwn(palette,c))) return [];
  return [...new Set(row.colors)].sort((a,b)=>Object.keys(palette).indexOf(a)-Object.keys(palette).indexOf(b));
}
function paletteSimilarity(a,b){
  const left=new Set(detectedColors(a)),right=new Set(detectedColors(b));
  const shared=[...left].filter(color=>right.has(color));
  const union=new Set([...left,...right]).size;
  return {shared,score:union?shared.length/union:0};
}
function closestPalettes(rows,focus){
  if(!detectedColors(focus).length) return [];
  return rows.filter(row=>row.country!==focus.country && detectedColors(row).length).map(row=>({row,...paletteSimilarity(focus,row)})).filter(item=>item.shared.length>0).sort((a,b)=>b.score-a.score || a.row.country.localeCompare(b.row.country)).slice(0,NETWORK_LIMIT);
}
function colorStatistics(rows){
  const eligible=rows.filter(row=>detectedColors(row).length);
  const counts=Object.keys(palette).map(color=>({color,count:eligible.filter(row=>detectedColors(row).includes(color)).length})).sort((a,b)=>b.count-a.count || a.color.localeCompare(b.color));
  const grouped=new Map();
  for(const row of eligible){
    const colors=detectedColors(row),key=colors.join(',');
    if(!grouped.has(key)) grouped.set(key,{colors,count:0});
    grouped.get(key).count++;
  }
  const combos=[...grouped.values()].sort((a,b)=>b.count-a.count || a.colors.join(',').localeCompare(b.colors.join(',')));
  return {eligible,counts,combos};
}
function renderPaletteStats(){
  const {eligible,counts,combos}=colorStatistics(state.rows),total=eligible.length;
  $('palette-denominator').textContent=`Across ${total} flags with classified illustrations.`;
  $('palette-bars').innerHTML=counts.map(({color,count})=>{
    const pct=total?count/total*100:0;
    return `<li><span class="stat-color"><i style="--swatch:${palette[color]}"></i>${color}</span><span class="stat-track"><span style="width:${pct.toFixed(3)}%;background:${palette[color]}"></span></span><span class="stat-number">${count} <small>${pct.toFixed(1)}%</small></span></li>`;
  }).join('');
  $('palette-combos').innerHTML=combos.slice(0,6).map(item=>`<button type="button" class="combo-card" data-colors="${escapeHTML(item.colors.join(','))}" aria-label="Show ${item.count} flags whose detected colors are ${escapeHTML(item.colors.join(', '))}"><span class="combo-swatches">${item.colors.map(c=>`<i style="--swatch:${palette[c]}"></i>`).join('')}</span><span class="combo-names">${escapeHTML(item.colors.join(' · '))}</span><strong>${item.count}<small> flags</small></strong></button>`).join('') || '<p>No color data is available.</p>';
}
// Links represent each node's two closest matches; the force layout uses all
// valid pair scores, so omitted links still influence proximity.
const NETWORK_WIDTH=1500, NETWORK_HEIGHT=1000, NETWORK_NEIGHBORS=2;
function networkScore(a,b,mode){
  if(mode==='year'){
    if(!Number.isInteger(a.flag_origin_year) || !Number.isInteger(b.flag_origin_year)) return 0;
    return 1/(1+Math.abs(a.flag_origin_year-b.flag_origin_year)/50);
  }
  return paletteSimilarity(a,b).score;
}
function buildNetwork(rows,mode='color',previous=null){
  const ordered=rows.slice().sort((a,b)=>a.country.localeCompare(b.country)),n=ordered.length;
  const known=row=>mode==='year'?Number.isInteger(row.flag_origin_year):detectedColors(row).length>0;
  const scores=ordered.map((row,i)=>ordered.map((other,j)=>i===j?0:networkScore(row,other,mode)));
  const unknown=ordered.filter(row=>!known(row)).length;
  let missingIndex=0;
  const nodes=ordered.map((row,i)=>{
    const valid=known(row),angle=i*2.3999632297,radius=45+15*Math.sqrt(i),old=previous?.get(row.country);
    const missing=valid?-1:missingIndex++;
    return {row,known:valid,x:valid?(old?.x??NETWORK_WIDTH/2+radius*Math.cos(angle)):95+(missing+.5)*(NETWORK_WIDTH-190)/Math.max(1,unknown),y:valid?Math.min(790,old?.y??400+radius*Math.sin(angle)):910,vx:0,vy:0};
  });
  const pairs=new Set(),edges=[];
  for(let i=0;i<n;i++){
    const nearest=ordered.map((row,j)=>({j,score:scores[i][j],name:row.country})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,NETWORK_NEIGHBORS);
    for(const item of nearest){const a=Math.min(i,item.j),b=Math.max(i,item.j),key=a+':'+b;if(!pairs.has(key)){pairs.add(key);edges.push({a,b,score:item.score});}}
  }
  const years=ordered.map(row=>row.flag_origin_year).filter(Number.isInteger);
  return {mode,rows:ordered,nodes,scores,edges,width:NETWORK_WIDTH,height:NETWORK_HEIGHT,unknown,yearMin:years.length?Math.min(...years):null,yearMax:years.length?Math.max(...years):null};
}
function stepNetwork(graph,alpha=1){
  const nodes=graph.nodes,n=nodes.length;
  for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
    const a=nodes[i],b=nodes[j];
    if(!a.known || !b.known) continue;
    let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d<.001){dx=(i%2?1:-1)*.01;dy=(j%2?1:-1)*.01;d=Math.hypot(dx,dy);}
    const desired=graph.mode==='year'?44+Math.min(Math.abs(a.row.flag_origin_year-b.row.flag_origin_year),400)*1.4:44+(1-graph.scores[i][j])*750;
    const spring=(d-desired)*.00015*alpha;
    const collision=d<46?(46-d)*.18:0;
    const force=spring-collision,fx=dx/d*force,fy=dy/d*force;
    if(!a.dragging){a.vx+=fx;a.vy+=fy;} if(!b.dragging){b.vx-=fx;b.vy-=fy;}
  }
  for(const node of nodes){
    if(!node.known || node.dragging) continue;
    node.vx+=(NETWORK_WIDTH/2-node.x)*.00035*alpha;
    node.vy+=(410-node.y)*.00035*alpha;
    if(graph.mode==='year'){
      const target=80+(node.row.flag_origin_year-graph.yearMin)/Math.max(1,graph.yearMax-graph.yearMin)*(NETWORK_WIDTH-160);
      node.vx+=(target-node.x)*.009*alpha;
    }
    node.vx=Math.max(-7,Math.min(7,node.vx*.86));node.vy=Math.max(-7,Math.min(7,node.vy*.86));
    node.x=Math.max(26,Math.min(NETWORK_WIDTH-26,node.x+node.vx));
    node.y=Math.max(26,Math.min(810,node.y+node.vy));
  }
}
function drawNetwork(){
  const graph=state.network;if(!graph) return;
  graph.nodes.forEach((node,i)=>{const el=graph.nodeElements[i];el.style.left=node.x.toFixed(2)+'px';el.style.top=node.y.toFixed(2)+'px';});
  graph.edges.forEach((edge,i)=>{const line=graph.edgeElements[i],a=graph.nodes[edge.a],b=graph.nodes[edge.b];line.setAttribute('x1',a.x.toFixed(2));line.setAttribute('y1',a.y.toFixed(2));line.setAttribute('x2',b.x.toFixed(2));line.setAttribute('y2',b.y.toFixed(2));});
}
function animateNetwork(){
  const graph=state.network;if(!graph) return;
  graph.frames=180;
  if(graph.frameHandle) return;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(reduced || !window.requestAnimationFrame){for(let i=0;i<60;i++)stepNetwork(graph,1-i/75);drawNetwork();graph.frames=0;return;}
  function frame(){
    if(state.network!==graph){graph.frameHandle=null;return;}
    const alpha=Math.max(.12,graph.frames/180);
    stepNetwork(graph,alpha);drawNetwork();graph.frames--;
    graph.frameHandle=graph.frames>0?window.requestAnimationFrame(frame):null;
  }
  graph.frameHandle=window.requestAnimationFrame(frame);
}
function setNetworkZoom(value){
  const graph=state.network;if(!graph)return;
  state.networkZoom=Math.max(.5,Math.min(1.5,value));
  $('network-stage').style.width=(graph.width*state.networkZoom)+'px';
  $('network-stage').style.height=(graph.height*state.networkZoom)+'px';
  $('network-graph').style.transform='scale('+state.networkZoom+')';
  $('network-zoom-label').textContent=Math.round(state.networkZoom*100)+'%';
}
function networkGeography(row){
  return state.geography?.[row.iso_alpha2] || null;
}
function initNetworkRegions(){
  const regions=[...new Set(state.rows.map(row=>networkGeography(row)?.region).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  $('network-region').innerHTML='<option value="all">All regions</option>'+regions.map(region=>'<option value="'+escapeHTML(region)+'">'+escapeHTML(region)+'</option>').join('')+(state.rows.some(row=>!networkGeography(row))?'<option value="unclassified">Unclassified</option>':'');
  updateNetworkSubregions();
}
function updateNetworkSubregions(){
  const region=$('network-region').value,select=$('network-subregion');
  const subs=[...new Set(state.rows.map(networkGeography).filter(geo=>geo&&(region==='all'||geo.region===region)).map(geo=>geo.subregion).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  select.innerHTML='<option value="all">All subregions</option>'+subs.map(sub=>'<option value="'+escapeHTML(sub)+'">'+escapeHTML(sub)+'</option>').join('');
  select.disabled=region==='unclassified'||!subs.length;
}
function networkRows(){
  const region=$('network-region').value,subregion=$('network-subregion').value;
  return state.rows.filter(row=>{
    const geo=networkGeography(row);
    return (region==='all'||(region==='unclassified'?!geo:geo?.region===region))&&(subregion==='all'||geo?.subregion===subregion);
  });
}
function initNetwork(){
  initNetworkRegions();state.networkZoom=.75;state.networkPinned=null;
  createNetwork('color');
  if(window.IntersectionObserver){
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))animateNetwork();},{threshold:.15});
    observer.observe(document.querySelector('.network-scroll'));
  }
}
function createNetwork(mode){
  const previous=state.network?new Map(state.network.nodes.map(node=>[node.row.country,node])):null;
  if(state.network?.frameHandle && window.cancelAnimationFrame)window.cancelAnimationFrame(state.network.frameHandle);
  const rows=networkRows(),graph=buildNetwork(rows,mode,previous);state.network=graph;
  const select=$('network-select'),prior=select.value;
  select.innerHTML=graph.rows.map(row=>'<option value="'+escapeHTML(row.country)+'">'+escapeHTML(row.country)+'</option>').join('');
  select.disabled=!graph.rows.length;
  if(!graph.rows.some(row=>row.country===prior))state.networkPinned=null;
  select.value=graph.rows.some(row=>row.country===prior)?prior:(graph.rows[0]?.country||'');
  const container=$('network-graph');
  if(!graph.rows.length){container.innerHTML='<p class="network-empty">No flags match this region.</p>';$('network-count').textContent='0 flags';$('twins-list').innerHTML='';return;}
  container.style.width=graph.width+'px';container.style.height=graph.height+'px';
  const lines=graph.edges.map(edge=>'<line class="network-edge" data-a="'+escapeHTML(graph.rows[edge.a].country)+'" data-b="'+escapeHTML(graph.rows[edge.b].country)+'" data-score="'+edge.score+'"/>').join('');
  const nodes=graph.nodes.map(node=>'<button type="button" class="network-node'+(node.known?'':' unavailable')+'" data-network="'+escapeHTML(node.row.country)+'" title="'+escapeHTML(node.row.country+' · origin '+yearText(node.row)+' · colors: '+(detectedColors(node.row).join(', ')||'unavailable'))+'" aria-label="Explore '+escapeHTML(node.row.country)+', origin '+escapeHTML(yearText(node.row))+'" aria-pressed="false"><span class="network-flag">'+imageHTML(node.row)+'</span><span class="network-name">'+escapeHTML(node.row.country)+'</span></button>').join('');
  container.innerHTML='<svg class="network-lines" viewBox="0 0 '+graph.width+' '+graph.height+'" aria-hidden="true">'+lines+'</svg>'+(graph.unknown?'<div class="network-unknown-label">'+(mode==='year'?'ORIGIN YEAR UNKNOWN':'COLOR DATA UNAVAILABLE')+' · '+graph.unknown+'</div>':'')+nodes;
  graph.nodeElements=[...container.querySelectorAll('.network-node')];graph.edgeElements=[...container.querySelectorAll('.network-edge')];
  setNetworkZoom(state.networkZoom);drawNetwork();renderNetwork();highlightNetwork(state.networkPinned);animateNetwork();
}
function renderNetwork(){
  const graph=state.network,focus=graph?.rows.find(row=>row.country===$('network-select').value);
  if(!focus||!graph)return;
  const mode=graph.mode;
  const matches=mode==='color'?closestPalettes(graph.rows,focus):(!Number.isInteger(focus.flag_origin_year)?[]:graph.rows.filter(row=>row.country!==focus.country&&Number.isInteger(row.flag_origin_year)).map(row=>({row,difference:Math.abs(row.flag_origin_year-focus.flag_origin_year)})).sort((a,b)=>a.difference-b.difference||a.row.country.localeCompare(b.row.country)).slice(0,NETWORK_LIMIT));
  $('network-title').textContent=mode==='year'?'A network of origin years':'A network of flag colors';
  $('network-count').textContent=graph.rows.length+' flags · '+graph.edges.length+' links';
  $('network-method').textContent=mode==='year'?'Closer recorded origin years pull together; the layout also favors older flags to the left. Pairwise gaps above 400 years are capped; unknown years appear separately.':'Color similarity uses shared detected colors divided by all detected colors in both flags.';
  $('twins-explainer').textContent=mode==='year'?'Ranked by the absolute difference in recorded origin years.':'Score = shared colors ÷ all distinct colors across both flags.';
  graph.nodeElements.forEach(node=>{const selected=node.dataset.network===focus.country;node.classList.toggle('selected',selected);node.setAttribute('aria-pressed',String(selected));});
  $('twins-list').innerHTML=matches.map(m=>'<button type="button" class="twin-card" data-network="'+escapeHTML(m.row.country)+'"><span class="twin-flag">'+imageHTML(m.row)+'</span><span class="twin-copy"><strong>'+escapeHTML(m.row.country)+'</strong><small>Origin: '+yearText(m.row)+'</small><span>'+(mode==='year'?'Recorded origin':'Shared: '+escapeHTML(m.shared.join(', ')))+'</span></span><b>'+(mode==='year'?m.difference+'<small> yr</small>':Math.round(m.score*100)+'<small>%</small>')+'</b></button>').join('') || '<p>No comparable '+(mode==='year'?'origin year':'detected colors')+' available for this flag.</p>';
}
function highlightNetwork(name){
  const graph=state.network;if(!graph?.nodeElements)return;
  const neighbors=new Set();
  graph.edgeElements.forEach(line=>{
    const active=!!name&&(line.dataset.a===name||line.dataset.b===name);
    line.classList.toggle('highlighted',active);
    if(active)neighbors.add(line.dataset.a===name?line.dataset.b:line.dataset.a);
  });
  graph.nodeElements.forEach(node=>{node.classList.toggle('neighbor',neighbors.has(node.dataset.network));node.classList.toggle('highlight-target',node.dataset.network===name);});
  $('network-graph').classList.toggle('has-highlight',!!name);
}
function initNetworkHighlight(){
  const container=$('network-graph');
  container.addEventListener('pointerover',event=>{const node=event.target.closest('[data-network]');if(node)highlightNetwork(node.dataset.network);});
  container.addEventListener('pointerout',event=>{const node=event.target.closest('[data-network]');if(node&&!node.contains(event.relatedTarget))highlightNetwork(state.networkPinned);});
  container.addEventListener('focusin',event=>{const node=event.target.closest('[data-network]');if(node)highlightNetwork(node.dataset.network);});
  container.addEventListener('focusout',event=>{const node=event.target.closest('[data-network]');if(node&&!node.contains(event.relatedTarget))highlightNetwork(state.networkPinned);});
}
function revealNetworkSelection(){
  const node=state.network?.nodes.find(item=>item.row.country===$('network-select').value),scroll=document.querySelector('.network-scroll');
  if(node&&scroll)scroll.scrollTo?.({left:node.x*state.networkZoom-scroll.clientWidth/2,top:node.y*state.networkZoom-scroll.clientHeight/2,behavior:'smooth'});
}
function initNetworkDragging(){
  const container=$('network-graph');let drag=null,suppressClick=false;
  container.addEventListener('pointerdown',event=>{
    const element=event.target.closest('[data-network]');if(!element || event.button!==0)return;
    const node=state.network.nodes.find(item=>item.row.country===element.dataset.network);
    drag={node,element,startX:event.clientX,startY:event.clientY,moved:false};element.setPointerCapture?.(event.pointerId);
  });
  container.addEventListener('pointermove',event=>{
    if(!drag)return;
    if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)drag.moved=true;
    if(!drag.moved)return;
    const rect=container.getBoundingClientRect(),node=drag.node;node.dragging=true;
    node.x=Math.max(26,Math.min(NETWORK_WIDTH-26,(event.clientX-rect.left)/state.networkZoom));
    node.y=Math.max(node.known?26:850,Math.min(node.known?810:970,(event.clientY-rect.top)/state.networkZoom));
    node.vx=node.vy=0;drawNetwork();
  });
  function release(){if(!drag)return;drag.node.dragging=false;if(drag.moved){suppressClick=true;window.setTimeout(()=>{suppressClick=false;},0);animateNetwork();}drag=null;}
  container.addEventListener('pointerup',release);container.addEventListener('pointercancel',release);
  container.addEventListener('click',event=>{if(suppressClick){event.stopImmediatePropagation();event.preventDefault();}},true);
}
function exploreExactPalette(colors){
  $('search').value='';$('era').value='all';$('scope').value='all';$('sort').value='name';$('match').value='exact';
  state.selected=new Set(colors);state.limit=24;
  document.querySelectorAll('.color-option').forEach(button=>button.setAttribute('aria-pressed',String(state.selected.has(button.dataset.color))));
  $('color-count').textContent=`${state.selected.size} selected`;render();
  document.getElementById('explore').scrollIntoView?.({behavior:'smooth'});
}

function checkedMilestones(rows, records){
  return Object.entries(records).map(([country,record])=>{
    const matches=rows.filter(row=>row.country===country);
    if(matches.length!==1 || matches[0].iso_alpha2!==record.iso_alpha2 || matches[0].flag_origin_year!==null || !Number.isInteger(record.year) || !['documented_depiction','documented_adoption','documented_regulation','documented_version_change'].includes(record.kind) || !record.description || !record.source_name || !record.status?.includes('not a creation date') || !safeURL(record.source)) throw new Error(`Invalid documented milestone for ${country}`);
    return {row:matches[0],...record};
  });
}

function historyData(rows, field, width){
  const dated = rows.filter(r => Number.isInteger(r[field]));
  const unknown = rows.filter(r => !Number.isInteger(r[field])).sort((a,b)=>a.country.localeCompare(b.country));
  const milestones=field==='flag_origin_year'?checkedMilestones(rows,state.milestones):[];
  if(!dated.length) return {dated, unknown, milestones, bins:[], max:0};
  const dates=dated.map(r=>r[field]).concat(milestones.map(m=>m.year));
  const first = Math.floor(Math.min(...dates)/width)*width;
  const last = Math.floor(Math.max(...dates)/width)*width;
  const bins = [];
  for(let start=first; start<=last; start+=width){
    bins.push({start, rows:dated.filter(r=>r[field]>=start && r[field]<start+width).sort((a,b)=>a[field]-b[field] || a.country.localeCompare(b.country)), milestones:milestones.filter(m=>m.year>=start && m.year<start+width).sort((a,b)=>a.year-b.year || a.row.country.localeCompare(b.row.country))});
  }
  return {dated, unknown, milestones, bins, max:Math.max(...bins.map(b=>b.rows.length))};
}

function renderHistory(){
  const field = $('history-measure').value, width = Number($('history-bin').value);
  const {dated,unknown,milestones,bins,max}=historyData(state.rows,field,width);
  if (!dated.length) { $('history-chart').textContent = 'No dates available.'; return; }
  const rowHeight=30, plotHeight = Math.max(150, max*rowHeight+35);
  const ticks=[];
  for(let n=0;n<=max;n+=10) ticks.push(`<span class="history-tick" style="bottom:${n*rowHeight}px">${n}</span>`);
  $('history-summary').textContent = `${dated.length} recorded ${field==='flag_origin_year'?'origins':'adoptions'} · ${unknown.length} unknown${milestones.length?` · ${milestones.length} separate milestones`:''}`;
  $('milestone-legend').hidden = !milestones.length;
  $('history-chart').innerHTML = `<div class="history-axis" style="height:${plotHeight}px"><span class="history-axis-title">FLAGS</span>${ticks.join('')}</div><div class="history-columns" style="--plot-height:${plotHeight}px">${bins.map(bin=>`<div class="history-column"><div class="history-stack" style="height:${plotHeight}px">${bin.rows.length ? `<span class="history-total">${bin.rows.length}</span>` : ''}${bin.rows.slice().reverse().map(row=>`<button type="button" class="history-tile" data-country="${escapeHTML(row.country)}" title="${escapeHTML(row.country)} · ${row[field]}" aria-label="${escapeHTML(row.country)}, ${row[field]}. Open details.">${row.image ? `<img src="${escapeHTML(row.image)}" alt="" loading="lazy">` : '<span>?</span>'}</button>`).join('')}</div><span class="history-year">${bin.start}</span><div class="history-milestones">${bin.milestones.map(m=>`<button type="button" class="history-milestone" data-country="${escapeHTML(m.row.country)}" title="${escapeHTML(m.row.country)} · ${m.year}: documented milestone, not a creation date" aria-label="${escapeHTML(m.row.country)}, ${m.year}: documented milestone, not a creation date. Open details.">${imageHTML(m.row)}<span>${m.year}</span></button>`).join('')}</div></div>`).join('')}</div>`;
  $('undated-summary').textContent = `${unknown.length} flags with ${field === 'flag_origin_year' ? 'unknown origin' : 'unknown adoption'} year`;
  document.querySelector('.undated-panel p').textContent = field==='flag_origin_year' ? 'Their origin year is unknown. Where supported, a different documented milestone appears below the timeline.' : 'No current adoption year is recorded for these entries.';
  $('undated-list').innerHTML = unknown.length ? unknown.map(r=>`<button type="button" data-country="${escapeHTML(r.country)}">${imageHTML(r)}<span>${escapeHTML(r.country)}</span></button>`).join('') : '<p>All entries have a recorded date for this measure.</p>';
}

function loadFlagImage(row){
  return new Promise((resolve,reject)=>{
    if(!row.image) return reject(new Error(`No illustration for ${row.country}`));
    const img=new Image();
    img.onload=()=>resolve([row.country,img]);
    img.onerror=()=>reject(new Error(`Could not load the flag of ${row.country}`));
    img.src=row.image;
  });
}

function drawFlag(ctx,img,x,y,width,height){
  const scale=Math.min(width/img.naturalWidth,height/img.naturalHeight);
  const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
  const left=x+(width-w)/2,top=y+(height-h)/2;
  ctx.drawImage(img,left,top,w,h);
  ctx.strokeStyle='#aab9af'; ctx.lineWidth=1; ctx.strokeRect(left+.5,top+.5,Math.max(0,w-1),Math.max(0,h-1));
}

function wrapCanvasText(ctx,text,maxWidth){
  const words=text.split(/\s+/),lines=[];let line='';
  for(const word of words){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);return lines;
}
async function createHistoryPNG(rows,field,interval,spacing='compact'){
  const {dated,unknown,milestones,bins:allBins,max}=historyData(rows,field,interval);
  if(!dated.length) throw new Error('There are no dated flags for this measure.');
  if(!['compact','linear'].includes(spacing))throw new Error('Invalid time-axis spacing.');
  const bins=spacing==='compact'?allBins.filter(bin=>bin.rows.length||bin.milestones.length):allBins;
  const images=new Map(await Promise.all(rows.map(loadFlagImage)));
  const margin=150,columnWidth=Math.max(150,Math.floor((2800-2*margin)/bins.length)),flagW=100,flagH=38,rowH=45;
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(2800,margin*2+bins.length*columnWidth);
  const plotHeight=Math.max(1450,max*rowH+70),headerHeight=1200,titleX=margin+80;
  const firstTall=bins.findIndex(bin=>bin.rows.length&&plotHeight-bin.rows.length*rowH<headerHeight+50);
  const firstTallX=firstTall<0?canvas.width-margin:margin+firstTall*columnWidth+(columnWidth-flagW)/2;
  let headerWidth=Math.min(canvas.width*.62,firstTallX-titleX-45),plotTop=140,headerTop=plotTop+35;
  // Dense early bins need a separate header so text never covers a flag.
  if(headerWidth<650){headerWidth=canvas.width-2*margin;plotTop=1350;headerTop=65;}
  const baseline=plotTop+plotHeight;
  const milestoneRows=Math.max(0,...bins.map(bin=>bin.milestones.length));
  const infoTop=baseline+175+milestoneRows*92;
  const unknownTop=milestones.length?infoTop+Math.ceil(milestones.length/2)*52+105:baseline+150;
  const unknownColumns=canvas.width>=3600?4:2,unknownRowH=135,unknownFlagW=200,unknownFlagH=84;
  const unknownHeight=Math.max(1,Math.ceil(unknown.length/unknownColumns))*unknownRowH;
  canvas.height=unknownTop+150+unknownHeight+110;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable in this browser.');
  ctx.fillStyle='#f8f6ed';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#cbd6cb';ctx.fillStyle='#5d756a';ctx.font='32px sans-serif';ctx.textAlign='right';
  for(let n=0;n<=max;n+=10){const y=baseline-n*rowH;ctx.beginPath();ctx.moveTo(margin-12,y);ctx.lineTo(canvas.width-margin+12,y);ctx.stroke();ctx.fillText(String(n),margin-24,y+10);}
  ctx.save();ctx.translate(48,plotTop+plotHeight/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillStyle='#526d64';ctx.font='bold 32px sans-serif';ctx.fillText('NUMBER OF FLAGS',0,0);ctx.restore();
  ctx.save();ctx.globalAlpha=.11;ctx.fillStyle='#17343b';ctx.font='bold 96px sans-serif';ctx.textAlign='center';ctx.translate(canvas.width*.55,plotTop+plotHeight*.62);ctx.rotate(-.12);ctx.fillText('@Calcetinletal',0,0);ctx.restore();
  ctx.fillStyle='#f8f6ed';ctx.fillRect(titleX-20,headerTop-20,headerWidth+30,headerHeight);
  ctx.textAlign='left';ctx.fillStyle='#17343b';ctx.font='700 42px sans-serif';ctx.fillText('FLAG STORIES   /   A VISUAL ATLAS',titleX,headerTop+45);
  ctx.font='bold 132px Georgia, serif';
  const title=field==='flag_origin_year'?'The origins of flags':'When current flags were adopted';
  let y=headerTop+205;
  for(const line of wrapCanvasText(ctx,title,headerWidth-40)){ctx.fillText(line,titleX,y);y+=145;}
  ctx.fillStyle='#526d64';ctx.font='50px sans-serif';y+=10;
  for(const line of wrapCanvasText(ctx,dated.length+' dated flags · '+unknown.length+' unknown · '+interval+'-year intervals',headerWidth-40)){ctx.fillText(line,titleX,y);y+=64;}
  ctx.font='40px sans-serif';y+=16;
  const notes=field==='flag_origin_year'?['Origin dates can describe a design, precursor, first use or adoption.','They are not uniform creation dates. Each tile represents one flag.']:['Current adoption dates differ from the origin of a flag design.','Each tile represents one flag.'];
  notes.push(spacing==='compact'?'Labels mark interval starts; empty intervals omitted, so spacing is not proportional to time.':'Column labels mark the first year of each interval; spacing is linear.');
  for(const note of notes)for(const line of wrapCanvasText(ctx,note,headerWidth-40)){ctx.fillText(line,titleX,y);y+=54;}
  if(y>headerTop+headerHeight)throw new Error('The chart title does not fit safely in the available space.');
  ctx.textAlign='center';
  bins.forEach((bin,index)=>{
    const x=margin+index*columnWidth+(columnWidth-flagW)/2;
    bin.rows.forEach((row,i)=>drawFlag(ctx,images.get(row.country),x,baseline-(i+1)*rowH,flagW,flagH));
    ctx.fillStyle='#17343b';ctx.font='bold 34px sans-serif';
    if(bin.rows.length)ctx.fillText(String(bin.rows.length),x+flagW/2,baseline-bin.rows.length*rowH-12);
    ctx.font='34px sans-serif';ctx.fillText(String(bin.start),x+flagW/2,baseline+48);
    if(spacing==='compact'&&index>0&&bin.start-bins[index-1].start>interval){
      ctx.fillStyle='#a4472a';ctx.font='bold 28px sans-serif';ctx.fillText('//',margin+index*columnWidth,baseline+48);
    }
  });
  if(milestones.length){
    ctx.textAlign='left';ctx.fillStyle='#a4472a';ctx.font='bold 34px sans-serif';
    ctx.fillText('OUTLINED FLAGS: DOCUMENTED MILESTONES · NOT INCLUDED IN THE COUNTS',margin,baseline+105);
    bins.forEach((bin,index)=>bin.milestones.forEach((milestone,i)=>{
      const x=margin+index*columnWidth+(columnWidth-flagW)/2,y=baseline+135+i*92;
      drawFlag(ctx,images.get(milestone.row.country),x,y,flagW,48);
      ctx.strokeStyle='#c75e37';ctx.lineWidth=3;ctx.strokeRect(x,y,flagW,48);
      ctx.fillStyle='#a4472a';ctx.font='bold 31px sans-serif';ctx.textAlign='center';ctx.fillText(String(milestone.year),x+flagW/2,y+80);
    }));
    const kindLabel={documented_depiction:'depiction',documented_adoption:'adoption',documented_regulation:'regulation',documented_version_change:'version change'};
    const infoWidth=(canvas.width-margin*2)/2;ctx.font='34px sans-serif';ctx.fillStyle='#794a39';ctx.textAlign='left';
    milestones.forEach((m,i)=>ctx.fillText(m.row.country+' '+m.year+' · '+kindLabel[m.kind],margin+(i%2)*infoWidth,infoTop+Math.floor(i/2)*52));
  }
  ctx.textAlign='left';ctx.fillStyle='#17343b';ctx.font='bold 60px sans-serif';
  ctx.fillText('UNKNOWN '+(field==='flag_origin_year'?'ORIGIN':'ADOPTION')+' YEAR  ·  '+unknown.length,margin,unknownTop);
  ctx.fillStyle='#526d64';ctx.font='40px sans-serif';ctx.fillText('No reliable year is recorded in the supplied dataset.',margin,unknownTop+60);
  const cell=(canvas.width-margin*2)/unknownColumns;
  unknown.forEach((row,i)=>{
    const x=margin+(i%unknownColumns)*cell,y=unknownTop+100+Math.floor(i/unknownColumns)*unknownRowH;
    drawFlag(ctx,images.get(row.country),x,y,unknownFlagW,unknownFlagH);
    ctx.fillStyle='#17343b';ctx.font='52px sans-serif';
    let name=row.country;while(name.length>1&&ctx.measureText(name).width>cell-unknownFlagW-40)name=name.slice(0,-1);
    if(name!==row.country)name=name.trimEnd()+'…';
    ctx.fillText(name,x+unknownFlagW+24,y+61);
  });
  const footer=canvas.height-42;
  ctx.fillStyle='#17343b';ctx.font='bold 32px sans-serif';ctx.fillText('FLAG STORIES  ·  @Calcetinletal',margin,footer);
  ctx.textAlign='right';ctx.font='28px sans-serif';ctx.fillText('Sources: supplied dataset and milestone records · Flags: FlagCDN / Wikimedia Commons',canvas.width-margin,footer);
  ctx.font='24px sans-serif';ctx.fillText('calcetinletal.github.io/flag-atlas/',canvas.width-margin,footer+30);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG creation failed.')),'image/png'));
  return {blob,width:canvas.width,height:canvas.height};
}

async function downloadHistory(){
  const button=$('download-history'),status=$('download-status');
  const field=$('history-measure').value,interval=Number($('history-bin').value),spacing=$('history-spacing').value;
  button.disabled=true;status.textContent='Preparing the full-resolution PNG…';
  try {
    const result=await createHistoryPNG(state.rows,field,interval,spacing);
    const url=URL.createObjectURL(result.blob),link=document.createElement('a');
    link.href=url;link.download=`flag-stories-${field==='flag_origin_year'?'origins':'adoptions'}-${interval}y${spacing==='linear'?'-linear':''}.png`;
    document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
    status.textContent=`Downloaded ${result.width.toLocaleString()} × ${result.height.toLocaleString()} px PNG.`;
  } catch(error) {console.error(error);status.textContent=`Could not create the chart: ${error.message}. Please try again.`;}
  finally {button.disabled=false;}
}

function details(row){
  const links = ['source_1_url','source_2_url','source_3_url'].map((key,i)=>safeURL(row[key]) ? `<a href="${escapeHTML(safeURL(row[key]))}" target="_blank" rel="noopener noreferrer">Source ${i+1} ↗</a>` : '').join('');
  const basis = row.origin_basis.replaceAll('_',' ');
  const colors = row.colors ? row.colors.map(c=>`<span class="dot" style="background:${palette[c]}"></span>${c}`).join(' ') : 'Unavailable';
  const account = state.accounts[row.country];
  const curated = state.curated[row.country];
  const milestone = state.milestones[row.country];
  const milestoneHTML = milestone ? `<div class="milestone-detail"><strong>DOCUMENTED MILESTONE · ${milestone.year}</strong><p>${escapeHTML(milestone.description)} <a href="${escapeHTML(safeURL(milestone.source))}" target="_blank" rel="noopener noreferrer">${escapeHTML(milestone.source_name)} ↗</a></p></div>` : '';
  let accountHTML = '<p>No sourced color account has been added for this entry yet. The date sources below may offer further context.</p>';
  if(curated) accountHTML = `<p>${escapeHTML(curated.text)}</p><p>${escapeHTML(curated.scope)} <a href="${escapeHTML(safeURL(curated.url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(curated.source_name)} ↗</a></p>`;
  else if(account && account.status === 'variant_conflict') accountHTML = '<p>The archived source describes a different flag variant, so its account is not shown here. The color story for this variant remains to be researched.</p>';
  else if(account && account.status === 'profile_only') accountHTML = `<p>The archived profile does not provide a separately labelled history or meaning. <a href="${escapeHTML(safeURL(account.url))}" target="_blank" rel="noopener noreferrer">Read its flag description ↗</a></p>`;
  else if(account && account.status === 'excerpt') accountHTML = `<p class="account-label">ARCHIVED WORLD FACTBOOK · ${escapeHTML(account.kind.toUpperCase())}</p><blockquote>“${escapeHTML(account.excerpt)}”</blockquote><p>Short extract from a historical account, not necessarily an official or complete interpretation. <a href="${escapeHTML(safeURL(account.url))}" target="_blank" rel="noopener noreferrer">Read the full source ↗</a></p>`;
  $('detail-content').innerHTML = `<div class="detail-body"><div class="detail-image flag-frame">${imageHTML(row)}</div><p class="eyebrow">${escapeHTML(row.scope)} · ${escapeHTML(row.flag_variant)}</p><h2>${escapeHTML(row.country)}</h2><span class="detail-basis">Origin basis: ${escapeHTML(basis)}</span><div class="detail-grid"><div><small>ORIGIN YEAR</small><strong>${yearText(row)}</strong></div><div><small>CURRENT VERSION</small><strong>${row.current_version_year ?? 'Unknown'}</strong></div><div><small>CURRENT ADOPTION</small><strong>${row.current_adoption_year ?? 'Unknown'}</strong></div></div>${milestoneHTML}<div class="detail-colors">${colors}</div><div class="color-story"><h3>History &amp; symbolism</h3>${accountHTML}<p>Interpretations can differ, and the source may discuss a related state or civil flag. A flag’s colors can predate its recorded origin year.</p></div><p>${escapeHTML(row.notes)}</p><p>Source type: ${escapeHTML(row.source_type)} · Dataset verified as of ${escapeHTML(row.verified_as_of)}</p><div>${links}</div></div>`;
  $('details').showModal();
}

function nextRound(){
  const pool = state.rows.filter(r=>r.image && r.flag_origin_year !== null);
  if(pool.length < 2) return;
  const a = pool[Math.floor(Math.random()*pool.length)];
  const others = pool.filter(r=>r.flag_origin_year !== a.flag_origin_year);
  if(!others.length) return;
  const b = others[Math.floor(Math.random()*others.length)];
  state.pair=[a,b]; state.answered=false;
  $('game-choices').innerHTML = state.pair.map((r,i)=>`<button class="game-choice" data-choice="${i}">${imageHTML(r)}<strong>${escapeHTML(r.country)}</strong><small>Choose this flag ↗</small></button>`).join('');
  $('game-feedback').textContent='Which design has the earlier origin?'; $('next').hidden=true;
}
function choose(index){
  if(state.answered) return;
  state.answered=true; const [a,b]=state.pair, older=a.flag_origin_year < b.flag_origin_year ? 0 : 1;
  state.rounds++; if(index===older) state.score++;
  $('score').innerHTML=`${state.score} <small>/ ${state.rounds}</small>`;
  document.querySelectorAll('.game-choice').forEach((button,i)=>{button.disabled=true; button.querySelector('small').textContent=`Origin: ${yearText(state.pair[i])}`;});
  $('game-feedback').textContent = `${index===older?'Correct!':'Not quite!'} ${state.pair[older].country} has the earlier recorded origin in this dataset.`;
  $('next').hidden=false;
}

async function init(){
  try {
    const response=await fetch('data.json'); if(!response.ok) throw new Error(`HTTP ${response.status}`);
    state.rows=await response.json();
    try{
      const geographyResponse=await fetch('geography_m49.json');if(!geographyResponse.ok)throw new Error('Geography unavailable');
      const data=await geographyResponse.json(),map=data?.by_iso_alpha2;
      if(!map||typeof map!=='object'||!Object.values(map).every(item=>item&&typeof item.region==='string'&&typeof item.subregion==='string'))throw new Error('Invalid geographic classification');
      state.geography=map;
    }catch(error){state.geography={};console.warn('Geographic classification unavailable',error);document.querySelector('.network-geography-note').textContent='Geographic classification unavailable; all entries are unclassified.';}
    const milestonesResponse=await fetch('documented_milestones.json');
    if(!milestonesResponse.ok) throw new Error('Documented milestone data unavailable.');
    state.milestones=await milestonesResponse.json();
    checkedMilestones(state.rows,state.milestones);
    for(const [file,key] of [['flag_accounts.json','accounts'],['curated_accounts.json','curated']]){
      try {const response=await fetch(file); if(response.ok) state[key]=await response.json();} catch(error) {console.warn(`${file} unavailable`,error);}
    }
    $('hero-count').textContent=state.rows.length; $('hero-dated').textContent=state.rows.filter(r=>r.flag_origin_year!==null).length;
    $('history-summary').insertAdjacentHTML('afterend','<p id="milestone-legend" class="milestone-legend"><span></span> Outlined flags below the years mark documented milestones for flags with unknown origins. They are not creation years and are not counted in the bars. Select one for its source.</p>');
    initColors(); render(); renderPaletteStats(); initNetwork(); initNetworkDragging(); initNetworkHighlight(); renderHistory(); nextRound();
    ['search','era','scope','match','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{state.limit=24;render();}));
    $('reset').addEventListener('click',reset); $('empty-reset').addEventListener('click',reset);
    $('more').addEventListener('click',()=>{state.limit+=24;render();});
    $('cards').addEventListener('click',e=>{const card=e.target.closest('[data-country]'); if(card) details(state.rows.find(r=>r.country===card.dataset.country));});
    $('palette-combos').addEventListener('click',e=>{const combo=e.target.closest('[data-colors]');if(combo) exploreExactPalette(combo.dataset.colors.split(','));});
    $('network-select').addEventListener('change',()=>{state.networkPinned=$('network-select').value;renderNetwork();highlightNetwork(state.networkPinned);revealNetworkSelection();});
    $('network-mode').addEventListener('change',event=>createNetwork(event.target.value));
    $('network-region').addEventListener('change',()=>{updateNetworkSubregions();createNetwork($('network-mode').value);});
    $('network-subregion').addEventListener('change',()=>createNetwork($('network-mode').value));
    $('network-links').addEventListener('change',event=>$('network-graph').classList.toggle('show-all-links',event.target.value==='all'));
    $('network-zoom-in').addEventListener('click',()=>setNetworkZoom(state.networkZoom+.15));
    $('network-zoom-out').addEventListener('click',()=>setNetworkZoom(state.networkZoom-.15));
    $('network-restart').addEventListener('click',animateNetwork);
    $('network-details').addEventListener('click',()=>{const row=state.rows.find(r=>r.country===$('network-select').value);if(row) details(row);});
    ['network-graph','twins-list'].forEach(id=>$(id).addEventListener('click',e=>{const node=e.target.closest('[data-network]');if(node){$('network-select').value=node.dataset.network;state.networkPinned=node.dataset.network;renderNetwork();highlightNetwork(state.networkPinned);if(id==='twins-list')revealNetworkSelection();$('network-select').focus({preventScroll:true});}}));
    $('timeline').addEventListener('click',e=>{const bar=e.target.closest('[data-period]'); if(bar){$('era').value=bar.dataset.period;state.limit=24;render();}});
    ['history-measure','history-bin'].forEach(id=>$(id).addEventListener('change',renderHistory));
    $('download-history').addEventListener('click',downloadHistory);
    ['history-chart','undated-list'].forEach(id=>$(id).addEventListener('click',e=>{const tile=e.target.closest('[data-country]'); if(tile) details(state.rows.find(r=>r.country===tile.dataset.country));}));
    $('close-dialog').addEventListener('click',()=>$('details').close());
    $('details').addEventListener('click',e=>{if(e.target===$('details')) $('details').close();});
    $('game-choices').addEventListener('click',e=>{const choice=e.target.closest('[data-choice]'); if(choice) choose(Number(choice.dataset.choice));});
    $('next').addEventListener('click',nextRound);
  } catch(error){$('cards').innerHTML='<p>Sorry, the flag collection could not be loaded. Please refresh the page.</p>'; console.error(error);}
}
init();
