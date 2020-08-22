export class NPoint {
	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
	}

	toString() {
		return `(${this.x}, ${this.y})`;
	}

	addp(other) {
		return new NPoint(this.x + other.x, this.y + other.y);
	}

	subtractp(other) {
		return new NPoint(this.x - other.x, this.y - other.y);
	}

	multiplyp(other) {
		return new NPoint(this.x * other.x, this.y * other.y);
	}

	dividep(other) {
		return new NPoint(this.x / other.x, this.y / other.y);
	}

	add1(other) {
		return new NPoint(this.x + other, this.y + other);
	}

	subtract1(other) {
		return new NPoint(this.x - other, this.y - other);
	}

	multiply1(other) {
		return new NPoint(this.x * other, this.y * other);
	}

	divide1(other) {
		return new NPoint(this.x / other, this.y / other);
	}

	add2(x, y) {
		return new NPoint(this.x + x, this.y + y);
	}

	subtract2(x, y) {
		return new NPoint(this.x - x, this.y - y);
	}

	multiply2(x, y) {
		return new NPoint(this.x * x, this.y * y);
	}

	divide2(x, y) {
		return new NPoint(this.x / x, this.y / y);
	}

	floor() {
		return new NPoint(Math.floor(this.x), Math.floor(this.y));
	}

	addComponents() {
		return this.x + this.y;
	}

	lengthSquared() {
		return this.x * this.x + this.y * this.y;
	}

	length() {
		return Math.sqrt(this.lengthSquared());
	}

	normalized(){
		return this.divide1(this.length());
	}

	min() {
		return Math.min(this.x, this.y);
	}

	max() {
		return Math.max(this.x, this.y);
	}

	round(n = 0) {
		if (n) {
			const factor = Math.pow(10, n);
			return new NPoint(Math.round(this.x * factor) / factor, Math.round(this.y * factor) / factor);
		} else {
			return new NPoint(Math.round(this.x), Math.round(this.y));
		}
	}

	copy() {
		return new NPoint(this.x, this.y);
	}

	rotate(rads) {
		const prevRads = this.getAngle();
		const mag = this.length();
		return new NPoint(Math.cos(rads + prevRads) * mag, Math.sin(rads + prevRads) * mag);
	}

	getAngle() {
		return Math.atan2(this.y, this.x);
	}

	rotateAxis(rads, axis) {
		return this.subtractp(axis).rotate(rads).addp(axis);
	}

	static distSquared(a, b) {
		return a.subtractp(b).lengthSquared();
	}

	static dist(a, b) {
		return a.subtractp(b).length();
	}

	distToSegmentSquared(v, w) {
		const l2 = NPoint.distSquared(v, w);
		if (l2 === 0) {
			return NPoint.distSquared(this, v);
		}
		const t = clamp(NPoint.dotProduct(v.subtractp(this), v.subtractp(w)) / l2, 0, 1);
		return NPoint.distSquared(this, w.subtractp(v).multiply1(t).addp(v));
	}

	distToSegment(v, w) {
		return Math.sqrt(this.distToSegmentSquared(v, w));
	}

	static same(...pts) {
		const x = pts[0].x;
		const y = pts[0].y;
		for (let i = 1, l = pts.length; i < l; i++) {
			const pt = pts[i];
			if (x !== pt.x || y !== pt.y) {
				return false;
			}
		}
		return true;
	}

	static min(...pts) {
		return new NPoint(Math.min(...pts.map(pt => pt.x)), Math.min(...pts.map(pt => pt.y)));
	}

	static max(...pts) {
		return new NPoint(Math.max(...pts.map(pt => pt.x)), Math.max(...pts.map(pt => pt.y)));
	}

	static dotProduct(a, b) {
		return a.x * b.x + a.y * b.y;
	}

	static crossProduct(a, b) {
		return a.x * b.y - a.y * b.x;
	}

	static segmentIntersection(a1, a2, b1, b2) {
		const dxa = (a2.x - a1.x);
		const dxb = (b2.x - b1.x);

		if (dxa === 0 && dxb === 0) {
			return false;
		}

		const minA = NPoint.min(a1, a2);
		const maxA = NPoint.max(a1, a2);
		const minB = NPoint.min(b1, b2);
		const maxB = NPoint.max(b1, b2);

		if (dxa === 0) {
			if (minB.x > a1.x || maxB.x < a1.x) {
				return false;
			}
			const mb = (b2.y - b1.y) / dxb;
			const bb = b1.y - (mb * b1.x);
			const interY = (mb * a1.x) + bb
			return interY >= minA.y && interY <= maxA.y && interY >= minB.y && interY <= maxB.y;
		} else if (dxb === 0) {
			if (minA.x > b1.x || maxA.x < b1.x) {
				return false;
			}
			const ma = (a2.y - a1.y) / dxa;
			const ba = a1.y - (ma * a1.x);
			const interY = (ma * b1.x) + ba
			return interY >= minA.y && interY <= maxA.y && interY >= minB.y && interY <= maxB.y;
		} else {
			const ma = (a2.y - a1.y) / dxa;
			const ba = a1.y - (ma * a1.x);

			const mb = (b2.y - b1.y) / dxb;
			const bb = b1.y - (mb * b1.x);

			if (ma === mb) {
				return false;
			}

			const interX = (bb - ba) / (ma - mb);
			const interY = (ma * interX) + ba;
			return interX >= minA.x && interX <= maxA.x && interY >= minA.y && interY <= maxA.y && interX >= minB.x && interX <= maxB.x && interY >= minB.y && interY <= maxB.y;
		}
	}

	static getPointOnBezier(p1, p2, p3, p4, t) {
		const omt = 1 - t;
		const omt2 = omt * omt;
		const t2 = t * t;
	
		const coeff1 = omt2 * omt;
		const coeff2 = 3 * t * omt2;
		const coeff3 = 3 * t2 * omt;
		const coeff4 = t2 * t;
	
		const curveX = p1.x * coeff1 + p2.x * coeff2 + p3.x * coeff3 + p4.x * coeff4;
		const curveY = p1.y * coeff1 + p2.y * coeff2 + p3.y * coeff3 + p4.y * coeff4;
		return new NPoint(curveX, curveY);
	}
}