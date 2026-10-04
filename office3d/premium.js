import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export function smoothCharacterGeometry(geometry) {
  const source=geometry.clone(); source.deleteAttribute('normal');
  // UV and bone-weight seams stay split; continuous surfaces gain soft normals.
  const result=mergeVertices(source,.0001); result.computeVertexNormals(); source.dispose(); return result;
}

// Original procedural art: no licensed model or texture is redistributed by this module.
function texture(draw, size = 512) {
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  draw(canvas.getContext('2d'), size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8; return map;
}
function noise(x,y) { return ((x*73856093 ^ y*19349663) >>> 0) % 997 / 997; }
const grain = texture((g,s) => {
  g.fillStyle='#bd8e61'; g.fillRect(0,0,s,s);
  for(let i=0;i<450;i++) {
    g.strokeStyle=`rgba(64,36,18,${.025+noise(i,2)*.095})`; g.lineWidth=.4+noise(i,3);
    g.beginPath(); const y=noise(i,4)*s; g.moveTo(0,y);
    g.bezierCurveTo(s*.25,y+noise(i,6)*6,s*.7,y-noise(i,7)*7,s,y+noise(i,8)*4); g.stroke();
  }
});
const weave = texture((g,s) => {
  g.fillStyle='#b8b8b8'; g.fillRect(0,0,s,s);
  for(let y=0;y<s;y+=3) for(let x=0;x<s;x+=3) {
    g.fillStyle=`rgba(${noise(x,y)>.5?'255,255,255':'0,0,0'},.13)`;g.fillRect(x,y,2,2);
  }
});
weave.colorSpace = THREE.NoColorSpace; weave.repeat.set(3,3);
const wood = new THREE.MeshStandardMaterial({map:grain,roughness:.48,metalness:.015,bumpMap:grain,bumpScale:.008});
const walnut = wood.clone(); walnut.color.set('#94704e');
const leather = new THREE.MeshPhysicalMaterial({color:'#98613e',roughness:.58,metalness:0,bumpMap:weave,bumpScale:.006,clearcoat:.12,clearcoatRoughness:.65});
const textile = new THREE.MeshPhysicalMaterial({color:'#d59d52',roughness:.88,bumpMap:weave,bumpScale:.004,sheen:.4,sheenColor:new THREE.Color('#e6c6a1'),sheenRoughness:.9});
const metal = new THREE.MeshStandardMaterial({color:'#444a51',roughness:.32,metalness:.65});

function rounded(parent, dimensions, position, material, radius=.03) {
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(...dimensions,3,radius),material);
  mesh.position.set(...position); mesh.castShadow=mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function book(parent,x,y,z,colour,width=.09,height=.22) {
  const material=new THREE.MeshStandardMaterial({color:colour,roughness:.83});
  rounded(parent,[width,height,.17],[x,y+height/2,z],material,.006);
  rounded(parent,[width*.7,.006,.178],[x,y+height*.76,z],new THREE.MeshStandardMaterial({color:'#d9caa7',roughness:.9}),.001);
}
function sofa(world,x,z) {
  const group=new THREE.Group(); group.position.set(x,0,z); world.add(group);
  rounded(group,[2.75,.15,.67],[0,.26,0],leather,.06);
  rounded(group,[2.75,.43,.13],[0,.48,-.3],leather,.055);
  for(const side of [-1,1]) {
    rounded(group,[.19,.34,.72],[side*1.29,.45,0],leather,.065);
    for(const dz of [-.24,.24]) rounded(group,[.06,.2,.06],[side*1.18,.11,dz],walnut,.008);
  }
  for(let i=0;i<3;i++) {
    const cx=(i-1)*.81;
    rounded(group,[.77,.115,.49],[cx,.38,.055],leather,.048);
    const back=rounded(group,[.77,.29,.125],[cx,.56,-.2],leather,.05); back.rotation.x=-.1;
  }
  const pillow=rounded(group,[.35,.29,.13],[.74,.52,-.06],textile,.07); pillow.rotation.z=-.16;
  const blue=textile.clone();blue.color.set('#475f73');
  const cushion=rounded(group,[.34,.3,.13],[-.8,.51,-.07],blue,.07);cushion.rotation.z=.16;
  return group;
}
function rug(world,x,z,w,d) {
  const pattern=texture((g,s)=>{
    g.fillStyle='#c5a385';g.fillRect(0,0,s,s);
    for(let i=0;i<4;i++){g.strokeStyle=i%2?'#ab856c':'#dbc2a4';g.lineWidth=3;g.strokeRect(12+i*7,12+i*7,s-24-i*14,s-24-i*14);}
    for(let y=50;y<s-50;y+=24)for(let x=50;x<s-50;x+=24){g.strokeStyle='#ac876c';g.lineWidth=1;g.strokeRect(x,y,8,8);}
  });
  const material=new THREE.MeshStandardMaterial({map:pattern,bumpMap:weave,bumpScale:.006,roughness:1});
  rounded(world,[w,.012,d],[x,.012,z],material,.004);
}
function lamp(world,x,z,height=1.25) {
  const group=new THREE.Group();group.position.set(x,0,z);world.add(group);
  const brass=new THREE.MeshStandardMaterial({color:'#b18a50',metalness:.7,roughness:.35});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.14,.17,.04,24),brass);base.position.y=.025;group.add(base);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,height-.18,12),brass);stem.position.y=height/2-.09;group.add(stem);
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(.13,.23,.25,24,1,true),new THREE.MeshStandardMaterial({color:'#f2dcc0',side:THREE.DoubleSide,roughness:.95,emissive:'#f5b96d',emissiveIntensity:.18}));shade.position.y=height;group.add(shade);
  const glow=new THREE.Mesh(new THREE.CircleGeometry(.18,24),new THREE.MeshBasicMaterial({color:'#fff0cf',transparent:true,opacity:.75}));glow.rotation.x=Math.PI/2;glow.position.y=height-.105;group.add(glow);
  return group;
}
function reception(world) {
  const group=new THREE.Group();group.position.set(16,0,9.25);world.add(group);
  const shape=new THREE.Shape();
  const radius=1.45,depth=.62;
  // Elliptical front with a solid counter behind it and a walkable staff side.
  shape.moveTo(-radius,0); shape.bezierCurveTo(-radius,depth,.0,depth*1.4,radius,0);
  shape.lineTo(radius,-.16);shape.bezierCurveTo(0,depth*1.12,-radius,depth-.16,-radius,-.16);shape.closePath();
  const panel=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.71,bevelEnabled:true,bevelSize:.015,bevelThickness:.015,bevelSegments:2,steps:1,curveSegments:40}),walnut);
  panel.rotation.x=Math.PI/2;panel.position.y=.74;panel.castShadow=panel.receiveShadow=true;group.add(panel);
  const top=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelSize:.025,bevelThickness:.015,bevelSegments:3,curveSegments:40}),wood);
  top.rotation.x=Math.PI/2;top.position.y=.8;top.castShadow=top.receiveShadow=true;group.add(top);
  rounded(group,[2.65,.045,.46],[0,.76,.05],wood,.022);
  return group;
}

// Actual working screens rather than the pack's repeated wallpaper.
const displays=new Map();
export function workstationTexture(seat) {
  if(displays.has(seat))return displays.get(seat);
  const canvas=Object.assign(document.createElement('canvas'),{width:1024,height:512});
  const g=canvas.getContext('2d');
  if(seat==='briefing') {
    g.fillStyle='#17314d';g.fillRect(0,0,1024,512);
    g.strokeStyle='#335a78';g.lineWidth=1;
    for(let x=0;x<1024;x+=32){g.beginPath();g.moveTo(x,0);g.lineTo(x,512);g.stroke();}
    for(let y=0;y<512;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(1024,y);g.stroke();}
    g.fillStyle='#dae5e8';g.font='28px monospace';g.fillText('PROJECT BRIEF',36,54);
    for(const [x,y,w,h] of [[120,128,180,96],[260,215,70,120],[460,155,92,160],[545,110,270,130],[775,330,100,70]]) {
      g.fillStyle='#557c92';g.beginPath();g.ellipse(x+w/2,y+h/2,w/2,h/2,-.3,0,Math.PI*2);g.fill();
    }
    for(const [x,y] of [[160,180],[480,170],[650,210],[790,358]]) {
      g.fillStyle='#efd69a';g.beginPath();g.arc(x,y,7,0,Math.PI*2);g.fill();
      g.strokeStyle='#8ab7cf';g.beginPath();g.moveTo(160,180);g.lineTo(x,y);g.stroke();
    }
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;displays.set(seat,map);return map;
  }
  const profile = seat==='pod10' ? ['HERMES · RESEARCH','#7ba9d2'] : seat==='pod12' ? ['OPENCLAW · OPERATIONS','#da906d'] : seat==='pod14' ? ['CORTEX · CONTEXT','#b09bd1'] : seat==='pod16' ? ['AGENT ZERO · ENGINEERING','#b7c5d2'] : ['WORKSPACE','#80a8cc'];
  g.fillStyle='#121a24';g.fillRect(0,0,1024,512);
  g.fillStyle='#253244';g.fillRect(0,0,1024,36);
  g.font='16px monospace';g.fillStyle='#cad5df';g.fillText(profile[0],24,25);
  for(let i=0;i<3;i++){g.fillStyle=['#ce7865','#d2b879','#79b28a'][i];g.beginPath();g.arc(970+i*14,18,4,0,Math.PI*2);g.fill();}
  g.fillStyle='#192431';g.fillRect(0,36,184,476);
  g.font='14px monospace';g.fillStyle='#8094a6';g.fillText('EXPLORER',18,67);
  ['workspace/','  notes/','  research/','  src/','  artifacts/','  README.md','  tasks.json'].forEach((line,i)=>g.fillText(line,18,103+i*28));
  g.fillStyle='#233246';g.fillRect(184,36,270,38);g.fillStyle=profile[1];g.fillText('SESSION · '+seat,200,61);
  const text=['# Project workspace','','Reviewing the current context','Preparing the next action','','Read · workspace/README.md','Read · notes/project-plan.md','','Changes are tracked in this workspace.','Results appear in the activity panel.'];
  g.font='17px monospace';
  text.forEach((line,i)=>{g.fillStyle='#61758b';g.fillText(String(i+1).padStart(2,' '),200,106+i*28);g.fillStyle=i===0?profile[1]:i%3===0?'#a9bbcc':'#d2dce5';g.fillText(line,246,106+i*28);});
  g.fillStyle='#0c131d';g.fillRect(184,400,840,88);g.fillStyle='#83b795';g.fillText('TERMINAL',204,427);
  g.fillStyle='#b8c6d3';g.fillText('› session ready',204,459);
  g.fillStyle='#284364';g.fillRect(0,488,1024,24);g.font='13px monospace';g.fillStyle='#cad9e8';g.fillText('workspace  •  local session',18,505);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;displays.set(seat,map);return map;
}

export function refineInterior({world,topOf,blocked,place,ROOMS}) {
  // Replace the lounge furniture with a tailored sofa, rug and rounded coffee table.
  for(const child of [...world.children]) {
    const name=child.userData.prop;
    if((name==='Couch_03' && Math.abs(child.position.x-11.5)<.1) ||
       ((name==='CoffeeTable_02' || name==='Book_Group_03') && Math.abs(child.position.x-13.6)<.1 && child.position.z>18) ||
       name==='Desk_06' || child.userData.receptionAccent) world.remove(child);
    if(['Sign_Receptionist_01','Laptop_01','Cup_Pens_01'].includes(name) && child.position.x>=15.9 && child.position.x<=16.8 && child.position.z>9 && child.position.z<10) child.position.y+=.065;
  }
  rug(world,12.1,18.12,3.4,1.65);
  sofa(world,12.1,17.94);
  rounded(world,[1.16,.065,.44],[12.1,.33,18.63],walnut,.035);
  for(const x of [11.63,12.57])for(const z of [18.49,18.77])rounded(world,[.055,.3,.055],[x,.16,z],metal,.012);
  for(let i=0;i<3;i++)rounded(world,[.21,.035,.27],[11.89,.38+i*.035,18.61],new THREE.MeshStandardMaterial({color:['#ad7951','#426579','#c1b793'][i],roughness:.8}),.006);
  for(const x of [10,11,12,13])blocked[18][x]=true;
  lamp(world,9.48,16.95);lamp(world,18.55,17.45);
  blocked[16][9]=true;blocked[17][18]=true;
  // Small shelves and shelves of books span the lounge's back wall around the doorway.
  for(const [x,width] of [[11.15,2.65],[16.9,2.75]]) {
    rounded(world,[width,.035,.25],[x,.91,14.15],walnut,.008);
    for(let i=0;i<17;i++)book(world,x-width/2+.16+i*.145,.93,14.18,['#54768d','#b17b4f','#6c785a','#d1ba87','#715774'][i%5],.075,.19+(i%4)*.027);
  }
  // Wood desk tops and drawers soften the original flat atlas surfaces.
  for(const [x,z,model] of [...[1,4,7,10].flatMap(x=>[8,11].map(z=>[x,z,'Desk_04'])),...[1,4,7,10,12,14,16].map(x=>[x,15,'Desk_01'])]) {
    const y=topOf(model);
    rounded(world,[1.46,.028,.81],[x+.5,y+.004,z+.55],wood,.018);
    if(z===15) {
      rounded(world,[.31,.51,.5],[x+.07,.26,z+.62],new THREE.MeshStandardMaterial({color:'#d3d0c4',roughness:.6}),.018);
      for(const h of [.17,.33,.47])rounded(world,[.14,.02,.025],[x+.07,h,z+.89],metal,.005);
    }
  }
  reception(world);
  // A framed sketch board provides another human-scale detail behind the desks.
  const boardMap=texture((g,s)=>{
    g.fillStyle='#efe9d9';g.fillRect(0,0,s,s);g.font='24px monospace';g.fillStyle='#675847';g.fillText('IDEAS & NOTES',28,40);
    for(let i=0;i<6;i++){
      const x=24+(i%3)*157,y=75+Math.floor(i/3)*160;
      g.fillStyle=['#d4d7a6','#e0ba96','#aac6d1'][i%3];g.fillRect(x,y,120,110);
      g.strokeStyle='#8d8a74';g.lineWidth=3;for(let line=0;line<4;line++){g.beginPath();g.moveTo(x+12,y+20+line*16);g.lineTo(x+99-(line%2)*18,y+20+line*16);g.stroke();}
    }
  });
  rounded(world,[.95,.66,.05],[11.35,1.27,14.55],walnut,.02);
  const board=new THREE.Mesh(new THREE.PlaneGeometry(.88,.59),new THREE.MeshStandardMaterial({map:boardMap,roughness:.9}));
  board.position.set(11.35,1.27,14.582);world.add(board);
  for(const x of [10.98,11.72])rounded(world,[.025,1.15,.025],[x,.575,14.53],metal,.004);
  blocked[14][11]=true;
  refineOtherRooms({world,topOf,blocked,place,ROOMS});
}

function refineOtherRooms({world,topOf,blocked,place,ROOMS}) {
  const prop=(name,x,z,options={})=>place(name,x,z,options.rot||0,{block:false,...options});
  const cream=new THREE.MeshStandardMaterial({color:'#d8d1c0',roughness:.76});
  const paper=new THREE.MeshStandardMaterial({color:'#efe9d9',roughness:.92});
  const brass=new THREE.MeshStandardMaterial({color:'#a78b58',metalness:.65,roughness:.4});
  const frame=(x,z,title,colour,width=1.05,y=1.28)=>{
    const map=texture((g,s)=>{
      g.fillStyle='#ece5d5';g.fillRect(0,0,s,s);g.fillStyle=colour;g.fillRect(28,28,s-56,100);
      g.font='bold 27px sans-serif';g.fillStyle='#fff';g.fillText(title,48,89);
      for(let i=0;i<5;i++){g.fillStyle=i%2?'#b4b7a6':'#c9c9b9';g.fillRect(48,165+i*53,160+(i%3)*72,12);}
    });
    rounded(world,[width,.65,.045],[x,y,z],walnut,.014);
    const face=new THREE.Mesh(new THREE.PlaneGeometry(width-.065,.585),new THREE.MeshStandardMaterial({map,roughness:.92}));
    face.position.set(x,y,z+.027);world.add(face);
  };
  const shelf=(x,z,width=1.8,y=.9)=>{
    rounded(world,[width,.04,.24],[x,y,z],walnut,.012);
    for(let i=0;i<Math.floor(width/.15)-1;i++)book(world,x-width/2+.12+i*.15,y+.025,z,['#637e84','#ab7d59','#d1bc90','#737456','#746174'][i%5],.085,.18+(i%3)*.03);
  };
  const papers=(x,y,z)=>{
    for(let i=0;i<3;i++){
      const sheet=rounded(world,[.25,.003,.19],[x+i*.008,y+i*.004,z],paper,.001);
      sheet.rotation.y=(i-1)*.06;
    }
  };
  // Server room: cable trays and ventilated equipment, rather than domestic decor.
  for(const x of [.65,1.45,3.75,4.6]) {
    rounded(world,[.58,.08,.16],[x,1.65,.42],metal,.015);
    for(let i=0;i<6;i++)rounded(world,[.4,.014,.035],[x,1.66,.37+i*.018],metal,.003);
  }
  rounded(world,[4.5,.1,.16],[2.8,1.77,.14],metal,.016);
  for(const x of [1,4.3])rounded(world,[.06,1.3,.07],[x,.7,.13],metal,.009);
  prop('FolderTray_01',2.05,3.55,{y:topOf('Desk_Standing_01'),scale:.65});
  prop('Computer_Keyboard_01',2.5,3.7,{y:topOf('Desk_Standing_01')+.012,scale:.75});
  frame(5.12,.19,'EQUIPMENT','#546571',.65,1.26);
  // Library: warm reading pool, timber tabletop and individual loose books.
  rug(world,8.95,3.65,3.25,2.65);
  rounded(world,[1.65,.03,.87],[9,topOf('Table_01')+.008,3.5],wood,.025);
  lamp(world,6.45,4.15);blocked[4][6]=true;
  prop('Desklamp_01',9.65,3.35,{y:topOf('Table_01')+.025,scale:.7});
  papers(9.3,topOf('Table_01')+.03,3.67);
  frame(10.5,.19,'READ & DISCOVER','#6f7c61',1.1,1.5);
  // War room: table runner, briefing folders and a shared agenda board.
  const conference=topOf('Table_Conference_02');
  const meetingTop=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.026,64),walnut);
  meetingTop.scale.set(1.6,1,.6);meetingTop.position.set(16.5,conference+.009,3);
  meetingTop.castShadow=meetingTop.receiveShadow=true;world.add(meetingTop);
  rounded(world,[1.6,.008,.27],[16.5,conference+.028,3],textile,.006);
  for(const x of [15.8,16.5,17.2]){
    papers(x,conference+.038,3.25);
    prop('Cup_Pens_01',x,2.7,{y:conference+.03,scale:.5});
  }
  frame(18.1,.2,'WEEKLY AGENDA','#647b89',1.2,1.28);
  shelf(13.5,.25,1.3,.83);
  // Proof studio: absorptive panels, equipment case and a production desk.
  const felt=new THREE.MeshStandardMaterial({color:'#41454a',bumpMap:weave,bumpScale:.008,roughness:1});
  for(const x of [21.55,25.45])for(let i=0;i<3;i++)rounded(world,[.44,.34,.06],[x,.5+i*.37,.15],felt,.016);
  rounded(world,[1.08,.39,.5],[25.1,.21,5.4],metal,.028);blocked[5][25]=true;
  for(const x of [24.7,25.5])rounded(world,[.065,.13,.025],[x,.29,5.66],brass,.008);
  rounded(world,[.9,.04,.5],[21.7,.72,4.9],wood,.02);
  for(const x of [21.35,22.05])rounded(world,[.045,.7,.045],[x,.36,4.9],metal,.008);
  prop('Laptop_01',21.7,4.9,{y:.745,scale:.7});blocked[4][21]=true;
  frame(22.15,.19,'ON SET','#8d706c',.65,1.5);
  // Ship dock: restrained industrial storage and painted safety markings.
  for(const z of [.6,5.65])for(let i=0;i<8;i++){
    const stripe=rounded(world,[.17,.008,.3],[27+i*.48,.015,z],textile,.001);stripe.rotation.y=-.55;
  }
  rounded(world,[1,.46,.48],[26.7,.24,.55],metal,.025);blocked[0][26]=true;
  for(const x of [26.42,26.98])rounded(world,[.035,.13,.035],[x,.27,.8],brass,.004);
  frame(27.4,.19,'DISPATCH','#766d55',1.05,1.32);
  // Build floor: overhead books, team boards, desktop pads and cabinet finishes.
  for(const x of [2.5,6.5,10.5])shelf(x,7.17,1.65,.82);
  for(const x of [1,4,7,10])for(const z of [8,11]){
    papers(x+.6,topOf('Desk_04')+.025,z+.8);
    rounded(world,[.38,.48,.48],[x+.05,.25,z+.55],cream,.02);
    for(const y of [.15,.3,.44])rounded(world,[.16,.017,.025],[x+.05,y,z+.8],metal,.004);
  }
  frame(5.1,7.18,'TEAM NOTES','#687c72',1.1,.63);
  // Lobby: a soft waiting-area rug and framed wall art around the reception.
  rug(world,14.2,11.2,2.1,2.45);lamp(world,13.5,12.5);blocked[12][13]=true;
  frame(17.55,7.2,'WELCOME','#8b735b',1.05,.65);
  // Break room: tailored upholstered seating, side table and menu art.
  for(const child of [...world.children])if(child.userData.prop==='Couch_03'&&child.position.x>29)world.remove(child);
  rug(world,29.95,12.05,3.5,1.7);sofa(world,29.95,12.1);
  for(const x of [29,30,31])blocked[12][x]=true;
  lamp(world,28.7,12.3);blocked[12][28]=true;
  frame(20.7,7.19,'COFFEE & BREAKS','#897658',1.3,.75);
  for(const x of [19.4,20.05])rounded(world,[.58,.025,.43],[x,topOf('Kitchen_Counter_01')+.005,7.4],wood,.012);
  prop('Coffee_Tray_01_Full',20.05,7.4,{y:topOf('Kitchen_Counter_01')+.025,scale:.7});
  // Bot wing: notebooks, shelving and a small meeting corner without new seats.
  shelf(3.8,14.18,2,.85);shelf(6.65,14.18,1.8,.85);
  frame(1.5,14.2,'TEAM WORKSPACE','#79677c',1,.68);
  rug(world,2.2,18.1,2.5,1.4);
  rounded(world,[.85,.06,.47],[2.3,.38,18.1],walnut,.035);
  for(const x of [2.02,2.58])rounded(world,[.045,.36,.045],[x,.19,18.1],metal,.006);
  papers(2.3,.415,18.1);blocked[18][2]=true;
  // Vault: steel lockboxes and labelled archive folders instead of more windows.
  for(const x of [20,24.3]){
    rounded(world,[.5,.6,.48],[x,.31,17.2],metal,.025);blocked[17][Math.floor(x)]=true;
    rounded(world,[.08,.19,.025],[x,.36,17.45],brass,.012);
    rounded(world,[.24,.065,.012],[x,.53,17.46],paper,.004);
  }
  frame(23.7,14.2,'ARCHIVE INDEX','#676f70',.85,.73);
  // Security: curved-edge worktop, document tray and equipment shelf.
  const guard=topOf('Desk_04');
  rounded(world,[1.9,.028,.72],[28.5,guard+.009,15.5],walnut,.022);
  prop('Computer_Keyboard_01',28.5,15.78,{y:guard+.03,scale:.75});
  prop('FolderTray_01',29.1,15.55,{y:guard+.03,scale:.7});
  prop('Cup_Pens_01',27.9,15.45,{y:guard+.03,scale:.65});
  shelf(30.9,14.2,.95,.85);
  frame(26,14.2,'SECURITY','#626f79',.7,.7);
  // Record the art pass on every room for browser verification and future refinements.
  for(const room of ROOMS)room.detailPass='tailored-interior';
}

// Low-frequency real office camera thumbnails; no extra renders in the mobile preset.
export class SecurityViews {
  constructor(renderer,scene,materials) {
    this.renderer=renderer;this.scene=scene;this.materials=materials;this.enabled=true;this.next=0;this.last=-10;
    this.views=[
      [[6,6,14],[6,.4,9]],[[14,6,22],[14,.5,16]],[[3,5,8],[3,.5,2]],
      [[27,6,16],[26,.4,10]],[[22,5,22],[22,.5,16]],[[16,6,16],[16,.6,9]],
    ].map(([position,target])=>{
      const camera=new THREE.PerspectiveCamera(44,192/108,.1,100);camera.position.set(...position);camera.lookAt(...target);
      return {camera,target:new THREE.WebGLRenderTarget(192,108,{depthBuffer:true})};
    });
  }
  update(time,mainCamera) {
    if(!this.enabled || time-this.last<1.5) return;
    // Populate six stills once, then refresh only while the security station is nearby.
    if(this.next>=6 && mainCamera.position.distanceTo(new THREE.Vector3(28.5,1,16))>16) return;
    const index=this.next++%this.views.length,view=this.views[index],renderer=this.renderer;
    const previous=renderer.getRenderTarget(),auto=renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate=false;renderer.setRenderTarget(view.target);renderer.render(this.scene,view.camera);
    renderer.setRenderTarget(previous);renderer.shadowMap.autoUpdate=auto;
    const material=this.materials[index];material.emissive.set('#ffffff');material.emissiveMap=view.target.texture;
    material.emissiveIntensity=.8;material.userData.securityView=true;material.needsUpdate=true;
    this.last=time;
  }
}

// Add distinct hair silhouettes to the existing rig instead of generating static portraits.
export function styleHair(model,look) {
  const style={hermes:['#352c27',true],openclaw:['#252629',false],cortex:['#49302b',true],zero:['#25252a',false]}[look];
  if(!style)return;
  model.updateMatrixWorld(true);let head;model.traverse(o=>{if(o.isBone&&o.name==='head')head=o;});if(!head)return;
  const origin=head.getWorldPosition(new THREE.Vector3());
  const scale=head.getWorldScale(new THREE.Vector3()).x;
  const geometries=[];
  // A complete cap covers the stock hair; curls add silhouette rather than isolated dots.
  const capCentre=head.worldToLocal(origin.clone().add(new THREE.Vector3(0,.08,-.01)));
  const cap=new THREE.SphereGeometry(.17/scale,24,12,0,Math.PI*2,0,Math.PI*.5);
  cap.scale(1,.72,.92);
  const rotation=head.getWorldQuaternion(new THREE.Quaternion()).invert();
  cap.applyQuaternion(rotation);cap.translate(capCentre.x,capCentre.y,capCentre.z);geometries.push(cap);
  for(let i=0;i<(style[1]?22:12);i++) {
    const angle=i*2.39996,ring=Math.sqrt(i/(style[1]?22:12));
    const delta=new THREE.Vector3(Math.cos(angle)*ring*.14,.095+Math.sqrt(1-ring*ring)*.07,Math.sin(angle)*ring*.12);
    const centre=head.worldToLocal(origin.clone().add(delta));
    const geo=new THREE.SphereGeometry((style[1]?.042:.047)/scale,10,8);
    geo.translate(centre.x,centre.y,centre.z);geometries.push(geo);
  }
  const hair=new THREE.Mesh(mergeGeometries(geometries),new THREE.MeshStandardMaterial({color:style[0],roughness:.86}));
  for(const geometry of geometries)geometry.dispose();
  hair.castShadow=hair.receiveShadow=true;hair.userData.officeAccessory=true;head.add(hair);
}
