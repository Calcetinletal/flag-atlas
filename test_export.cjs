// Run: node test_export.cjs /path/to/jsdom /path/to/@napi-rs/canvas [output.png]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require(process.argv[2]);
const {createCanvas, Image} = require(process.argv[3]);
const root=__dirname;
const rows=JSON.parse(fs.readFileSync(path.join(root,'data.json')));
const milestones=JSON.parse(fs.readFileSync(path.join(root,'documented_milestones.json')));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only'});
const {window}=dom;
window.fetch=async file=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))});
let drawn=[],texts=[],textRecords=[],drawRects=[],actualContext;
class FileImage extends Image {
  set src(value) {
    this.flagPath=value;
    try {super.src=fs.readFileSync(path.join(root,value));}
    catch(error){queueMicrotask(()=>this.onerror?.(error));}
  }
  get naturalWidth(){return this.width;}
  get naturalHeight(){return this.height;}
}
window.Image=FileImage;
const createElement=window.document.createElement.bind(window.document);
window.document.createElement=function(tag){
  if(tag.toLowerCase()!=='canvas') return createElement(tag);
  let backing,ctx,canvas={width:0,height:0};
  canvas.getContext=()=>{
    backing=createCanvas(canvas.width,canvas.height);const actual=backing.getContext('2d');actualContext=actual;
    ctx=new Proxy(actual,{
      get(target,key){
        if(key==='drawImage') return (image,...args)=>{drawn.push(image.flagPath);drawRects.push({path:image.flagPath,args});return target.drawImage(image,...args);};
        if(key==='fillText') return (text,...args)=>{texts.push(text);textRecords.push({text,font:target.font,x:args[0],y:args[1],width:target.measureText(text).width});return target.fillText(text,...args);};
        const value=target[key];return typeof value==='function'?value.bind(target):value;
      },set(target,key,value){target[key]=value;return true;}
    });return ctx;
  };
  canvas.toBlob=callback=>callback(backing.toBuffer('image/png'));
  return canvas;
};
window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.__testCreateHistoryPNG = createHistoryPNG; window.__testCheckedMilestones = checkedMilestones; window.__testDrawFlag = drawFlag;');
(async()=>{
  await new Promise(resolve=>setTimeout(resolve,30));
  for(const field of ['flag_origin_year','current_adoption_year']) for(const interval of [20,50,100]){
    drawn=[];texts=[];textRecords=[];drawRects=[];
    const result=await window.__testCreateHistoryPNG(rows,field,interval);
    assert.ok(result.width>=2200 && result.height>=1000);
    const expectedMarkers=field==='flag_origin_year'?Object.keys(milestones):[];
    const byCountry=new Map(rows.map(r=>[r.country,r]));
    const expectedImages=rows.map(r=>r.image).concat(expectedMarkers.map(name=>byCountry.get(name).image));
    assert.deepEqual(drawn.slice().sort(),expectedImages.sort(),`${field} ${interval}: each base flag and each milestone must be drawn exactly once`);
    const dated=rows.filter(r=>r[field]!==null);
    const dates=dated.map(r=>r[field]).concat(expectedMarkers.map(name=>milestones[name].year));
    const first=Math.floor(Math.min(...dates)/interval)*interval;
    const last=Math.floor(Math.max(...dates)/interval)*interval;
    const binCount=(last-first)/interval+1;
    const colWidth=Math.max(96,Math.floor((2200-280)/binCount));
    const counts=new Map();
    for(const r of dated){const b=Math.floor(r[field]/interval)*interval;counts.set(b,(counts.get(b)||0)+1);}
    const baseline=310+Math.max(...counts.values())*36+54;
    const byImage=new Map(rows.map(r=>[r.image,r]));
    for(const item of drawRects){
      const row=byImage.get(item.path);
      if(row[field]===null) continue;
      const center=item.args[0]+item.args[2]/2;
      const expectedCenter=140+(Math.floor(row[field]/interval)*interval-first)/interval*colWidth+colWidth/2;
      assert.ok(Math.abs(center-expectedCenter)<.01,`${row.country} drawn in the wrong date interval`);
      const group=dated.filter(r=>Math.floor(r[field]/interval)===Math.floor(row[field]/interval)).sort((a,b)=>a[field]-b[field]||a.country.localeCompare(b.country));
      const expectedTop=baseline-(group.findIndex(r=>r.country===row.country)+1)*36;
      assert.ok(item.args[1]>=expectedTop-.01 && item.args[1]+item.args[3]<=expectedTop+30.01,`${row.country} drawn at the wrong height`);
    }
    for(const name of expectedMarkers){
      const row=byCountry.get(name), marker=milestones[name];
      const markerCenter=140+(Math.floor(marker.year/interval)*interval-first)/interval*colWidth+colWidth/2;
      const group=Object.entries(milestones).filter(([,m])=>Math.floor(m.year/interval)===Math.floor(marker.year/interval)).sort((a,b)=>a[1].year-b[1].year||a[0].localeCompare(b[0]));
      const markerTop=baseline+102+group.findIndex(([country])=>country===name)*55;
      const matching=drawRects.filter(item=>item.path===row.image && Math.abs(item.args[0]+item.args[2]/2-markerCenter)<.01 && item.args[1]>=markerTop-.01 && item.args[1]+item.args[3]<=markerTop+30.01);
      assert.ok(matching.length,`${name} documented milestone drawn in the wrong interval`);
      assert.ok(texts.includes(String(marker.year)),`${name} milestone year missing`);
    }
    if(expectedMarkers.length) assert.ok(texts.some(s=>s.includes('DOCUMENTED MILESTONES')&&s.includes('NOT INCLUDED IN THE COUNTS')));
    for(const item of drawRects){
      const [x,y,w,h]=item.args;
      assert.ok(w>0&&h>0,`${item.path}: image has nonzero dimensions`);
      const pixels=actualContext.getImageData(Math.floor(x),Math.floor(y),Math.ceil(w),Math.ceil(h)).data;
      let colored=false;
      for(let p=0;p<pixels.length;p+=4) if(pixels[p]<220||pixels[p+1]<220||pixels[p+2]<220){colored=true;break;}
      assert.ok(colored,`${item.path}: image pixels are not blank`);
    }
    const unknown=rows.filter(r=>r[field]===null).sort((a,b)=>a.country.localeCompare(b.country));
    const unknownDraws=unknown.length?drawRects.slice(-unknown.length):[];
    unknown.forEach((row,i)=>{
      const label=textRecords.find(item=>item.text===row.country);
      assert.ok(label,`${row.country} needs a visible unknown-date label`);
      assert.match(label.font,/28px/,`${row.country} label must be readable`);
      assert.equal(unknownDraws[i].path,row.image);
      assert.ok(unknownDraws[i].args[3]>30,`${row.country} flag must be larger than a plotted flag`);
      assert.ok(label.x>unknownDraws[i].args[0]+unknownDraws[i].args[2],`${row.country} label must clear its flag`);
      assert.ok(label.x+label.width<result.width-140,`${row.country} label must stay within the canvas`);
    });
    assert.ok(texts.includes('@Calcetinletal'));
    assert.ok(texts.some(x=>x.includes('FLAG STORIES')&&x.includes('@Calcetinletal')));
    assert.ok(result.blob.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')));
    if(field==='flag_origin_year' && interval===20 && process.argv[4]) fs.writeFileSync(process.argv[4],result.blob);
    console.log(`PASS ${field} ${interval}: ${result.width}x${result.height}, ${rows.length} flags, ${expectedMarkers.length} separate milestones, ${unknown.length} named unknowns, watermark`);
  }
  const invalid=rows.map((r,i)=>i===0?{...r,image:'flags/not-present.png'}:r);
  await assert.rejects(window.__testCreateHistoryPNG(invalid,'flag_origin_year',20),/Could not load the flag/);
  console.log('PASS: missing image rejects export rather than silently omitting a flag');
  assert.throws(()=>window.__testCheckedMilestones(rows,{Denmark:{...milestones.Denmark,iso_alpha2:'XX'}}),/Invalid documented milestone/);
  assert.throws(()=>window.__testCheckedMilestones(rows,{Denmark:{...milestones.Denmark,year:null}}),/Invalid documented milestone/);
  assert.throws(()=>window.__testCheckedMilestones(rows,{Denmark:{...milestones.Denmark,kind:'legend'}}),/Invalid documented milestone/);
  console.log('PASS: identity mismatch, missing year, and legend-like kind are rejected');
  const synthetic=createCanvas(20,20), sourceContext=synthetic.getContext('2d');
  sourceContext.fillStyle='#ff0000';sourceContext.fillRect(0,0,20,20);
  const redImage=new Image();
  await new Promise((resolve,reject)=>{redImage.onload=resolve;redImage.onerror=reject;redImage.src=synthetic.toBuffer('image/png');});
  Object.defineProperties(redImage,{naturalWidth:{value:redImage.width},naturalHeight:{value:redImage.height}});
  const surface=createCanvas(100,50), context=surface.getContext('2d');
  context.fillStyle='#abc8de';context.fillRect(0,0,100,50);
  window.__testDrawFlag(context,redImage,10,10,80,30);
  assert.deepEqual([...context.getImageData(15,25,1,1).data],[171,200,222,255],'empty space around a narrower flag must retain the background');
  assert.deepEqual([...context.getImageData(50,25,1,1).data],[255,0,0,255],'flag itself should render');
  console.log('PASS: flag padding stays transparent and its original proportions are preserved');
  let downloadedName='';
  window.URL.createObjectURL=blob=>{assert.ok(blob.length>8);return 'blob:test';};
  window.URL.revokeObjectURL=()=>{};
  window.HTMLAnchorElement.prototype.click=function(){downloadedName=this.download;};
  window.document.getElementById('download-history').click();
  for(let i=0;i<100&&!downloadedName;i++) await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(downloadedName,'flag-stories-origins-20y.png');
  assert.match(window.document.getElementById('download-status').textContent,/Downloaded/);
  console.log('PASS: download button creates the expected PNG and confirms completion');
  window.close();
})().catch(e=>{console.error(e);process.exitCode=1;window.close();});
