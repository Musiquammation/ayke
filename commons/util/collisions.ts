export namespace collisions {
	export interface Circle {
		x: number; // Center X
		y: number; // Center Y
		r: number;
	}

	export interface Rect {
		x: number; // Center X
		y: number; // Center Y
		w: number;
		h: number;
	}

	export interface RotatedRect {
		x: number; // Center X
		y: number; // Center Y
		w: number;
		h: number;
		angle: number; // Rotation angle in radians
	}

	export interface RoundedRect {
		x: number; // Center X
		y: number; // Center Y
		w: number;
		h: number;
		radius: number;
	}

	export interface RotatedRoundedRect {
		x: number; // Center X
		y: number; // Center Y
		w: number;
		h: number;
		radius: number;
		a: number;
	}

	// ==========================================
	// EXISTING COLLISIONS
	// ==========================================

	export function RectCircle(rect: Rect, circle: Circle) {
		const distX = Math.abs(circle.x - rect.x);
		const distY = Math.abs(circle.y - rect.y);

		if (distX > rect.w / 2 + circle.r) return false;
		if (distY > rect.h / 2 + circle.r) return false;

		if (distX <= rect.w / 2) return true;
		if (distY <= rect.h / 2) return true;

		const dx = distX - rect.w / 2;
		const dy = distY - rect.h / 2;

		return dx * dx + dy * dy <= circle.r * circle.r;
	}

	export function RectRect(a: Rect, b: Rect) {
		const dx = Math.abs(a.x - b.x);
		const dy = Math.abs(a.y - b.y);

		return dx <= (a.w + b.w) / 2 &&
			   dy <= (a.h + b.h) / 2;
	}

	export function RoundedRectCircle(rect: RoundedRect, circle: Circle) {
		const innerW = Math.max(0, rect.w / 2 - rect.radius);
		const innerH = Math.max(0, rect.h / 2 - rect.radius);

		const distX = Math.abs(circle.x - rect.x);
		const distY = Math.abs(circle.y - rect.y);

		const clampX = Math.max(0, distX - innerW);
		const clampY = Math.max(0, distY - innerH);

		const effectiveRadius = rect.radius + circle.r;

		return clampX * clampX + clampY * clampY <= effectiveRadius * effectiveRadius;
	}

	export function RoundedRectRect(rect: RoundedRect, b: Rect) {
		const innerW = Math.max(0, rect.w / 2 - rect.radius);
		const innerH = Math.max(0, rect.h / 2 - rect.radius);

		const distX = Math.abs(b.x - rect.x);
		const distY = Math.abs(b.y - rect.y);

		const clampX = Math.max(0, distX - innerW);
		const clampY = Math.max(0, distY - innerH);

		const halfBW = b.w / 2;
		const halfBH = b.h / 2;

		if (clampX <= halfBW) return distY <= innerH + halfBH || clampY <= halfBH;
		if (clampY <= halfBH) return distX <= innerW + halfBW || clampX <= halfBW;

		const dx = clampX - halfBW;
		const dy = clampY - halfBH;

		return dx * dx + dy * dy <= rect.radius * rect.radius;
	}

	export function CircleCircle(a: Circle, b: Circle) {
		const dx = a.x - b.x;
		const dy = a.y - b.y;

		const distSq = dx * dx + dy * dy;
		const radiusSum = a.r + b.r;

		return distSq <= radiusSum * radiusSum;
	}


	export function RotatedRectCircle(rect: RotatedRect, circle: Circle) {
		// Translate the circle center to rect's local space (rect center as origin)
		const dx = circle.x - rect.x;
		const dy = circle.y - rect.y;

		// Counter-rotate the circle around the rect center
		const cos = Math.cos(-rect.angle);
		const sin = Math.sin(-rect.angle);
		const localX = dx * cos - dy * sin;
		const localY = dx * sin + dy * cos;

		// Now treat the rotated rect as a standard AABB (axis-aligned bounding box)
		const halfW = rect.w / 2;
		const halfH = rect.h / 2;

		const distX = Math.abs(localX);
		const distY = Math.abs(localY);

		if (distX > halfW + circle.r) return false;
		if (distY > halfH + circle.r) return false;

		if (distX <= halfW) return true;
		if (distY <= halfH) return true;

		const cornerDx = distX - halfW;
		const cornerDy = distY - halfH;

		return cornerDx * cornerDx + cornerDy * cornerDy <= circle.r * circle.r;
	}

	export function RotatedRectRotatedRect(a: RotatedRect, b: RotatedRect) {
		// We use the Separating Axis Theorem (SAT)
		const aCos = Math.cos(a.angle);
		const aSin = Math.sin(a.angle);
		const bCos = Math.cos(b.angle);
		const bSin = Math.sin(b.angle);

		// A rectangle has 2 unique perpendicular axes, so 4 axes in total to test
		const axes = [
			{ x: aCos, y: aSin },   // A's local X axis
			{ x: -aSin, y: aCos },  // A's local Y axis
			{ x: bCos, y: bSin },   // B's local X axis
			{ x: -bSin, y: bCos }   // B's local Y axis
		];

		for (let i = 0; i < axes.length; i++) {
			const axis = axes[i];
			
			// Distance between the centers projected on the current axis
			const centerDist = Math.abs((b.x - a.x) * axis.x + (b.y - a.y) * axis.y);
			
			// Projected radius (half-extent) of rectangle A
			const radA = (a.w / 2) * Math.abs(aCos * axis.x + aSin * axis.y) +
						 (a.h / 2) * Math.abs(-aSin * axis.x + aCos * axis.y);
						 
			// Projected radius (half-extent) of rectangle B
			const radB = (b.w / 2) * Math.abs(bCos * axis.x + bSin * axis.y) +
						 (b.h / 2) * Math.abs(-bSin * axis.x + bCos * axis.y);

			// If the projected distance is greater than the sum of projected radii, they don't collide
			if (centerDist > radA + radB) {
				return false;
			}
		}

		return true; 
	}

	export function RotatedRectRect(rotated: RotatedRect, rect: Rect) {
		// An unrotated Rect is simply a RotatedRect with an angle of 0
		const b: RotatedRect = {
			x: rect.x,
			y: rect.y,
			w: rect.w,
			h: rect.h,
			angle: 0
		};
		return RotatedRectRotatedRect(rotated, b);
	}

	export function RotatedRectRoundedRect(rotated: RotatedRect, rounded: RoundedRect) {
		// A RoundedRect is exactly the union of:
		// - A vertical inner rectangle
		// - A horizontal inner rectangle 
		// - 4 circles at the corners
		// We return true if the rotated rect collides with ANY of these sub-shapes.

		const innerW = Math.max(0, rounded.w / 2 - rounded.radius);
		const innerH = Math.max(0, rounded.h / 2 - rounded.radius);

		// 1. Vertical inner rectangle
		if (innerW > 0) {
			const verticalRect: Rect = {
				x: rounded.x,
				y: rounded.y,
				w: innerW * 2,
				h: rounded.h
			};
			if (RotatedRectRect(rotated, verticalRect)) return true;
		}

		// 2. Horizontal inner rectangle
		if (innerH > 0) {
			const horizontalRect: Rect = {
				x: rounded.x,
				y: rounded.y,
				w: rounded.w,
				h: innerH * 2
			};
			if (RotatedRectRect(rotated, horizontalRect)) return true;
		}

		// 3. Four corner circles
		const corners: Circle[] = [
			{ x: rounded.x - innerW, y: rounded.y - innerH, r: rounded.radius }, // Top-Left
			{ x: rounded.x + innerW, y: rounded.y - innerH, r: rounded.radius }, // Top-Right
			{ x: rounded.x - innerW, y: rounded.y + innerH, r: rounded.radius }, // Bottom-Left
			{ x: rounded.x + innerW, y: rounded.y + innerH, r: rounded.radius }  // Bottom-Right
		];

		for (let i = 0; i < 4; i++) {
			if (RotatedRectCircle(rotated, corners[i])) return true;
		}

		return false;
	}

	export function RotatedRoundedRectCircle(rect: RotatedRoundedRect, circle: Circle): boolean {
		// 1. Transform the circle into the local coordinate system of the RotatedRoundedRect
		const dx = circle.x - rect.x;
		const dy = circle.y - rect.y;

		const cos = Math.cos(-rect.a);
		const sin = Math.sin(-rect.a);
		const localX = dx * cos - dy * sin;
		const localY = dx * sin + dy * cos;

		// 2. A local RotatedRoundedRect is equivalent to an axis-aligned RoundedRect centered at (0, 0)
		const localRounded: RoundedRect = {
			x: 0,
			y: 0,
			w: rect.w,
			h: rect.h,
			radius: rect.radius
		};

		const localCircle: Circle = {
			x: localX,
			y: localY,
			r: circle.r
		};

		return RoundedRectCircle(localRounded, localCircle);
	}

	export function RotatedRoundedRectRotatedRoundedRect(a: RotatedRoundedRect, b: RotatedRoundedRect): boolean {
		// A RotatedRoundedRect is the union of:
		// - An inner vertical rectangle
		// - An inner horizontal rectangle
		// - 4 corner circles

		const innerWA = Math.max(0, a.w / 2 - a.radius);
		const innerHA = Math.max(0, a.h / 2 - a.radius);

		const cosA = Math.cos(a.a);
		const sinA = Math.sin(a.a);

		// Sub-shapes of A
		const subShapesA: (RotatedRect | Circle)[] = [];

		// Inner vertical rectangle of A
		if (innerWA > 0) {
			subShapesA.push({
				x: a.x,
				y: a.y,
				w: innerWA * 2,
				h: a.h,
				angle: a.a
			} as RotatedRect);
		}

		// Inner horizontal rectangle of A
		if (innerHA > 0) {
			subShapesA.push({
				x: a.x,
				y: a.y,
				w: a.w,
				h: innerHA * 2,
				angle: a.a
			} as RotatedRect);
		}

		// Four corner circles of A
		const cornerOffsetsA = [
			{ x: -innerWA, y: -innerHA },
			{ x: innerWA, y: -innerHA },
			{ x: -innerWA, y: innerHA },
			{ x: innerWA, y: innerHA }
		];

		for (const offset of cornerOffsetsA) {
			// Apply the rotation of rectangle A to the circle centers
			const worldX = a.x + (offset.x * cosA - offset.y * sinA);
			const worldY = a.y + (offset.x * sinA + offset.y * cosA);

			subShapesA.push({
				x: worldX,
				y: worldY,
				r: a.radius
			} as Circle);
		}

		// Check for collisions between each sub-shape of A and rectangle/circle B
		for (const shapeA of subShapesA) {
			if ('r' in shapeA) {
				// This is a Circle: Circle vs RotatedRoundedRect collision
				if (RotatedRoundedRectCircle(b, shapeA)) return true;
			} else {
				// This is a RotatedRect: RotatedRect vs RotatedRoundedRect collision
				if (RotatedRectRotatedRoundedRect(shapeA, b)) return true;
			}
		}

		return false;
	}

	// Helper to test collision between a RotatedRect and a RotatedRoundedRect
	export function RotatedRectRotatedRoundedRect(rect: RotatedRect, rounded: RotatedRoundedRect): boolean {
		// Transform 'rect' into the local coordinate system of 'rounded'
		const dx = rect.x - rounded.x;
		const dy = rect.y - rounded.y;

		const cos = Math.cos(-rounded.a);
		const sin = Math.sin(-rounded.a);

		const localX = dx * cos - dy * sin;
		const localY = dx * sin + dy * cos;
		const localAngle = rect.angle - rounded.a;

		const localRotatedRect: RotatedRect = {
			x: localX,
			y: localY,
			w: rect.w,
			h: rect.h,
			angle: localAngle
		};

		const localRounded: RoundedRect = {
			x: 0,
			y: 0,
			w: rounded.w,
			h: rounded.h,
			radius: rounded.radius
		};

		return RotatedRectRoundedRect(localRotatedRect, localRounded);
	}

	export function RotatedRoundedRectRect(rotatedRounded: RotatedRoundedRect, rect: Rect): boolean {
		// 1. Transform the Rect into the local coordinate system of the RotatedRoundedRect
		const dx = rect.x - rotatedRounded.x;
		const dy = rect.y - rotatedRounded.y;

		const cos = Math.cos(-rotatedRounded.a);
		const sin = Math.sin(-rotatedRounded.a);

		const localX = dx * cos - dy * sin;
		const localY = dx * sin + dy * cos;

		// In the local coordinate system of the RotatedRoundedRect, the Rect (without rotation) acquires an angle of -rotatedRounded.a
		const localRotatedRect: RotatedRect = {
			x: localX,
			y: localY,
			w: rect.w,
			h: rect.h,
			angle: -rotatedRounded.a
		};

		// The RotatedRoundedRect becomes an axis-aligned RoundedRect centered at (0, 0)
		const localRounded: RoundedRect = {
			x: 0,
			y: 0,
			w: rotatedRounded.w,
			h: rotatedRounded.h,
			radius: rotatedRounded.radius
		};

		return RotatedRectRoundedRect(localRotatedRect, localRounded);
	}
}