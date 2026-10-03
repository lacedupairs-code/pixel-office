// Rest-relative retargeting: plays an animation made for one skeleton on another, even when the
// two skeletons' bones point different ways (Quaternius's Rigify-style rig → Synty's UE-style rig).
//
// For every frame and mapped bone: how much the source bone has turned in world space since its
// rest pose is applied to the target bone's own rest pose, then turned back into a local rotation
// under the target's (already posed) parent. The hips also move: the source's hip offset from rest,
// scaled by the ratio of hip heights. The result is an ordinary AnimationClip for the target.
import * as THREE from "three";

export const UAL_TO_SYNTY = {
  Pelvis: "DEF-hips", spine_01: "DEF-spine.001", spine_02: "DEF-spine.002", spine_03: "DEF-spine.003", neck_01: "DEF-neck", head: "DEF-head",
  clavicle_l: "DEF-shoulder.L", UpperArm_L: "DEF-upper_arm.L", lowerarm_l: "DEF-forearm.L", Hand_L: "DEF-hand.L",
  clavicle_r: "DEF-shoulder.R", UpperArm_R: "DEF-upper_arm.R", lowerarm_r: "DEF-forearm.R", Hand_R: "DEF-hand.R",
  Thigh_L: "DEF-thigh.L", calf_l: "DEF-shin.L", Foot_L: "DEF-foot.L", ball_l: "DEF-toe.L",
  Thigh_R: "DEF-thigh.R", calf_r: "DEF-shin.R", Foot_R: "DEF-foot.R", ball_r: "DEF-toe.R",
  thumb_01_l: "DEF-thumb.01.L", thumb_02_l: "DEF-thumb.02.L", thumb_03_l: "DEF-thumb.03.L",
  thumb_01_r: "DEF-thumb.01.R", thumb_02_r: "DEF-thumb.02.R", thumb_03_r: "DEF-thumb.03.R",
  indexFinger_01_l: "DEF-f_index.01.L", indexFinger_02_l: "DEF-f_index.02.L", indexFinger_03_l: "DEF-f_index.03.L",
  indexFinger_01_r: "DEF-f_index.01.R", indexFinger_02_r: "DEF-f_index.02.R", indexFinger_03_r: "DEF-f_index.03.R",
  finger_01_l: "DEF-f_middle.01.L", finger_02_l: "DEF-f_middle.02.L", finger_03_l: "DEF-f_middle.03.L",
  finger_01_r: "DEF-f_middle.01.R", finger_02_r: "DEF-f_middle.02.R", finger_03_r: "DEF-f_middle.03.R",
};

const findBones = (root) => { const m = new Map(); root.traverse((o) => { if (o.isBone) m.set(o.name, o); }); return m; };

/**
 * @param target  the target character's root object (bind pose, standing, facing +Z)
 * @param source  the source rig's root object (glTF scene)
 * @param sourceClips  the source's AnimationClips
 * @param opts  { names: targetBone → sourceBone, restClip: name of a source clip whose first frame is the rest pose, hip: target hip name, fps, clips: names to convert }
 * @returns Map name → AnimationClip for the target
 */
export function retargetClips(target, source, sourceClips, opts) {
  const names = opts.names, fps = opts.fps || 30, hipName = opts.hip || "Pelvis";
  const tBones = findBones(target), sBones = findBones(source);
  // the glTF loader strips "." from node names ("DEF-spine.001" becomes "DEF-spine001")
  const sName = (n) => (sBones.has(n) ? n : THREE.PropertyBinding.sanitizeNodeName(n));
  const pairs = Object.entries(names).filter(([t, s]) => tBones.has(t) && sBones.has(sName(s))).map(([t, s]) => ({ t: tBones.get(t), s: sBones.get(sName(s)) }));
  if (opts.debug) opts.debug(`retarget: ${pairs.length} of ${Object.keys(names).length} bones paired`);
  // target bones parent-first, so each parent is posed before its children
  const order = []; target.traverse((o) => { if (o.isBone) order.push(o); });
  const pairOf = new Map(pairs.map((p) => [p.t, p]));
  const restLocal = new Map(order.map((b) => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));

  // rest poses (world)
  target.updateMatrixWorld(true);
  const tRestW = new Map(pairs.map((p) => [p.t, p.t.getWorldQuaternion(new THREE.Quaternion())]));
  const tHip = tBones.get(hipName), tHipRest = tHip.getWorldPosition(new THREE.Vector3());
  const mixer = new THREE.AnimationMixer(source);
  const rest = sourceClips.find((c) => c.name === opts.restClip);
  // read the rest pose while the rest clip is still holding it: once an action stops, the mixer
  // puts the bones back as it found them, which is whatever an earlier call left behind
  const restAction = rest ? mixer.clipAction(rest) : null;
  if (restAction) { restAction.play(); mixer.setTime(0); }
  source.updateMatrixWorld(true);
  const sRestW = new Map(pairs.map((p) => [p.s, p.s.getWorldQuaternion(new THREE.Quaternion())]));
  const sHip = sBones.get(sName(names[hipName])), sHipRest = sHip.getWorldPosition(new THREE.Vector3());
  if (restAction) restAction.stop();
  const ratio = tHipRest.y / Math.max(1e-6, sHipRest.y);

  const out = new Map();
  const q = new THREE.Quaternion(), pw = new THREE.Quaternion(), v = new THREE.Vector3(), inv = new THREE.Matrix4();
  for (const clip of sourceClips) {
    if (opts.clips && !opts.clips.includes(clip.name)) continue;
    const action = mixer.clipAction(clip); action.reset().play();
    const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(frames);
    const qv = new Map(pairs.map((p) => [p.t, new Float32Array(frames * 4)]));
    const hipPos = new Float32Array(frames * 3);
    for (let f = 0; f < frames; f++) {
      const t = Math.min(clip.duration, f / fps); times[f] = t;
      mixer.setTime(t); source.updateMatrixWorld(true);
      for (const b of order) {
        const p = pairOf.get(b);
        if (!p) { b.quaternion.copy(restLocal.get(b).q); b.position.copy(restLocal.get(b).p); b.updateMatrixWorld(true); continue; }
        // world rotation: (source now) * (source rest)^-1 * (target rest)
        p.s.getWorldQuaternion(q).multiply(sRestW.get(p.s).clone().invert()).multiply(tRestW.get(b));
        b.parent.getWorldQuaternion(pw);
        b.quaternion.copy(pw.invert().multiply(q));
        if (b === tHip) {
          v.copy(sHip.getWorldPosition(new THREE.Vector3()).sub(sHipRest).multiplyScalar(ratio)).add(tHipRest);
          b.parent.updateMatrixWorld(true); inv.copy(b.parent.matrixWorld).invert(); v.applyMatrix4(inv);
          if (opts.inPlace) { const r = restLocal.get(b).p; v.x = r.x; v.z = r.z; } // stay over the spot (walk cycles)
          b.position.copy(v); v.toArray(hipPos, f * 3);
        }
        b.updateMatrixWorld(true);
        b.quaternion.toArray(qv.get(b), f * 4);
      }
    }
    action.stop();
    const tracks = [...qv.entries()].map(([b, vals]) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, vals));
    tracks.push(new THREE.VectorKeyframeTrack(`${tHip.name}.position`, times, hipPos));
    out.set(clip.name, new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  // leave the source as we found it for the next character, and the target in its bind pose
  mixer.stopAllAction(); mixer.uncacheRoot(source);
  for (const b of order) { b.quaternion.copy(restLocal.get(b).q); b.position.copy(restLocal.get(b).p); }
  target.updateMatrixWorld(true);
  return out;
}
