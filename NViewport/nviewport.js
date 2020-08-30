import VPBackground from "./vp_background.js";
import NPoint from "../npoint.js";
import {
	clamp
} from "../nmath.js";
import {
	insertSorted,
	removeSorted
} from "../nmisc.js";

export default class NViewport {
	constructor({
		minZoomFactor = 0.25,
		maxZoomFactor = 2,
		navigable = true,
		zoomSensitivity = 1,
		panSensitivity = 0.5,
		zoomCenterMode = "pointer", //center, pointer,
		baseActiveDims = new NPoint(500, 500),
		activeAreaBounded = false,
		fittingMode = "shrink",
		backgroundClass = VPBackground,
		activeAreaPadding = new NPoint(100, 100),
	} = {}) {
		this._container;
		this._canvas;

		this._setupDone = false;
		this._redrawQueued = false;

		this.targetTickrate = 60;

		this._pixelRatio = 3//window.devicePixelRatio;

		this._activeAreaBounded = activeAreaBounded; // if false, canvas is infinite in all directions
		this._baseActiveAreaDims; // assigned by setBaseActiveDims
		this._activeAreaCorners; // assigned by setBaseActiveDims
		this.setBaseActiveDims(baseActiveDims);
		this._fittingMode = fittingMode; // shrink, fill
		/**
		 * Padding is in element space pixels, not viewport space.
		 * Works in conjunction with minZoomFactor (if zoomFactor == 1, not all 4 borders can be visible at once)
		 */
		this._activeAreaPadding = activeAreaPadding;
		this._activeBackground = new backgroundClass(this);
		self._fittingScaleFactor;
		self._zoomFactorFitted; // locked to fittingScaleFactor * zoomFactor
		this._zoomCenterMode = zoomCenterMode;
		/** If bounded, minZoomFactor is limited by the padding (ie: cannot zoom beyond the padding) */
		this._minZoomFactor = minZoomFactor;
		this._maxZoomFactor = maxZoomFactor;
		this._zoomSensitivity = zoomSensitivity;
		this._zoomCounterBase = 1.0075;
		this._minZoomCounter = this.zoomFactorToCounter(this._minZoomFactor);
		this._maxZoomCounter = this.zoomFactorToCounter(this._maxZoomFactor);
		this._zoomFactor = 1;
		this._zoomCounter = this.zoomFactorToCounter(this._zoomFactor);

		this._navigable = navigable;
		this.inversePanning = true;
		// the offset of the origin to the viewport center. In screen space.
		this._panCenter = NPoint.ZERO;
		this.panSensitivity = panSensitivity;

		this._mouseDown = false;

		/** raw mouse position (relative to viewport element) */
		this._pointerElemPos = NPoint.ZERO;
		this._pointerElemDelta = NPoint.ZERO;

		/** relative to viewport objects */
		this._pointerPos = NPoint.ZERO;
		/** position where mouse was last pressed down */
		this._mouseDownPos = NPoint.ZERO;
		/** movement of mouse between ticks */
		this._pointerDelta = NPoint.ZERO;
		/** difference between mouse-down cursor position and current */
		this._pointerDragDelta = NPoint.ZERO;
		/** cumulative distance that mouse has been dragged in the current press */
		this._pointerDragDistance = 0;
		/** farthest distance that mouse has been from its press position */
		this._pointerDragMaxDelta = 0;

		this._cursorSuggests = {
			"default": 1
		};
		this._cursorPriorities = ["none", "not-allowed", "help", "grabbing", "grab", "move", "pointer", "crosshair", "default"];

		// size of the literal canvas element
		this._divDims = NPoint.ZERO;
		// center of the literal canvas element
		this._divCenter = NPoint.ZERO;
		// size of the canvas context
		this._canvasDims = NPoint.ZERO;
		// center of the canvas context
		this._canvasCenter = NPoint.ZERO;
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
		this._pointerOverlappingObjIdsSorted = []
		this._heldObjIdsSorted = []
		this._draggedObjIdsSorted = []

		this._preMouseDownListeners = {}
		this._preMouseUpListeners = {}
		this._preMouseClickListeners = {}
		this._prePointerMoveListeners = {}
		this._preMouselListeners = {}
		this._preMouseWheelListeners = {}
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

		this.depthSorter = function (aid, bid) {
			const a = this._allObjs[aid];
			const b = this._allObjs[bid];
			return (b.zOrder - a.zOrder) ||
				(b.zSubOrder - a.zSubOrder) ||
				(b._drawRegisterNum - a._drawRegisterNum);
		}.bind(this);

		this.reverseDepthSorter = function (aid, bid) {
			return this.depthSorter(bid, aid);
		}.bind(this);

		this._redraw = this.__redrawUnbound.bind(this);
	}

	setup(parentDiv) {
		if (!this._setupDone) {
			this._setupElements();
			parentDiv.appendChild(this._container);
			this._setupScrollLogic();
			this._setupMouseListeners();
			this._setupKeyListeners();
			this.registerObj(this._activeBackground);
			this._setupDone = true;
		}
	}

	recenter() {
		this.setPanCenter(NPoint.ZERO);
	}

	setBaseActiveDims(dims) {
		this._baseActiveAreaDims = dims;
		this._activeAreaCorners = dims.multiply1(0.5).mirrors();
	}

	_preOnMouseDown(mouseClickEvent) {
		Object.values(this._preMouseDownListeners).forEach(f => f(this, mouseClickEvent));
	}

	_preOnMouseUp(mouseClickEvent) {
		Object.values(this._preMouseUpListeners).forEach(f => f(this, mouseClickEvent));
	}

	_preOnMouseClick(mouseClickEvent) {
		Object.values(this._preMouseClickListeners).forEach(f => f(this, mouseClickEvent));
	}

	_preOnPointerMove(pointerMoveEvent) {
		Object.values(this._prePointerMoveListeners).forEach(f => f(this, pointerMoveEvent));
	}

	_preOnMouseWheel(wheelEvent) {
		Object.values(this._preMouseWheelListeners).forEach(f => f(this, wheelEvent));
	}

	_postOnMouseDown(mouseClickEvent) {
		Object.values(this._postMouseDownListeners).forEach(f => f(this, mouseClickEvent));
	}

	_postOnMouseUp(mouseClickEvent) {
		Object.values(this._postMouseUpListeners).forEach(f => f(this, mouseClickEvent));
	}

	_postOnMouseClick(mouseClickEvent) {
		Object.values(this._postMouseClickListeners).forEach(f => f(this, mouseClickEvent));
	}

	_postOnPointerMove(pointerMoveEvent) {
		Object.values(this._postPointerMoveListeners).forEach(f => f(this, pointerMoveEvent));
	}

	_postOnMouseWheel(wheelEvent) {
		Object.values(this._postMouseWheelListeners).forEach(f => f(this, wheelEvent));
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
		insertSorted(this._mouseListeningObjIdsSorted, obj._uuid, this.depthSorter);
	}

	registerPointerAwareObj(obj) {
		obj._pointerAware = true;
		this._pointerAwareObjIds.add(obj._uuid);
		insertSorted(this._pointerAwareObjIdsSorted, obj._uuid, this.depthSorter);
	}

	registerPointerOverlappingObj(obj) {
		obj._pointerOverlapping = true;
		this._pointerOverlappingObjIds.add(obj._uuid);
		insertSorted(this._pointerOverlappingObjIdsSorted, obj._uuid, this.depthSorter);
	}

	registerHeldObj(obj) {
		obj._held = true;
		this._heldObjIds.add(obj._uuid);
		insertSorted(this._heldObjIdsSorted, obj._uuid, this.depthSorter);
	}

	registerDraggedObj(obj) {
		obj._dragged = true;
		this._draggedObjIds.add(obj._uuid);
		insertSorted(this._draggedObjIdsSorted, obj._uuid, this.depthSorter);
	}

	unregisterDrawnObj(obj) {
		this._drawnObjIds.delete(obj._uuid);
	}

	unregisterMouseListeningObj(obj) {
		this._mouseListeningObjIds.delete(obj._uuid);
		removeSorted(this._mouseListeningObjIdsSorted, obj._uuid, this.depthSorter);
	}

	unregisterPointerAwareObj(obj) {
		obj._pointerAware = false;
		this._pointerAwareObjIds.delete(obj._uuid);
		removeSorted(this._pointerAwareObjIdsSorted, obj._uuid, this.depthSorter);
	}

	unregisterPointerOverlappingObj(obj) {
		obj._pointerOverlapping = false;
		this._pointerOverlappingObjIds.delete(obj._uuid);
		removeSorted(this._pointerOverlappingObjIdsSorted, obj._uuid, this.depthSorter);
	}

	unregisterHeldObj(obj) {
		obj._held = false;
		this._heldObjIds.delete(obj._uuid);
		removeSorted(this._heldObjIdsSorted, obj._uuid, this.depthSorter);
	}

	unregisterDraggedObj(obj) {
		obj._dragged = false;
		this._draggedObjIds.delete(obj._uuid);
		removeSorted(this._draggedObjIdsSorted, obj._uuid, this.depthSorter);
	}

	unregisterAllDrawnObjs() {
		this._drawnObjIds.clear();
		this.registerDrawnObj(this._activeBackground);
	}

	unregisterAllMouseListeningObjs() {
		this._mouseListeningObjIds.clear();
		this._mouseListeningObjIdsSorted.length = 0;
		this.registerMouseListeningObj(this._activeBackground);
	}

	unregisterAllPointerAwareObjs() {
		this._pointerAwareObjIds.forEach(id => this._allObjs[id]._pointerAware = false);
		this._pointerAwareObjIds.clear();
		this._pointerAwareObjIdsSorted.length = 0;
	}

	unregisterAllPointerOverlappingObjs() {
		this._pointerOverlappingObjIds.forEach(id => this._allObjs[id]._pointerOverlapping = false);
		this._pointerOverlappingObjIds.clear();
		this._pointerOverlappingObjIdsSorted.length = 0;
	}

	unregisterAllHeldObjs() {
		this._heldObjIds.forEach(id => this._allObjs[id]._held = false);
		this._heldObjIds.clear();
		this._heldObjIdsSorted.length = 0;
	}

	unregisterAllDraggedObjs() {
		this._draggedObjIds.forEach(id => this._allObjs[id]._dragged = false);
		this._draggedObjIds.clear();
		this._draggedObjIdsSorted.length = 0;
	}

	forget(obj) {
		if (obj === this._activeBackground) {
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
			window.requestAnimationFrame(this._redraw);
			// setTimeout(_ => this._redraw, 0);
		}
	}



	__redrawUnbound() {
		if (this._setupDone) {
			this._redrawQueued = false;
			this.ctx.resetTransform();
			this.ctx.clearRect(0, 0, this._canvasDims.x, this._canvasDims.y);

			// matrix version of viewportToDivSpace
			const scale = this._zoomFactorFitted;
			const xOffset = this._canvasCenter.x + this._panCenter.x * this._pixelRatio;
			const yOffset = this._canvasCenter.y + this._panCenter.y * this._pixelRatio;
			this.ctx.setTransform(scale, 0, 0, scale, xOffset, yOffset);

			if (this._activeAreaBounded) {
				this.ctx.save();
				this.ctx.beginPath();
				const dims = this._baseActiveAreaDims;
				this.ctx.rect(-(dims.x >> 1), -(dims.y >> 1), dims.x, dims.y);
				this.ctx.closePath();
				this.ctx.clip();
			}

			const drawnObjIdsSorted = Array.from(this._drawnObjIds);
			drawnObjIdsSorted.sort(this.reverseDepthSorter);
			for (const uuid of drawnObjIdsSorted) {
				const obj = this._allObjs[uuid];
				obj.draw(this.ctx);
			}

			if (this._activeAreaBounded) {
				this.ctx.restore();
			}

			this.onRedraw();
		}
	}

	onRedraw() {}

	_setupElements() {
		this._container = document.createElement("div");
		this._container.classList.add("vpContainer");
		this._container.style.width = "100%";
		this._container.style.height = "100%";
		this._container.style.background = "transparent";

		this._canvas = document.createElement("canvas");
		this._canvas.style.width = "100%";
		this._canvas.style.height = "100%";
		this._canvas.style.background = "transparent";
		this._container.appendChild(this._canvas);
		this.ctx = this._canvas.getContext("2d");
	}

	divToViewportSpace(npoint) {
		return npoint.subtractp(this._divCenter.addp(this._panCenter))
		.multiply1(this._pixelRatio / this._zoomFactorFitted)
		// .clamp1p(this._activeAreaCorners[0]);
	}

	viewportToDivSpace(npoint) {
		return npoint.divide1(this._pixelRatio / this._zoomFactorFitted).addp(this._divCenter.addp(this._panCenter));
	}

	_setupScrollLogic() {
		const self = this;
		self.resizeObserver = new ResizeObserver(function (e) {
			const resizeRect = e[0].contentRect;
			self._divDims = new NPoint(resizeRect.width, resizeRect.height);
			self._divCenter = self._divDims.operate(c => c >> 1);

			self._canvasDims = self._divDims.multiply1(self._pixelRatio);
			self._canvasCenter = self._canvasDims.operate(c => c >> 1);
			self._canvas.width = self._canvasDims.x;
			self._canvas.height = self._canvasDims.y;

			const scaleDims = self._canvasDims.dividep(self._baseActiveAreaDims);
			self._fittingScaleFactor = self._fittingMode === "fill" ? scaleDims.greater() : scaleDims.lesser();
			self._zoomFactorFitted = self._fittingScaleFactor * self._zoomFactor;

			self.queueRedraw();
		});
		self.resizeObserver.observe(this._container);
	}

	_pointerUpdated(e) {
		let newPointerElemPos = this._pointerElemPos;
		if (e) {
			newPointerElemPos = new NPoint(
				e.pageX - this._container.offsetLeft,
				e.pageY - this._container.offsetTop
			);
		}
		this._pointerElemDelta = newPointerElemPos.subtractp(this._pointerElemPos);
		this._pointerElemPos = newPointerElemPos;
		const newPointerPos = this.divToViewportSpace(this._pointerElemPos);
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
					zoomCenter = this._divCenter;
					break;
				case "pointer":
					zoomCenter = this._pointerElemPos;
					break;
			}
		}
		this.setPanCenter(this._panCenter.subtractp(
			zoomCenter.subtractp(this._panCenter.addp(this._divCenter))
			.divide1(prevZoomFactor).multiply1(this._zoomFactor - prevZoomFactor)
		), quiet);
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
		this._zoomFactorFitted = this._fittingScaleFactor * this._zoomFactor;
		this._zoomCounter = this.zoomFactorToCounter(this._zoomFactor);
		this._zoomUpdatePanCenter(prevZoomFactor, zoomCenter, quiet);
	}

	setZoomCounter(newZoomCounter, zoomCenter = null, quiet = false) {
		const prevZoomFactor = this._zoomFactor;
		this._zoomCounter = clamp(newZoomCounter, this._minZoomCounter, this._maxZoomCounter);
		this._zoomFactor = this.zoomCounterToFactor(this._zoomCounter);
		this._zoomFactorFitted = this._fittingScaleFactor * this._zoomFactor;
		this._zoomUpdatePanCenter(prevZoomFactor, zoomCenter, quiet);
	}

	scrollZoomCounter(delta, quiet = false) {
		this.setZoomCounter(this._zoomCounter + (delta * this._zoomSensitivity), null, quiet);
	}

	setPanCenter(newCenter, quiet = false) {
		const corner = this._baseActiveAreaDims.multiply1(0.5 * this._zoomFactorFitted);

		const clamping = corner.subtractp(this._canvasCenter).divide1(this._pixelRatio).addp(this._activeAreaPadding).max1(0);
		this._panCenter = newCenter.clamp1p(clamping);
		if (!quiet) {
			this._pointerUpdated();
		}
		this.queueRedraw();
	}

	scrollPanCenter(deltaX, deltaY, quiet = false) {
		let centerDelta = new NPoint(deltaX, deltaY).multiply1(this.panSensitivity);
		if (this.inversePanning) {
			centerDelta = centerDelta.negate();
		}
		this.setPanCenter(this._panCenter.addp(centerDelta), quiet);
	}

	_setupMouseListeners() {
		const self = this;
		this._container.addEventListener("pointerenter", function (e) {
			self._pointerWithin = true;
		});

		this._container.addEventListener("pointerleave", function (e) {
			self._pointerWithin = false;
		});

		this._container.addEventListener("wheel", function (e) {
			self._preOnMouseWheel(e);
			for (const uuid of self._pointerAwareObjIdsSorted) {
				const obj = self._allObjs[uuid];
				if (obj.ignoreWheelEvent(e)) {
					continue;
				}
				obj.onWheel(e);
				if (obj.blockWheelEvent(e)) {
					break;
				}
			}
			self._postOnMouseWheel(e);
			e.preventDefault();
		});

		this._container.addEventListener("pointerdown", function (e) {
			self.queueRedraw();
			self._mouseDownPos = self.divToViewportSpace(self._pointerElemPos);
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
				this._canvas.style.cursor = type;
				break;
			}
		}
	}
}