export namespace collisions {
	interface Circle {
		x: number;
		y: number;
		r: number;
	}

	interface Rect {
		x: number;
		y: number;
		w: number;
		h: number;
	}

	interface RoundedRect {
		x: number;
		y: number;
		w: number;
		h: number;
		radius: number;
	}

	export function RectCircle(rect: Rect, circle: Circle){
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
}