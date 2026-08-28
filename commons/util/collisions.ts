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

	export function CircleCircle(a: Circle, b: Circle) {
		const dx = a.x - b.x;
		const dy = a.y - b.y;

		const distSq = dx * dx + dy * dy;
		const radiusSum = a.r + b.r;

		return distSq <= radiusSum * radiusSum;
	}
}