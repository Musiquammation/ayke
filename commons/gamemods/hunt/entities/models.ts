import * as THREE from 'three';

/* -------------------------------------------------------------------------- */
/* three.js helpers shared by the entity models.                              */
/*                                                                            */
/* Game coordinates: x to the right, y down the screen, z = altitude.         */
/* three.js coordinates: (x, -y, z), so the camera keeps a right-handed frame */
/* while looking straight down with +y up on the screen.                      */
/* -------------------------------------------------------------------------- */

/** Place an object at a game position. */
export function place(o: THREE.Object3D, x: number, y: number, z: number) {
	o.position.set(x, -y, z);
}

/** three.js rotation around the vertical axis for a game angle (y down). */
export function yaw(angle: number) {
	return -angle;
}

/** Build a value once, on first use (keeps the server from creating GPU resources). */
function lazy<T>(make: () => T) {
	let value: T | undefined;
	return () => value ??= make();
}

const solidMaterials = new Map<string, THREE.MeshStandardMaterial>();

/** Shared opaque material of a color (never disposed: there are only a few). */
export function solid(color: string, emissive = 0) {
	const key = `${color}/${emissive}`;
	let m = solidMaterials.get(key);
	if (!m) {
		m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
		if (emissive > 0) {
			m.emissive.set(color);
			m.emissiveIntensity = emissive;
		}
		solidMaterials.set(key, m);
	}
	return m;
}

/** A transparent material owned by one model (disposed with it, see `disposeOwned`). */
export function ownedTransparent(color: string, opacity: number) {
	const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
	m.userData.owned = true;
	return m;
}

/** Free the GPU resources of the materials/geometries flagged as owned by this model. */
export function disposeOwned(root: THREE.Object3D) {
	root.traverse(o => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh)
			return;
		if (mesh.geometry.userData.owned)
			mesh.geometry.dispose();
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const m of mats) {
			if (m.userData.owned)
				m.dispose();
		}
	});
}

// Shared geometries (unit sized, scaled by the meshes)
export const unitSphere = lazy(() => new THREE.SphereGeometry(1, 18, 12));
export const unitBox = lazy(() => new THREE.BoxGeometry(1, 1, 1));
/** Vertical cylinder of radius 1 and height 1, centered (axis = z). */
export const unitCylinder = lazy(() => new THREE.CylinderGeometry(1, 1, 1, 28).rotateX(Math.PI / 2));
export const unitOctahedron = lazy(() => new THREE.OctahedronGeometry(1));
/** Flat ring lying on the ground (inner radius 0.82, outer radius 1). */
export const unitRing = lazy(() => new THREE.RingGeometry(0.82, 1, 40));
