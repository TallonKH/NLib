import VPBackground from "./vp_background.js";
import NPoint from "../npoint.js";
import {
	clamp
} from "../nmath.js";
import {
	insertSorted, findSorted
} from "../nmisc.js";

export default class NViewport {
	constructor({
		minZoomFactor = 0.25,
		maxZoomFactor = 2,
		pannable = true,
		zoomSensitivity = 1,
		panSensitivity = 0.5,
		zoomCenterMode = "pointer", //center, pointer, panCenter
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
		this._pointerElemPos = new NPoint();
		this._pointerElemDelta = new NPoint();

		/** relative to viewport objects */
		this._pointerPos = new NPoint();
		/** position where mouse was last pressed down */
		this._mouseDownPos = new NPoint();
		/** movement of mouse between ticks */
		this._pointerDelta = new NPoint();
		/** difference between mouse-down cursor position and current */
		this._pointerDragDelta = new NPoint();
		/** cumulative distance that mouse has been dragged in the current press */
		this._pointerDragDistance = 0;
		/** farthest distance that mouse has been from its press position */
		this._pointerDragMaxDelta = 0;

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
		/** objects that the pointer is overlapping */
		this._pointerAwareObjIds = new Set();
		/** objects that the pointer is overlapping */
		this._pointerOverlappingObjIds = new Set();
		/** objects that the mouse is pressed down on */
		this._heldObjIds = new Set();
		/** objects that the mouse is pressed down on and moved sufficiently */
		this._draggedObjIds = new Set();

		// this.drawnObjIdsSorted = []
		this._mouseListeningObjIdsSorted = []
		this._pointerAwareObjIdsSorted = []
		this._wheelListeningObjIdsSorted = []
		this._wheelOverObjIdsSorted = []
		this._heldObjIdsSorted = []
		this._draggedObjIdsSorted = []

		this._preMouseDownListeners = {}
		this._preMouseUpListeners = {}
		this._preMouseClickListeners = {}
		this._prePointerMoveListeners = {}
		this._preMouselListeners = {}
		this._postMouseDownListeners = {}
		this._postMouseUpListeners = {}
		this._postMouseClickListeners = {}
		this._postPointerMoveListeners = {}
		this._postMouseWheelListeners = {}
		this._tickListeners = {}

		// is the mouse over the viewport?
		this._pointerWithin = false;
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

	_preOnMouseDown(mouseClickEvent) {
		if (this._preMouseDownListeners) {
			Object.values(this._preMouseDownListeners).forEach(f => f(this, mouseClickEvent));
		}
	}

	_preOnMouseUp(mouseClickEvent) {
		if (this._preMouseUpListeners) {
			Object.values(this._preMouseUpListeners).forEach(f => f(this, mouseClickEvent));
		}
	}

	_preOnMouseClick(mouseClickEvent) {
		if (this._preMouseClickListeners) {
			Object.values(this._preMouseClickListeners).forEach(f => f(this, mouseClickEvent));
		}
	}

	_preOnPointerMove(pointerMoveEvent) {
		if (this._prePointerMoveListeners) {
			Object.values(this._prePointerMoveListeners).forEach(f => f(this, pointerMoveEvent));
		}
	}

	_preOnMouseWheel(wheelEvent) {
		if (this._preMouseWheelListeners) {
			Object.values(this._preMouseWheelListeners).forEach(f => f(this, wheelEvent));
		}
	}

	_postOnMouseDown(mouseClickEvent) {
		if (this._postMouseDownListeners) {
			Object.values(this._postMouseDownListeners).forEach(f => f(this, mouseClickEvent));
		}
	}

	_postOnMouseUp(mouseClickEvent) {
		if (this._postMouseUpListeners) {
			Object.values(this._postMouseUpListeners).forEach(f => f(this, mouseClickEvent));
		}
	}

	_postOnMouseClick(mouseClickEvent) {
		if (this._postMouseClickListeners) {
			Object.values(this._postMouseClickListeners).forEach(f => f(this, mouseClickEvent));
		}
	}

	_postOnPointerMove(pointerMoveEvent) {
		if (this._postPointerMoveListeners) {
			Object.values(this._postPointerMoveListeners).forEach(f => f(this, pointerMoveEvent));
		}
	}

	_postOnMouseWheel(wheelEvent) {
		if (this._postMouseWheelListeners) {
			Object.values(this._postMouseWheelListeners).forEach(f => f(this, wheelEvent));
		}
	}

	getDepthSorter() {
		const allObjs = this._allObjs;
		return function (aid, bid) {
			const a = allObjs[aid];
			const b = allObjs[bid];
			return (b.zOrder - a.zOrder) ||
				(b.zSubOrder - a.zSubOrder) ||
				(b._drawRegisterNum - a._drawRegisterNum);
		}
	}

	getReversedDepthSorter() {
		return (a, b) => this.getDepthSorter()(b, a);
	}

	registerObj(obj) {
		this._allObjs[obj._uuid] = obj;
		if (obj._drawable) {
			this.registerDrawnObj(obj);
		}
		if (obj._mouseListening) {
			this.registerMouseListeningObj(obj);
		}
		this.queueRedraw();
	}

	registerDrawnObj(obj) {
		obj._drawRegisterNum = this._drawRegisterCounter++;
		this._drawnObjIds.add(obj._uuid);
	}

	registerMouseListeningObj(obj) {
		this._mouseListeningObjIds.add(obj._uuid);
		this._mouseListeningObjIdsSorted = Array.from(this._mouseListeningObjIds);
		this._mouseListeningObjIdsSorted.sort(this.getDepthSorter());
	}

	registerPointerAwareObj(obj) {
		obj._pointerAware = true;
		this._pointerAwareObjIds.add(obj._uuid);
		this._pointerAwareObjIdsSorted = Array.from(this._pointerAwareObjIds);
		this._pointerAwareObjIdsSorted.sort(this.getDepthSorter());
	}

	registerPointerOverlappingObj(obj) {
		obj._pointerOverlapping = true;
		this._pointerOverlappingObjIds.add(obj._uuid);
		this._pointerOverlappingIdsSorted = Array.from(this._pointerOverlappingObjIds);
		this._pointerOverlappingIdsSorted.sort(this.getDepthSorter());
	}

	registerHeldObj(obj) {
		obj._held = true;
		this._heldObjIds.add(obj._uuid);
		this._heldObjIdsSorted = Array.from(this._heldObjIds);
		this._heldObjIdsSorted.sort(this.getDepthSorter());
	}

	registerDraggedObj(obj) {
		obj._dragged = true;
		this._draggedObjIds.add(obj._uuid);
		this._draggedObjIdsSorted = Array.from(this._draggedObjIds);
		this._draggedObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterDrawnObj(obj) {
		this._drawnObjIds.delete(obj._uuid);
	}

	unregisterMouseListeningObj(obj) {
		this._mouseListeningObjIds.delete(obj._uuid);
		this._mouseListeningObjIdsSorted = Array.from(this._mouseListeningObjIds);
		this._mouseListeningObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterWheelListeningObj(obj) {
		this._wheelListeningObjIds.delete(obj._uuid);
		this._wheelListeningObjIdsSorted = Array.from(this._wheelListeningObjIds);
		this._wheelListeningObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterPointerAwareObj(obj) {
		obj._pointerAware = false;
		this._pointerAwareObjIds.delete(obj._uuid);
		this._pointerAwareObjIdsSorted = Array.from(this._pointerAwareObjIds);
		this._pointerAwareObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterPointerOverlappingObj(obj) {
		obj._pointerOverlapping = false;
		this._pointerOverlappingObjIds.delete(obj._uuid);
		this._pointerOverlappingObjIdsSorted = Array.from(this._pointerOverlappingObjIds);
		this._pointerOverlappingObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterHeldObj(obj) {
		obj._held = false;
		this._heldObjIds.delete(obj._uuid);
		this._heldObjIdsSorted = Array.from(this._heldObjIds);
		this._heldObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterDraggedObj(obj) {
		obj._dragged = false;
		this._draggedObjIds.delete(obj._uuid);
		this._draggedObjIdsSorted = Array.from(this._draggedObjIds);
		this._draggedObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterAllDrawnObjs() {
		this._drawnObjIds.clear();
		this.registerDrawnObj(this._background);
	}

	unregisterAllMouseListeningObjs() {
		this._mouseListeningObjIds.clear();
		this._mouseListeningObjIdsSorted = [];
		this.registerMouseListeningObj(this._background);
	}

	unregisterAllPointerAwareObjs() {
		this._pointerAwareObjIds.forEach(id => this._allObjs[id]._pointerAware = false);
		this._pointerAwareObjIds.clear();
		this._pointerAwareObjIdsSorted = [];
	}

	unregisterAllPointerOverlappingObjs() {
		this._pointerOverlappingObjIds.forEach(id => this._allObjs[id]._pointerOverlapping = false);
		this._pointerOverlappingObjIds.clear();
		this._pointerOverlappingObjIdsSorted = [];
	}

	unregisterAllHeldObjs() {
		this._heldObjIds.forEach(id => this._allObjs[id]._held = false);
		this._heldObjIds.clear();
		this._heldObjIdsSorted = [];
	}

	unregisterAllDraggedObjs() {
		this._draggedObjIds.forEach(id => this._allObjs[id]._dragged = false);
		this._draggedObjIds.clear();
		this._draggedObjIdsSorted = [];
	}

	forget(obj) {
		if (obj === this._background) {
			return false;
		}

		obj.onForget();
		delete this._allObjs[obj._uuid];
		this.unregisterDrawnObj(obj);
		this.unregisterMouseListeningObj(obj);
		this.unregisterPointerAwareObj(obj);
		this.unregisterPointerOverlappingObj(obj);
		this.unregisterHeldObj(obj);
		this.unregisterDraggedObj(obj);
		this.queueRedraw();
		// update mouse logic in case an object is removed that was preventing a lower object from being touched
		this._pointerUpdated();
	}

	forgetAll() {
		for (const obj of Object.values(this._allObjs)) {
			this.forget(obj);
		}
	}

	// tickMultiplier = integer equiv of deltaTime
	// overflow = accidental ms delay since last tick
	_onTick(deltaT, tickMultiplier, overflow) {
		if (this._tickListeners) {
			Object.values(this._tickListeners).forEach(f => f(this, deltaT, tickMultiplier, overflow));
		}
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
				self._onTick(deltaTime * extraTicks / 1000 + 1, extraTicks, overflowTime);
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

	_pointerUpdated(e) {
		let newPointerElemPos = this._pointerElemPos;
		if (e) {
			newPointerElemPos = new NPoint(
				e.pageX - this.container.offsetLeft,
				e.pageY - this.container.offsetTop
			);
		}
		this._pointerElemDelta = newPointerElemPos.subtractp(this._pointerElemPos);
		this._pointerElemPos = newPointerElemPos;
		const newPointerPos = this.pageToViewSpace(this._pointerElemPos);
		this._pointerDragDelta = newPointerPos.subtractp(this._mouseDownPos);
		this._pointerDelta = newPointerPos.subtractp(this._pointerPos);
		this._pointerPos = newPointerPos;
		this._preOnPointerMove(e);

		// dragging
		if (this._mouseDown) {
			this._pointerDragMaxDelta = Math.max(this._pointerDragMaxDelta, this._mouseDownPos.subtractp(newPointerPos).length());
			this._pointerDragDistance += this._pointerDelta.length();
			if (this._pointerDragDistance >= this.nonDragThreshold) {
				for (const uuid of this._heldObjIdsSorted) {
					const obj = this._allObjs[uuid];
					if (!this._draggedObjIds.has(uuid)) {
						this.registerDraggedObj(obj);
						obj.onDragStarted(e);
					}
					obj.onDragged(e);
				}
			}
		}

		// determine pointer awareness
		const prevPointerAwareObjIds = new Set(this._pointerAwareObjIds);
		const currentPointerAwareObjIds = new Set();
		const newlyPointerAwareObjs = [];
		for (const uuid of this._mouseListeningObjIdsSorted) {
			const obj = this._allObjs[uuid];

			if ((!obj._mouseListening) || obj.ignoreAllPointerEvents()) {
				continue;
			}

			if (obj.intersects(this._pointerPos)) {
				currentPointerAwareObjIds.add(uuid);
				// is newly aware
				if (!prevPointerAwareObjIds.has(uuid)) {
					newlyPointerAwareObjs.push(obj);
					this.registerPointerAwareObj(obj);
				}
				if (obj.blockAllPointerEvents()) {
					break;
				}
			}
		}

		// no longer aware objects
		for (const uuid of prevPointerAwareObjIds) {
			const obj = this._allObjs[uuid];
			if (!currentPointerAwareObjIds.has(uuid)) {
				this.unregisterPointerAwareObj(obj);
				obj.onPointerAwarenessEnded(e);
			}
		}

		// determine overlaps (similar to, but not the same as awareness)
		const prevPointerOverlappingObjIds = new Set(this._pointerOverlappingObjIds);
		const currentPointerOverlappingObjIds = new Set();
		const newlyPointerOverlappingObjs = [];
		for (const uuid of this._pointerAwareObjIdsSorted) {
			const obj = this._allObjs[uuid];
			if (obj.ignoreOverlapEvent(e)) {
				continue;
			}
			currentPointerOverlappingObjIds.add(uuid);

			// newly overlapping
			if (!prevPointerOverlappingObjIds.has(uuid)) {
				newlyPointerOverlappingObjs.push(obj);
				this.registerPointerOverlappingObj(obj);
			}
			if (obj.blockOverlapEvent(e)) {
				break;
			}
		}

		// no longer overlapping
		for (const uuid of prevPointerOverlappingObjIds) {
			const obj = this._allObjs[uuid];
			if (!currentPointerOverlappingObjIds.has(uuid)) {
				this.unregisterPointerOverlappingObj(obj);
				obj.onPointerOverlapEnded(e);
			}
		}

		// events for newly aware objs
		// do this down here because started events should happen after ended events
		for (const obj of newlyPointerAwareObjs) {
			obj.onPointerAwarenessStarted(e);
		}

		// events for newly overlapping objs
		// do this down here because started events should happen after ended events
		for (const obj of newlyPointerOverlappingObjs) {
			obj.onPointerOverlapStarted(e);
		}

		// events for overlapping movement
		// do this down here because started events should happen after ended events
		for (const uuid of this._pointerAwareObjIdsSorted) {
			const obj = this._allObjs[uuid];
			obj.onPointerOverlapMovement(e);
		}

		this._postOnPointerMove(e);
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
					if (self._pointerWithin) {
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

	_zoomUpdatePanCenter(prevZoomFactor, zoomCenter = null, quiet = false) {
		if (this._minZoomFactor > this._maxZoomFactor) {
			throw `Invalid zoom minimum and maximum! [${self._minZoomFactor}, ${self._maxZoomFactor}]`;
		}

		if (this._minZoomFactor == this._maxZoomFactor) {
			return;
		}

		if (zoomCenter === null) {
			switch (this._zoomCenterMode) {
				case "center":
					zoomCenter = this._vpCenter;
					break;
				case "pointer":
					zoomCenter = this._pointerElemPos;
					break;
			}
		}

		this._panCenter = this._panCenter.subtractp(
			zoomCenter.subtractp(this._panCenter.addp(this._vpCenter))
			.divide1(prevZoomFactor).multiply1(this._zoomFactor - prevZoomFactor)
		);
		if (!quiet) {
			this._pointerUpdated();
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

	offsetZoomCounter(delta, quiet = false) {
		this.setZoomCounter(this._zoomCounter + (delta * this.zoomSensitivity), null, quiet);
	}

	setPanCenter(newCenter, quiet = false) {
		this._panCenter = newCenter;
		if (!quiet) {
			this._pointerUpdated();
		}
		this.queueRedraw();
	}

	offsetPanCenter(deltaX, deltaY, quiet = false) {
		let centerDelta = new NPoint(deltaX, deltaY).multiply1(this.panSensitivity);
		if (this.inversePanning) {
			centerDelta = centerDelta.negate();
		}
		this.setPanCenter(this._panCenter.addp(centerDelta), quiet);
	}

	_setupMouseListeners() {
		const self = this;
		this.container.addEventListener("pointerenter", function (e) {
			self._pointerWithin = true;
		});

		this.container.addEventListener("pointerleave", function (e) {
			self._pointerWithin = false;
		});

		this.container.addEventListener("wheel", function (e) {
			self._preOnMouseWheel(e);
			for (const uuid of self._pointerAwareObjIdsSorted) {
				const obj = self._allObjs[uuid];
				if(obj.ignoreWheelEvent(e)){
					continue;
				}
				obj.onWheel(e);
				if(obj.blockWheelEvent(e)){
					break;
				}
			}
			self._postOnMouseWheel(e);
			e.preventDefault();
		});

		this.container.addEventListener("pointerdown", function (e) {
			self.queueRedraw();
			self._mouseDownPos = self.pageToViewSpace(self._pointerElemPos);
			self._mouseDown = true;
			self._preOnMouseDown(e);
			for (const uuid of self._pointerAwareObjIdsSorted) {
				const obj = self._allObjs[uuid];
				if (obj.ignoreClickEvent(e)) {
					continue;
				}
				self.registerHeldObj(obj);
				obj.onPressed(e);
				if (obj.blockClickEvent(e)) {
					break;
				}
			}
			self._postOnMouseDown(e);
			self._pointerUpdated();
			e.preventDefault();
		});

		document.addEventListener("pointerup", function (e) {
			self.queueRedraw();
			self._preOnMouseUp(e);
			self._mouseDown = false;
			for (const uuid of self._pointerAwareObjIdsSorted) {
				const obj = self._allObjs[uuid];

				if (obj.ignoreClickEvent(e)) {
					continue;
				}
				obj.onMouseUp(e);
				if (obj.blockClickEvent(e)) {
					break;
				}
			}

			const isDrag = self._pointerDragDistance >= self.nonDragThreshold;
			if (!isDrag) {
				self._preOnMouseClick(e);
			}
			for (const uuid of self._heldObjIdsSorted) {
				const obj = self._allObjs[uuid];
				obj.onUnpressed(e);
				if (isDrag) {
					obj.onDragEnded(e);
				} else {
					obj.onClicked(e);
				}
			}
			self._pointerDragDistance = 0;
			self._pointerDragMaxDelta = 0;
			self.unregisterAllHeldObjs();
			self.unregisterAllDraggedObjs();
			self._postOnMouseUp(e);
			if (!isDrag) {
				self._postOnMouseClick(e);
			}
			self._pointerUpdated();
			e.preventDefault();
		});

		// this.container.style.touchAction = "none";
		document.addEventListener("pointermove", function (e) {
			self._pointerUpdated(e);
			e.preventDefault();
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