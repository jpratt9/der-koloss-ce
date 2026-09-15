// WeaponRig's ADS solve: where an aimed weapon is held, and the stock that
// slides back past the lens as it comes up.
// Methods of WeaponRig: js/weapons/rig.js copies them onto WeaponRig.prototype.

// ---- ADS depth ------------------------------------------------------------
// The authored ADS depth: how far out in front of the lens a weapon is held
// when it is HELD rather than shouldered. Right for a pistol at arm's length,
// where the frame really does end two hands away from your face.
const ADS_HELD_Z = -0.26;
// A cheek weld. Shouldering a weapon puts the thing you look through about this
// far from your eye — and puts the butt PAST your cheek, behind the lens, where
// the near plane hides it. Holding a rifle out at arm's length instead is what
// left the buttpad of every shouldered weapon in the middle of the screen with
// the stock filling the bottom third of the frame.
const ADS_EYE_RELIEF = 0.095;
// A weapon that reaches further than this behind the thing you look through has
// a stock on it, and goes to the shoulder. Measured rather than declared by
// class: the Wunderwaffe is a `wonder` and the Panzerschreck a `launcher`, and
// both are shouldered, while the Ray Gun of the same class is not.
const ADS_STOCK_REACH = 0.10;
// How close anything that CANNOT be tucked out of the way may come to the lens.
// The eye a real cheek weld puts 95mm behind a rear sight is not a 58-degree
// rectilinear camera: solved outright, the Gewehr 43's receiver lands 13mm off
// the lens — a millimetre outside the near plane, sliced open — and the
// Browning's carry handle covers a third of the screen. Each weapon closes as
// far as its own back end allows and no further, which is why the Type 100 gets
// most of a cheek weld while the AK-74u, with a receiver cover reaching almost
// to its own dot, keeps its distance.
const ADS_FACE_CLEAR = 0.05;
// Clearance behind the lens for a stock that has gone to the shoulder. The near
// plane does the hiding; this is just far enough past it to stay hidden through
// the bob and the recoil settle. See WeaponRig.tuckStock().
const ADS_BUTT_CLEAR = 0.02;

export class WeaponRigAds {
  /**
   * Tell the rig which lens the viewmodel is filmed through.
   *
   * game.js re-parents the rig under a node that scales it and pushes it out so
   * the narrow viewmodel FOV does not double the weapon's apparent size. The
   * ADS pose has to solve for distances measured from the EYE, so it needs that
   * transform: camera-space z of an authored z is `offsetZ + scale * z`.
   */
  setViewLens(scale, offsetZ) {
    this.viewScale = scale || 1;
    this.viewOffsetZ = offsetZ || 0;
    if (this.current) this.current.adsZ = undefined;   // re-solve on the next frame
  }

  /**
   * The ADS depth for the equipped weapon, in the authored frame.
   *
   * One hardcoded number used to serve all 31 weapons, and it held every one of
   * them out at arm's length. Nobody aims a rifle at arm's length: you bring it
   * to your shoulder, which puts the rear sight a hand's width from your eye and
   * the butt BEHIND your cheek. Held out in front instead, the sight ended up
   * half a metre away — too small to aim with — and the stock, which should have
   * been behind the lens entirely, filled the bottom third of the frame.
   *
   * So solve for the cheek weld: put whatever you look THROUGH an eye-relief in
   * front of the lens. Weapons with nothing behind their sights — the pistols,
   * the Ray Gun, the knife — have no shoulder to come back to and keep the pose
   * they were authored with.
   *
   * But BOUND how far that travels by what is left behind the sight, because the
   * eye a real cheek weld puts 95mm behind a rear sight is not a 58-degree
   * rectilinear camera. Solved outright, an AK-74u comes back far enough to put
   * its receiver cover 2cm off the lens: the dot is lovely and the whole bottom
   * half of the screen is a foreshortened chrome slab of the gun's own backside,
   * which is no more aimable than the buttpad it replaced. The butt is not what
   * has to move to fix that — see tuckStock() — so each weapon closes only as
   * far as its own back end allows, and a weapon whose back end is clear (the
   * Type 100, the MP40) gets the whole cheek weld.
   */
  adsDepth(entry) {
    const { aimZ, rearZ, faceZ } = entry.group.userData;
    // Camera-space z of an authored z is `viewOffsetZ + viewScale * z`; solve
    // that for the depth landing a given authored z a given distance out.
    const depthFor = (z, dist) => (-dist - this.viewOffsetZ) / this.viewScale - z;
    const shouldered = aimZ != null && rearZ != null && rearZ - aimZ > ADS_STOCK_REACH;
    const depth = shouldered ? depthFor(aimZ, ADS_EYE_RELIEF) : ADS_HELD_Z;
    if (faceZ == null) return depth;
    return Math.min(depth, depthFor(faceZ, ADS_FACE_CLEAR));
  }

  /**
   * Send the buttstock to the shoulder as the weapon comes up.
   *
   * A shouldered stock is behind your cheek, so nothing of it should be on
   * screen — but the rig has no head, and dragging the whole weapon back far
   * enough to hide the butt puts the receiver on the lens instead, which reads
   * as a foreshortened close-up of the gun's own backside and is no easier to
   * aim than the buttpad was. Moving only the stock costs nothing in the sight
   * picture and is what the eye expects to see anyway.
   *
   * It slides straight down the view axis, away from the eye, so on screen it
   * only recedes — and it does not start until the weapon is a third of the way
   * up, which keeps the hip pose exactly as authored.
   */
  tuckStock(g, depth, t) {
    const tuck = g.userData.adsTuck;
    if (!tuck?.length) return;
    const ramp = Math.max(0, Math.min(1, (t - 0.34) / 0.66));
    const clear = (ADS_BUTT_CLEAR - this.viewOffsetZ) / this.viewScale;
    for (const { node, baseZ, frontZ } of tuck) {
      node.position.z = baseZ + ramp * Math.max(0, clear - frontZ - depth);
    }
  }
}
