import VPBackground from "./vp_background.js";
import NPoint from "../npoint.js";
import {
	clamp
} from "../nmath.js";

export default class NViewport {
	constructor({
		minZoomFactor = 0.25,
		maxZoomFactor = 2,
		pannable = true,
		zoomSensitivity = 1,
		panSensitivity = 0.5,
		zoomCenterMode = "mouse", //center, mouse, panCenter
		backgroundClass = VPBackground
	} = {}) {
		this._setupDone = false;
		this._redrawQueued = false;

		this._background = new backgroundClass(this);

		this.targetTickrate = 30;

		this._zoomCenterMode = zoomCenterMode;
		this._minZoomFactor = minZoomFactor;
		this._maxZoomFactor = maxZoomFactor;
		this.zoomSensitivity = zoomSensitivity;
		this._zoomCounterBase = 1.0075; // this.zoomFactor = Math.pow(this.zoomCounterBase, this.zoomCounter)
		this._minZoomCounter = this.zoomFactorToCounter(this._minZoomFactor);
		this._maxZoomCounter = this.zoomFactorToCounter(this._maxZoomFactor);
		this._zoomFactor = 1;
		this._zoomCounter = this.zoomFactorToCounter(this._zoomFactor);

		this.pannable = pannable;
		this.inversePanning = true;
		this._panCenter = new NPoint();
		this._vpCenter = new NPoint();
		this.panSensitivity = panSensitivity;

		this._mouseDown = false;

		/** raw mouse position (relative to viewport element) */
		this._mouseElemPos = new NPoint();
		this._mouseElemDownPos = new NPoint();
		this._mouseElemDelta = new NPoint();

		/** relative to viewport objects */
		this._mousePos = new NPoint();
		/** position where mouse was last pressed down */
		this._mouseDownPos = new NPoint();
		/** movement of mouse between ticks */
		this._mouseDelta = new NPoint();
		/** cumulative distance that mouse has been dragged in the current press */
		this._mouseDragDistance = 0;
		/** farthest distance that mouse has been from its press position */
		this._mouseDragMaxDelta = 0;

		this._cursorSuggests = {
			"default": 1
		};
		this._cursorPriorities = ["none", "not-allowed", "help", "grabbing", "grab", "move", "pointer", "crosshair", "default"];

		this._canvasDims = new NPoint();
		this.nonDragThreshold = 8;

		this._allObjs = {};

		this._drawRegisterCounter = 0
		this._drawnObjIds = new Set();
		this._mouseListeningObjIds = new Set();
		this._mouseOverObjIds = new Set();
		/** objects that the mouse is pressed down on */
		this._heldObjIds = new Set();
		/** objects that the mouse is pressed down on and moved sufficiently */
		this._draggedObjIds = new Set();

		// this.drawnObjIdsSorted = []
		this._mouseListeningObjIdsSorted = []
		this._mouseOverObjIdsSorted = []
		this._heldObjIdsSorted = []
		this._draggedObjIdsSorted = []

		this._preMouseDownListeners = {}
		this._preMouseUpListeners = {}
		this._preMouseClickListeners = {}
		this._preMouseMoveListeners = {}
		this._preMouseWheelListeners = {}
		this._postMouseDownListeners = {}
		this._postMouseUpListeners = {}
		this._postMouseClickListeners = {}
		this._postMouseMoveListeners = {}
		this._postMouseWheelListeners = {}

		// is the mouse over the viewport?
		this._mouseWithin = false;
		this._ctrlDown = false;
		this._shiftDown = false;
		this._altDown = false;
		this._downKeys = new Set();
		const self = this;
		// setTimeout(function () {
		// 	self.recenter();
		// }, 500);
	}

	setup(parentDiv) {
		if (!this._setupDone) {
			this._makeElements();
			parentDiv.appendChild(this.container);
			this._setupScrollLogic();
			this._setupMouseListeners();
			this._setupKeyListeners();
			this.registerObj(this._background);
			this._setupDone = true;
		}
	}

	recenter() {
		this._panCenter = new NPoint(this.canvas.width / 2, this.canvas.height / 2);
		this.queueRedraw();
	}

	_preOnMouseDown() {
		if (this._preMouseDownListeners) {
			Object.values(this._preMouseDownListeners).forEach(f => f(this));
		}
	}

	_preOnMouseUp() {
		if (this._preMouseUpListeners) {
			Object.values(this._preMouseUpListeners).forEach(f => f(this));
		}
	}

	_preOnMouseClick() {
		if (this._preMouseClickListeners) {
			Object.values(this._preMouseClickListeners).forEach(f => f(this));
		}
	}

	_preOnMouseMove() {
		if (this._preMouseMoveListeners) {
			Object.values(this._preMouseMoveListeners).forEach(f => f(this));
		}
	}

	_preOnMouseWheel(e) {
		if (this._preMouseWheelListeners) {
			Object.values(this._preMouseWheelListeners).forEach(f => f(this, e));
		}
	}

	_postOnMouseDown() {
		if (this._postMouseDownListeners) {
			Object.values(this._postMouseDownListeners).forEach(f => f(this));
		}
	}

	_postOnMouseUp() {
		if (this._postMouseUpListeners) {
			Object.values(this._postMouseUpListeners).forEach(f => f(this));
		}
	}

	_postOnMouseClick() {
		if (this._postMouseClickListeners) {
			Object.values(this._postMouseClickListeners).forEach(f => f(this));
		}
	}

	_postOnMouseMove() {
		if (this._postMouseMoveListeners) {
			Object.values(this._postMouseMoveListeners).forEach(f => f(this));
		}
	}

	_postOnMouseWheel(e) {
		if (this._postMouseWheelListeners) {
			Object.values(this._postMouseWheelListeners).forEach(f => f(this, e));
		}
	}

	getDepthSorter() {
		const allObjs = this._allObjs;
		return function (aid, bid) {
			const a = allObjs[aid];
			const b = allObjs[bid];
			return (b.zOrder - a.zOrder) ||
				(b.zSubOrder - a.zSubOrder) ||
				(b.drawRegisterNum - a.drawRegisterNum);
		}
	}

	getReversedDepthSorter() {
		return (a, b) => this.getDepthSorter()(b, a);
	}

	registerObj(obj) {
		this._allObjs[obj.uuid] = obj;
		if (obj.drawable) {
			this.registerDrawnObj(obj);
		}
		if (obj.mouseListening) {
			this.registerMouseListeningObj(obj);
		}
		this.queueRedraw();
	}

	registerDrawnObj(obj) {
		obj.drawRegisterNum = this._drawRegisterCounter++;
		this._drawnObjIds.add(obj.uuid);
		// this.drawnObjIdsSorted = Array.from(this.drawnObjIds);
		// this.drawnObjIdsSorted.sort(this.getReversedDepthSorter());
	}

	registerMouseListeningObj(obj) {
		this._mouseListeningObjIds.add(obj.uuid);
		this._mouseListeningObjIdsSorted = Array.from(this._mouseListeningObjIds);
		this._mouseListeningObjIdsSorted.sort(this.getDepthSorter());
	}

	registerMouseOverObj(obj) {
		obj.mouseOverlapping = true;
		this._mouseOverObjIds.add(obj.uuid);
		this._mouseOverObjIdsSorted = Array.from(this._mouseOverObjIds);
		this._mouseOverObjIdsSorted.sort(this.getDepthSorter());
	}

	registerHeldObj(obj) {
		obj.held = true;
		this._heldObjIds.add(obj.uuid);
		this._heldObjIdsSorted = Array.from(this._heldObjIds);
		this._heldObjIdsSorted.sort(this.getDepthSorter());
	}

	registerDraggedObj(obj) {
		obj.dragged = true;
		this._draggedObjIds.add(obj.uuid);
		this._draggedObjIdsSorted = Array.from(this._draggedObjIds);
		this._draggedObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterDrawnObj(obj) {
		this._drawnObjIds.delete(obj.uuid);
		// removeItem(this.drawnObjIdsSorted, obj.uuid);
		// this.drawnObjIdsSorted = Array.from(this.drawnObjIds);
		// this.drawnObjIdsSorted.sort(this.getReversedDepthSorter());
	}

	unregisterMouseListeningObj(obj) {
		this._mouseListeningObjIds.delete(obj.uuid);
		// removeItem(this.mouseListeningObjIdsSorted, obj.uuid);
		this._mouseListeningObjIdsSorted = Array.from(this._mouseListeningObjIds);
		this._mouseListeningObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterMouseOverObj(obj) {
		obj.mouseOverlapping = false;
		this._mouseOverObjIds.delete(obj.uuid);
		// removeItem(this.mouseOverObjIdsSorted, obj.uuid);
		this._mouseOverObjIdsSorted = Array.from(this._mouseOverObjIds);
		this._mouseOverObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterHeldObj(obj) {
		obj.held = false;
		this._heldObjIds.delete(obj.uuid);
		// removeItem(this.heldObjIdsSorted, obj.uuid);
		this._heldObjIdsSorted = Array.from(this._heldObjIds);
		this._heldObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterDraggedObj(obj) {
		obj.dragged = false;
		this._draggedObjIds.delete(obj.uuid);
		// removeItem(this.heldObjIdsSorted, obj.uuid);
		this._draggedObjIdsSorted = Array.from(this._draggedObjIds);
		this._draggedObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterAllDrawnObjs() {
		this._drawnObjIds.clear();
		// this.drawnObjIdsSorted = [];
		this.registerDrawnObj(this._background);
	}

	unregisterAllMouseListeningObjs() {
		this._mouseListeningObjIds.clear();
		this._mouseListeningObjIdsSorted = [];
		this.registerMouseListeningObj(this._background);
	}

	unregisterAllMouseOverObjs() {
		this._mouseOverObjIds.forEach(id => this._allObjs[id].mouseOverlapping = false);
		this._mouseOverObjIds.clear();
		this._mouseOverObjIdsSorted = [];
	}

	unregisterAllHeldObjs() {
		this._heldObjIds.forEach(id => this._allObjs[id].held = false);
		this._heldObjIds.clear();
		this._heldObjIdsSorted = [];
	}

	unregisterAllDraggedObjs() {
		this._draggedObjIds.forEach(id => this._allObjs[id].dragged = false);
		this._draggedObjIds.clear();
		this._draggedObjIdsSorted = [];
	}

	forget(obj) {
		if (obj === this._background) {
			return false;
		}

		obj.onForget();
		delete this._allObjs[obj.id];
		this.unregisterDrawnObj(obj);
		this.unregisterMouseListeningObj(obj);
		this.unregisterMouseOverObj(obj);
		this.unregisterHeldObj(obj);
		this.unregisterDraggedObj(obj);
		this.queueRedraw();
		// update mouse logic in case an object is removed that was preventing a lower object from being touched
		this._mousePosUpdated();
	}

	forgetAll() {
		for (const obj of Object.values(this._allObjs)) {
			this.forget(obj);
		}
	}

	// tickMultiplier = integer equiv of deltaTime
	// overflow = accidental ms delay since last tick
	onTick(deltaT, tickMultiplier, overflow) {
		// console.log(ticks + " : " + deltaTime + " : " + overflow);
	}

	_setupLoop() {
		const self = this;
		let currentTime = Date.now();
		let lastTime = currentTime;
		let deltaTime = 0;
		let overflowTime = 0;

		function requestNext() {
			window.requestAnimationFrame(loopIteration);
		};

		function loopIteration() {
			const targetDelay = 1000 / self.targetTickrate;
			currentTime = Date.now();
			deltaTime += currentTime - lastTime;
			if (deltaTime > targetDelay) {
				let diffRemainder = deltaTime % targetDelay;
				let diffQuotient = Math.floor(deltaTime / targetDelay);

				overflowTime += diffRemainder;

				let overflowRemainder = overflowTime % targetDelay;
				let overflowQuotient = Math.floor(overflowTime / targetDelay);

				overflowTime = overflowRemainder;

				let extraTicks = diffQuotient + overflowQuotient;
				self.onTick(deltaTime * extraTicks / 1000 + 1, extraTicks, overflowTime);
				requestNext();
				deltaTime = 0;
			} else {
				setTimeout(requestNext, targetDelay - deltaTime);
			}
			lastTime = currentTime;
		}

		loopIteration();
	}

	queueRedraw() {
		if (!this._redrawQueued) {
			this._redrawQueued = true;
			setTimeout(_ => this._redraw.call(this), 0);
		}
	}

	_redraw() {
		if (this._setupDone) {
			this._redrawQueued = false;
			const drawnObjIdsSorted = Array.from(this._drawnObjIds);
			drawnObjIdsSorted.sort(this.getReversedDepthSorter());
			this.ctx.setTransform(this._zoomFactor, 0, 0, this._zoomFactor, this._panCenter.x + this._vpCenter.x, this._panCenter.y + this._vpCenter.y);
			for (const uuid of drawnObjIdsSorted) {
				const obj = this._allObjs[uuid];
				obj.draw(this.ctx);
			}
			this.onRedraw();
		}
	}

	onRedraw() {}

	// drawRect(x, y, w, h) {
	// 	const pos = this.canvasToViewSpace(new NPoint(x, y));
	// 	this.ctx.fillRect(pos.x, pos.y, w * this.zoomFactor, h * this.zoomFactor);
	// }

	_makeElements() {
		this.container = document.createElement("div");
		this.container.classList.add("vpContainer");
		this.container.style.width = "100%";
		this.container.style.height = "100%";
		this.container.style.background = "transparent";

		this.canvas = document.createElement("canvas");
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		this.canvas.style.background = "transparent";
		this.container.appendChild(this.canvas);
		this.ctx = this.canvas.getContext("2d");
	}

	pageToViewSpace(npoint) {
		return npoint.subtractp(this._panCenter.addp(this._vpCenter)).divide1(this._zoomFactor).multiply2(1, 1);
	}

	canvasToViewSpace(npoint) {
		return npoint.multiply2(1, 1).add2(this.canvas.width / 2, this.canvas.height / 2).multiply1(this._zoomFactor).addp(this._panCenter.addp(this._vpCenter));
	}

	_setupScrollLogic() {
		const self = this;
		self.resizeObserver = new ResizeObserver(function (e) {
			const resizeRect = e[0].contentRect;
			self.canvas.width = resizeRect.width;
			self.canvas.height = resizeRect.height;
			self._canvasDims = new NPoint(self.canvas.width, self.canvas.height);
			self._vpCenter = self._canvasDims.divide1(2);
			self.queueRedraw();
		});
		self.resizeObserver.observe(this.container);
	}

	_mousePosUpdated() {
		const newMousePos = this.pageToViewSpace(this._mouseElemPos);
		this._mouseDelta = newMousePos.subtractp(this._mousePos);
		this._preOnMouseMove();
		if (this._mouseDown) {
			this._mouseDragMaxDelta = Math.max(this._mouseDragMaxDelta, this._mouseDownPos.subtractp(newMousePos).length());
			this._mouseDragDistance += this._mouseDelta.length();
			if (this._mouseDragDistance >= this.nonDragThreshold) {
				for (const uuid of this._heldObjIdsSorted) {
					const obj = this._allObjs[uuid];
					if (!this._draggedObjIds.has(uuid)) {
						this.registerDraggedObj(obj);
						obj.onDragStarted();
					}
					obj.onDragged();
				}
			}
		}
		this._mousePos = newMousePos;

		const currentMousedOverObjIds = new Set();
		for (const uuid of this._mouseListeningObjIdsSorted) {
			const obj = this._allObjs[uuid];
			if (obj.mouseListening) {
				if (obj.isOverlapping(this._mousePos)) {
					currentMousedOverObjIds.add(uuid);
					if (obj.isMouseBlockingOverlap()) {
						break;
					}
				}
			}
		}

		const prevMousedOverObjIds = new Set(this._mouseOverObjIds);
		// existing & new moused over objs
		if (this._mouseWithin) {
			for (const uuid of currentMousedOverObjIds) {
				if (!prevMousedOverObjIds.has(uuid)) {
					const obj = this._allObjs[uuid];
					this.registerMouseOverObj(obj);
					obj.onMouseEntered();
				}
			}
		}

		// no longer moused over objs
		for (const uuid of prevMousedOverObjIds) {
			if (!currentMousedOverObjIds.has(uuid)) {
				const obj = this._allObjs[uuid];
				this.unregisterMouseOverObj(obj);
				obj.onMouseExited();
			}
		}

		this._postOnMouseMove();
	}

	keyPressed(code) {}

	keyReleased(code) {}

	_setupKeyListeners() {
		const self = this;
		document.addEventListener("keydown", function (e) {
			const keyCode = e.key;
			switch (keyCode) {
				case 16:
					self._shiftDown = true;
					break;
				case 17:
					self._ctrlDown = true;
					break;
				case 18:
					self._altDown = true;
					break;
				default:
					if (self._mouseWithin) {
						self._downKeys.add(keyCode);
						self.keyPressed(keyCode);
					}
			}
		});

		// global key up
		document.addEventListener("keyup", function (e) {
			const keyCode = e.key;
			switch (keyCode) {
				case 16:
					self._shiftDown = false;
					break;
				case 17:
					self._ctrlDown = false;
					break;
				case 18:
					self._altDown = false;
					break;
				default:
					if (self._downKeys.delete(keyCode)) {
						self.keyReleased(keyCode);
					}
			}

		});
	}

	_zoomUpdatePanCenter(prevZoomFactor, zoomCenter = null, quiet=false) {
		console.log(this._zoomFactor.toFixed(3) + " : " + this._zoomCounter.toFixed(3))
		if (zoomCenter === null) {
			switch (this._zoomCenterMode) {
				case "center":
					zoomCenter = this._vpCenter;
					break;
				case "mouse":
					zoomCenter = this._mouseElemPos;
					break;
			}
		}

		this._panCenter = this._panCenter.subtractp(
			zoomCenter.subtractp(this._panCenter.addp(this._vpCenter))
			.divide1(prevZoomFactor).multiply1(this._zoomFactor - prevZoomFactor)
		);
		if(!quiet){
			this._mousePosUpdated();
		}
		this.queueRedraw();
	}

	zoomFactorToCounter(factor) {
		return Math.log(factor) / Math.log(this._zoomCounterBase);
	}

	zoomCounterToFactor(counter) {
		return Math.pow(this._zoomCounterBase, counter);
	}

	setZoomFactor(newZoomFactor, zoomCenter = null, quiet = false) {
		const prevZoomFactor = this._zoomFactor;
		this._zoomFactor = clamp(newZoomFactor, this._minZoomFactor, this._maxZoomFactor);
		this._zoomCounter = this.zoomFactorToCounter(this._zoomFactor);
		this._zoomUpdatePanCenter(prevZoomFactor, zoomCenter, quiet);
	}

	setZoomCounter(newZoomCounter, zoomCenter = null, quiet = false) {
		const prevZoomFactor = this._zoomFactor;
		this._zoomCounter = clamp(newZoomCounter, this._minZoomCounter, this._maxZoomCounter);
		this._zoomFactor = this.zoomCounterToFactor(this._zoomCounter);
		this._zoomUpdatePanCenter(prevZoomFactor, zoomCenter, quiet);
	}

	setPanCenter(newCenter, quiet = false) {
		this._panCenter = newCenter;
		if (!quiet) {
			this._mousePosUpdated();
		}
		this.queueRedraw();
	}

	_setupMouseListeners() {
		const self = this;
		this.container.addEventListener("pointerenter", function (e) {
			self._mouseWithin = true;
		});

		this.container.addEventListener("pointerleave", function (e) {
			self._mouseWithin = false;
		});

		this.container.addEventListener("wheel", function (e) {
			self._preOnMouseWheel(e);

			if (e.ctrlKey) {
				if (self._minZoomFactor < self._maxZoomFactor) {
					self.setZoomCounter(self._zoomCounter + (-e.deltaY * self.zoomSensitivity));
					e.preventDefault();
				}
			} else {
				if (self.pannable) {
					let centerDelta = new NPoint(e.deltaX, e.deltaY).multiply1(self.panSensitivity);
					if (self.inversePanning) {
						centerDelta = centerDelta.negate();
					}
					self.setPanCenter(self._panCenter.addp(centerDelta));
					e.preventDefault();
				}
			}
			self._postOnMouseWheel(e);
		});

		this.container.addEventListener("pointerdown", function (e) {
			self.queueRedraw();
			self._mouseElemDownPos = self._mouseElemPos;
			self._mouseDownPos = self.pageToViewSpace(self._mouseElemPos);
			self._mouseDown = true;
			self._preOnMouseDown();
			for (const uuid of self._mouseOverObjIdsSorted) {
				const obj = self._allObjs[uuid];
				self.registerHeldObj(obj);
				obj.onPressed(self);
				if (obj.isMouseBlockingPress(self)) {
					break;
				}
			}
			self._postOnMouseDown();
		});

		document.addEventListener("pointerup", function (e) {
			self.queueRedraw();
			self._preOnMouseUp();
			self._mouseDown = false;
			for (const uuid of self._mouseOverObjIdsSorted) {
				const obj = self._allObjs[uuid];
				obj.onMouseUp();
				if (obj.isMouseBlockingPress()) {
					break;
				}
			}

			for (const uuid of self._heldObjIdsSorted) {
				const obj = self._allObjs[uuid];
				obj.onUnpressed();
				if (self._mouseDragDistance >= self.nonDragThreshold) {
					obj.onDragEnded();
				} else {
					obj.onClicked();
				}
			}
			self._mouseDragDistance = 0;
			self._mouseDragMaxDelta = 0;
			self.unregisterAllHeldObjs();
			self.unregisterAllDraggedObjs();
			self._postOnMouseUp();
		});

		// this.container.style.touchAction = "none";
		document.addEventListener("pointermove", function (e) {
			const newMouseElemPos = new NPoint(
				e.pageX - self.container.offsetLeft,
				e.pageY - self.container.offsetTop
			);

			self._mouseElemDelta = newMouseElemPos.subtractp(self._mouseElemPos);
			self._mouseElemPos = newMouseElemPos;
			self._mousePosUpdated();
		});
	}

	suggestCursor(type, count = 1) {
		this._cursorSuggests[type] = (this._cursorSuggests[type] || 0) + count
		this._refreshCursorType();
	}

	unsuggestCursor(type, count = 1) {
		this._cursorSuggests[type] = Math.max(0, (this._cursorSuggests[type] || 0) - count);
		this._refreshCursorType();
	}

	_refreshCursorType() {
		for (const type of this._cursorPriorities) {
			if (this._cursorSuggests[type]) {
				this.canvas.style.cursor = type;
				break;
			}
		}
	}
}