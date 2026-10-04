// Furnish the existing rooms without changing their seats, doors or walkable cells.
export const DETAIL_PROPS = 'Book_Group_01 Book_Group_03 Folder_Holder_01 FolderTray_01 Laptop_01 Cup_Pens_01 Desklamp_01 Computer_Mousepad_01 Computer_Mouse_01 Kitchen_CounterSink_Dishes_01 Microwave_01 Toaster_01 Dishes_01 Cake_01 Coffee_Tray_01_Full CorkBoard_01 CoatRack_01 Fire_Extinguisher_01 Cart_01 Rug_01'.split(' ');

// Colour clothing through the skeleton's torso weights, preserving faces, hair and hands.
export function dressHuman(THREE, model, look) {
  const colours = { hermes: '#357fbd', openclaw: '#bf4e32', cortex: '#8158a6', zero: '#343941', jarvis: '#3e4147' };
  if (!colours[look]) return;
  const colour = new THREE.Color(colours[look]);
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry.clone(), indices = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
    if (!indices || !weights) return;
    const values = new Float32Array(indices.count * 4);
    for (let i = 0; i < indices.count; i++) {
      let torso = 0;
      for (let j = 0; j < 4; j++) {
        const bone = mesh.skeleton.bones[indices.getComponent(i,j)];
        if (bone && /spine|clavicle|upperarm/i.test(bone.name)) torso += weights.getComponent(i,j);
      }
      values.set([colour.r,colour.g,colour.b,Math.min(1,Math.max(0,(torso-.35)/.45))],i*4);
    }
    geometry.setAttribute('wardrobe',new THREE.BufferAttribute(values,4)); mesh.geometry = geometry;
    mesh.userData.officeWardrobe = true;
    const restyle = original => {
      const material = original.clone();
      material.onBeforeCompile = shader => {
        shader.vertexShader = 'attribute vec4 wardrobe; varying vec4 vWardrobe;\n' + shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWardrobe = wardrobe;');
        shader.fragmentShader = 'varying vec4 vWardrobe;\n' + shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat clothShade = clamp(dot(diffuseColor.rgb,vec3(.299,.587,.114))*1.5,.5,1.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb,vWardrobe.rgb*clothShade,vWardrobe.a);');
      };
      material.customProgramCacheKey = () => 'human-wardrobe-v1'; return material;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(restyle) : restyle(mesh.material);
  });
}

export function disposeHuman(model) {
  model.traverse(mesh => {
    if (mesh.userData.officeAccessory) { mesh.geometry.dispose(); mesh.material.dispose(); }
    if (mesh.userData.officeWardrobe) {
      mesh.geometry.dispose();
      for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) material.dispose();
    }
    if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
  });
}

// Seat animations supply the legs and breathing; two-bone arm posing adds typing.
export function typeAtDesk(THREE, agent, time) {
  if (agent.mode !== 'sit' || agent.animName !== 'work' || !['working','thinking'].includes(agent.status)) return;
  const body = agent.body;
  if (!body.typingArms) {
    const bones = new Map(); body.model.traverse(o => { if (o.isBone) bones.set(o.name,o); });
    body.typingArms = ['L','R'].map(side => ({
      upper: bones.get('UpperArm_'+side), elbow: bones.get('lowerarm_'+side.toLowerCase()), hand: bones.get('Hand_'+side), side: side === 'L' ? 1 : -1,
    })).filter(a => a.upper && a.elbow && a.hand);
  }
  const position = bone => bone.getWorldPosition(new THREE.Vector3());
  const pointBone = (bone, child, target) => {
    const origin = position(bone), current = position(child).sub(origin).normalize(), next = target.clone().sub(origin).normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(current,next);
    const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(turn);
    bone.quaternion.copy(parent.invert().multiply(world)); bone.updateMatrixWorld(true);
  };
  body.model.updateMatrixWorld(true);
  for (const arm of body.typingArms) {
    const shoulder = position(arm.upper), elbow = position(arm.elbow), hand = position(arm.hand);
    const l1 = shoulder.distanceTo(elbow), l2 = elbow.distanceTo(hand);
    const target = agent.group.localToWorld(new THREE.Vector3(arm.side*.17,.79 + Math.sin(time*12+arm.side)*.008,.45));
    const axis = target.clone().sub(shoulder), distance = Math.min(l1+l2-.003,Math.max(Math.abs(l1-l2)+.003,axis.length())); axis.normalize();
    target.copy(shoulder).addScaledVector(axis,distance);
    const pole = agent.group.localToWorld(new THREE.Vector3(arm.side*.35,.75,.15)).sub(shoulder);
    pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along = (l1*l1-l2*l2+distance*distance)/(2*distance);
    const bend = Math.sqrt(Math.max(0,l1*l1-along*along));
    const desiredElbow = shoulder.clone().addScaledVector(axis,along).addScaledVector(pole,bend);
    pointBone(arm.upper,arm.elbow,desiredElbow); pointBone(arm.elbow,arm.hand,target);
  }
}

export function furnishInterior({ THREE, world, place, topOf, detailBox, std, ROOMS }) {
  const prop = (name, x, z, opts = {}) => {
    const group = place(name, x, z, opts.rot || 0, { block: false, ...opts });
    if (opts.tint) group.traverse(mesh => {
      if (!mesh.isMesh) return;
      const tint = m => { const n = m.clone(); n.color.set(opts.tint); return n; };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
    });
    return group;
  };
  // Books, folders and personal objects make every workstation different.
  for (const [x, z, desk] of [
    ...[8, 11].flatMap(z => [1, 4, 7, 10].map(x => [x, z, 'Desk_04'])),
    ...[1, 4, 7, 10, 12, 14, 16].map(x => [x, 15, 'Desk_01']),
  ]) {
    const y = topOf(desk);
    prop('Desklamp_01', x + .13, z + .36, { y, scale: .65 });
    prop('Cup_Pens_01', x + .82, z + .27, { y, scale: .75 });
    prop('Computer_Mousepad_01', x + .84, z + .8, { y: y + .006, scale: .75 });
    prop('Computer_Mouse_01', x + .84, z + .8, { y: y + .014, scale: .75 });
    prop('FolderTray_01', x + .07, z + .82, { y, scale: .65 });
  }
  // Wall-to-wall library shelving, with multicoloured books on every shelf.
  for (const x of [6.5, 7.5, 8.5, 9.5, 10.5, 11.5]) {
    if (x > 8.5) prop('Shelf_05', x, .36);
    for (const y of [.3, .64, .99]) prop(x % 2 ? 'Book_Group_01' : 'Book_Group_03', x, .55, { y, scale: .8 });
    prop('Plant_01', x, .35, { y: 1.32, scale: .38 });
    // Individual coloured spines avoid a repeated white-book texture at close range.
    for (const y of [.29,.68,1.08]) for (let i=0;i<8;i++) {
      detailBox(.055,.17+(i%3)*.025,.13,['#476c80','#b06648','#879166','#dbc38a','#514c64'][i%5],x-.27+i*.075,y+.1,.64);
    }
  }
  for (const [x,z] of [[8.6,3.5],[9.4,3.5],[15.8,3],[17.2,3]]) {
    const y = topOf(z === 3 ? 'Table_Conference_02' : 'Table_01');
    prop('Laptop_01', x, z, { y, scale: .75 });
    prop('Book_Group_03', x + .2, z + .2, { y, scale: .38 });
  }
  // Reception desk accessories and a comfortable seating area.
  const reception = topOf('Desk_06');
  prop('Laptop_01', 16, 9.3, { y: reception, rot: 2 });
  prop('Cup_Pens_01', 16.7, 9.45, { y: reception });
  prop('CoatRack_01', 18.5, 8.25);
  prop('Book_Group_03', 14.6, 11.2, { y: topOf('CoffeeTable_02'), scale: .55 });
  // Lounge sofa, coffee table and shelves keep the four live desks intact.
  prop('Couch_03', 11.5, 18.45, { rot: 2, tint: '#c68b5b', block: true, cells: [[10,18],[11,18],[12,18]] });
  prop('CoffeeTable_02', 13.6, 18.4, { block: true });
  prop('Book_Group_03', 13.6, 18.4, { y: topOf('CoffeeTable_02'), scale: .55 });
  for (const x of [9.6,18.45]) {
    prop('Shelf_06', x, 14.45, { scale: .8 });
    for (const y of [.24,.6,.94]) prop('Book_Group_01', x, 14.5, { y, scale: .65 });
    prop('Plant_01', x, 14.5, { y: 1.15, scale: .38 });
  }
  // Fully equipped kitchenette; table food is part of the furniture, not a fake agent.
  // Use the side wall so the hallway door at (24,7) remains unobstructed.
  prop('Kitchen_CounterSink_Dishes_01', 31.35, 9.5, { rot: 3, block: true });
  prop('Kitchen_Counter_01', 31.35, 10.8, { rot: 3, block: true });
  prop('Microwave_01', 31.35, 10.5, { y: topOf('Kitchen_Counter_01'), rot: 3, scale: .75 });
  prop('Toaster_01', 31.35, 11.1, { y: topOf('Kitchen_Counter_01'), rot: 3, scale: .75 });
  for (const z of [9.5,11.6]) {
    prop('Dishes_01', 23.5, z, { y: topOf('Table_Round_02'), scale: .65 });
    prop('Cake_01', 23.6, z, { y: topOf('Table_Round_02'), scale: .6 });
  }
  // Archive shelves and a utility cart, like the reference's vault.
  for (const x of [19.5,24.4]) {
    prop('Shelf_06', x, 15.6, { rot: x < 22 ? 1 : 3, scale: .8, block: true });
    for (const y of [.25,.65,1]) prop('Folder_Holder_01', x, 15.6, { y, scale: .7 });
  }
  prop('Cart_01', 23.8, 17.65, { block: true });
  prop('CardboardBox_01', 23.8, 17.65, { y: .48, scale: .6 });
  // Warm wall caps and door jambs add thickness to the cutaway architecture.
  for (const r of ROOMS) {
    prop('Plant_04', r.x + .4, r.z + r.d - .5, { scale: .75, block: true });
    if (r.z === 0) {
      prop('Clock_01', r.x + r.w - .7, .19, { y: 1.35, scale: .7 });
      prop('Poster_01', r.x + .75, .18, { y: .9, scale: .7 });
    }
    const plaque = document.createElement('div');
    plaque.className = 'room-sign'; plaque.textContent = r.name;
    document.getElementById('labels').appendChild(plaque);
    r.sign = plaque; r.signPosition = new THREE.Vector3(r.x + r.w / 2, r.z === 0 ? 2.03 : 1.16, r.z + .13);
  }
  // Keep the corridors clear: ornaments are attached to their room-side edge.
  for (const [x,z] of [[.18,7.7],[19.18,8.1],[25.18,17.5]]) prop('Fire_Extinguisher_01', x, z, { y: .35, scale: .75 });
  for (const r of ROOMS) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(r.w-.2,.045,.2), std('#d9c9b1'));
    trim.position.set(r.x+r.w/2, r.z === 0 ? 1.96 : .79, r.z); world.add(trim);
  }
}
