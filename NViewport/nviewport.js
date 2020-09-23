import VPBackground from "./vp-background.js";
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
		zoomCenterMode = "pointer", //view, pointer, origin
		baseActiveDims = new NPoint(500, 500),
		activeAreaBounded = false,
		fittingBasis = "element",
		fittingMode = "shrink",
		activeBackgroundClass = VPBackground,
		activeAreaPadding = new NPoint(100, 100),
		targetTickrate = 60,
		responsiveResize = true,
		pixelRatio = window.devicePixelRatio,
		outOfBoundsStyle = "#111",
		minimizeThresholdX = 100,
		minimizeThresholdY = 100,
	} = {}) {
		this._container;
		this._canvas;
		this._outOfBoundsStyle = outOfBoundsStyle;

		this._isActive = false;
		this._enabled = true;
		this._setupDone = false;
		this._visible = false;
		this._isMinimized = false;
		this._minimizeThresholdX = minimizeThresholdX;
		this._minimizeThresholdY = minimizeThresholdY;
		this._responsiveResize = responsiveResize;
		/** ignored in simple loop */
		this._targetTickrate = targetTickrate;

		this.setPixelRatio(pixelRatio);

		this._activeAreaBounded = activeAreaBounded; // if false, canvas is infinite in all directions
		this._baseActiveAreaDims; // assigned by setBaseActiveDims
		this._activeAreaCorners; // assigned by setBaseActiveDims
		this.setBaseActiveDims(baseActiveDims);
		this._fittingBasis = fittingBasis; // element, window
		this._fittingMode = fittingMode; // shrink, fill
		this._visibleAreaMinCorner;
		this._visibleAreaMaxCorner;
		/**
		 * Padding is in element space pixels, not viewport space nor canvas space.
		 * Works in conjunction with minZoomFactor (if zoomFactor == 1, not all 4 borders can be visible at once)
		 */
		this._activeAreaPadding = activeAreaPadding;
		this._activeBackgroundClass = activeBackgroundClass;
		this._activeBackground;
		this._fittingScaleFactor;
		this._zoomFactorFitted; // locked to fittingScaleFactor * zoomFactor
		this._zoomCenterMode = zoomCenterMode;
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
		/** cumulative distance that mouse has been dragged in the current press */


		/** raw mouse position (relative to element) */
		this._pointerElemPos = NPoint.ZERO;
		this._pointerElemDelta = NPoint.ZERO;
		this._pointerElemDragDistance = 0;
		this._mouseElemDownPos = NPoint.ZERO;
		this._pointerWithinBounds = false;
		this._cursorSuggests = {
			"default": 1
		};
		this._cursorPriorities = ["none", "not-allowed", "help", "grabbing", "grab", "move", "pointer", "crosshair", "default"];

		this._resizeObserver;

		// size of the literal canvas element
		this._divDims;
		// center of the literal canvas element
		this._divCenter;
		// size of the canvas context
		this._canvasDims;
		// center of the canvas context
		this._canvasCenter;
		this.nonDragThreshold = 4;

		this._allObjs = {};
		this._objRegistries = new Map();
		
		this._globalEventChannels = new Map(); // eventName: {listeners: Map, listenerIdCounter: int}

		// is the mouse over the viewport?
		this._pointerWithinElement = false;
		this._ctrlDown = false;
		this._shiftDown = false;
		this._altDown = false;
		this._downKeys = new Set();
		
		// used for drawing objects in order when they have the same z-depth/z-sub-depth
		this._drawRegisterCounter = 0;

		this.depthSorter = function (aid, bid) {
			const a = this._allObjs[aid];
			const b = this._allObjs[bid];
			return (b._zOrder - a._zOrder) ||
				(b._zSubOrder - a._zSubOrder) || 
				(b._drawRegisterNum - a._drawRegisterNum);
		}.bind(this);

		this.reverseDepthSorter = function (aid, bid) {
			return this.depthSorter(bid, aid);
		}.bind(this);

		// this._redraw = this.__redrawUnbound.bind(this);
		this._update = this.__updateUnbound.bind(this);
		this._pendingUpdate = false;
		this._pendingRedraw = false;
		this._pendingResizeUpdate = null;
	}

	/** for most cases, no not override. Override onSetup instead. */
	setup(parentDiv = null) {
		if (!this._setupDone) {
			this._setupObjRegistries();
			this._setupGlobalEventChannels();
			this._setupElements();
			if (parentDiv !== null) {
				parentDiv.appendChild(this._container);
			}
			this._setupScrollLogic();
			this._setupMouseListeners();
			this._setupKeyListeners();
			this._activeBackground = new this._activeBackgroundClass(this);
			this.registerObj(this._activeBackground);
			window.setTimeout(function () {
				const pc = this._panCenter;
				this._setupDone = true;
				this._setupVisibilityListener();
				this.updateActiveState();
				this.onSetup();
				window.setTimeout(function () {
					this.queueRedraw();
				}.bind(this), 0);
			}.bind(this), 0);
		}
		return this;
	}

	_setupObjRegistries(){
		this.addObjRegistry("drawable", this.reverseDepthSorter, function(obj){
			this._drawRegisterCounter++;
			obj._drawRegisterNum = this._drawRegisterCounter;
		}.bind(this));
		this.addObjRegistry("tickable", null);
		this.addObjRegistry("mouseListening", this.depthSorter);
		this.addObjRegistry("pointerAware", this.depthSorter);
		this.addObjRegistry("pointerOverlapping", this.depthSorter);
		this.addObjRegistry("held", this.depthSorter);
		this.addObjRegistry("dragged", this.depthSorter);
	}

	_setupGlobalEventChannels(){
		this._addGlobalEventChannel("preMouseDown");
		this._addGlobalEventChannel("postMouseDown");
		this._addGlobalEventChannel("preMouseUp");
		this._addGlobalEventChannel("postMouseUp");
		this._addGlobalEventChannel("preMouseClick");
		this._addGlobalEventChannel("postMouseClick");
		this._addGlobalEventChannel("prePointerMove");
		this._addGlobalEventChannel("postPointerMove");
		this._addGlobalEventChannel("preMouseWheel");
		this._addGlobalEventChannel("postMouseWheel");
		this._addGlobalEventChannel("preTick");
		this._addGlobalEventChannel("postTick");
		this._addGlobalEventChannel("resize");
	}

	_setupVisibilityListener() {
		const self = this;
		const observer = new IntersectionObserver(function (entries, observer) {
			if (entries[0].isIntersecting) {
				self._visible = true;
				self.updateActiveState();
				self.onVisible();
			} else {
				self._visible = false;
				self.updateActiveState();
				self.onHidden();
			}
		}, {
			root: document.documentElement,
		});

		observer.observe(this._container);
	}

	onVisible() {}

	onHidden() {}

	setEnabled(newState) {
		if (newState ^ this._enabled) {
			this._enabled = newState
			this.updateActiveState();
		}
	}

	updateActiveState() {
		const newState = this._setupDone && this._enabled && this._visible && (!this._isMinimized);
		if (newState ^ this._isActive) {
			this._isActive = newState;
			if (newState) {
				this.queueRedraw();
				this.onActivated();
			} else {
				this.onDeactivated();
			}
		}
	}

	onActivated() {}

	onDeactivated() {}

	setParent(parentDiv) {
		parentDiv.appendChild(this._container);
	}

	onSetup() {}

	recenter() {
		this.setPanCenter(NPoint.ZERO);
	}

	setBaseActiveDims(dims) {
		this._baseActiveAreaDims = dims;
		this._activeAreaCorners = dims.multiply1(0.5).mirrors();
	}

	setPixelRatio(pixelRatio) {
		this._pixelRatio = pixelRatio;
	}

	_addGlobalEventChannel(eventName) {
		this._globalEventChannels.set(eventName, {
			_listeners: new Map(),
			_listenerIdCounter: 0,
		});
	}

	registerGlobalEventListener(eventName, callback) {
		const dat = this._globalEventChannels.get(eventName);
		dat._listenerIdCounter++;
		dat._listeners[dat._listenerIdCounter] = callback;
		return dat._listenerIdCounter;
	}

	unregisterGlobalEventListener(eventName, listenerId) {
		this._globalEventChannels.get(eventName).delete(listenerId);
	}

	callGlobalEvent(eventName, data) {
		this._globalEventChannels.get(eventName)._listeners.forEach(f => f(this, data));
	}

	registerObj(obj) {
		this._allObjs[obj._uuid] = obj;
		if (obj._drawable) {
			this.registerObjFor("drawable", obj);
		}
		if (obj._mouseListening) {
			this.registerObjFor("mouseListening", obj);
		}
		if (obj._tickable) {
			this.registerObjFor("tickable", obj);
		}
		this.queueRedraw();
	}

	registryForHas(registryName, obj){
		return this._objRegistries.get(registryName)._idSet.has(obj._uuid);
	}

	registerObjFor(registryName, obj){
		// set appropriate object field
		obj._registeredStates.set(registryName, true);
		
		// add to registry
		const dat = this._objRegistries.get(registryName);
		dat._idSet.add(obj._uuid);
		dat._onRegister(obj);
		if(dat._sorted !== undefined){
			insertSorted(dat._sorted, obj._uuid, dat._sorter);
		}
	}
	
	unregisterObjFor(registryName, obj){
		// set appropriate object field
		obj._registeredStates.set(registryName, false);
		
		// remove from registry
		const dat = this._objRegistries.get(registryName);
		dat._idSet.delete(obj._uuid);
		if(dat._sorted !== undefined){
			dat._sorted.splice(dat._sorted.indexOf(obj._uuid), 1);
			// TODO figure out why removeSorted breaks
			removeSorted(dat._sorted, obj._uuid, dat._sorter);
		}
	}

	changeObjOrdering(registryName, obj, func){
		const dat = this._objRegistries.get(registryName);
		removeSorted(dat._sorted, obj._uuid, dat._sorter);
		func(obj);
		insertSorted(dat._sorted, obj._uuid, dat._sorter);
	}

	unregisterAllObjsFor(registryName){
		const dat = this._objRegistries.get(registryName);
		dat._idSet.forEach(id => this._allObjs[id]._registeredStates.set(registryName, false));
		dat._idSet.clear();
		dat._sorted.length = 0;
	}
	
	addObjRegistry(registryName, sorter=null, onRegister=Function.prototype){
		const dat = {
			_idSet: new Set(),
		};
		if(sorter !== null){
			dat._sorter = sorter;
			dat._sorted = [];
		}

		dat._onRegister = onRegister;

		this._objRegistries.set(registryName, dat);
	}

	getRegistryItems(registryName){
		return this._objRegistries.get(registryName)._idSet;
	}
	
	getRegistryItemsSorted(registryName){
		return this._objRegistries.get(registryName)._sorted;
	}
	
	getRegistrySize(registryName){
		return this._objRegistries.get(registryName)._idSet.size;
	}
	
	forget(obj) {
		if (obj === this._activeBackground) {
			return false;
		}

		obj.onForget();
		// unregister from every registry
		for(const [registryName, state] of obj._registeredStates){
			if(state){
				this.unregisterObjFor(registryName, obj);
			}
		}
		delete this._allObjs[obj._uuid];

		this.queueRedraw();

		// update mouse logic in case an object is removed that was preventing a lower object from being touched
		this._pointerUpdated();
	}

	forgetAll() {
		for (const obj of Object.values(this._allObjs)) {
			this.forget(obj);
		}
	}

	// tickMultiplier = tick-based equiv of deltaTime
	// overflow = accidental ms delay since last tick
	_onTick(deltaT, tickMultiplier, overflow) {
		// listeners
		this.callGlobalEvent("preTick", {
			deltaT: deltaT,
			tickMultiplier: tickMultiplier,
			overflow: overflow,
		});
		// tickable objs
		for (const uuid of this.getRegistryItems("tickable")) {
			const obj = this._allObjs[uuid];
			obj.onTick(deltaT, tickMultiplier, overflow);
		}
		// if (this._pendingRedraw) {
		// 	// this function is already inside an animation frame, so don't request another for drawing
		// 	// this._redraw();
		// }
		this.callGlobalEvent("postTick", {
			deltaT: deltaT,
			tickMultiplier: tickMultiplier,
			overflow: overflow,
		});
	}

	_setupSimpleLoop() {
		const self = this;
		let lastTime = Date.now();

		function loopIteration() {
			const currentTime = Date.now();
			self._onTick((currentTime - lastTime) * 0.001);
			lastTime = currentTime;
			self.request
			window.requestAnimationFrame(loopIteration, null, null);
		}
		loopIteration();
	}

	_setupComplexLoop() {
		const self = this;
		let currentTime = Date.now();
		let lastTime = currentTime;
		let deltaTime = 0;
		let overflowTime = 0;

		function requestNext() {
			window.requestAnimationFrame(loopIteration);
		};

		function loopIteration() {
			const targetDelay = 1000 / self._targetTickrate;
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
				// self._onTick(deltaTime * extraTicks / 1000, extraTicks, overflowTime);
				self._onTick(deltaTime / 1000, extraTicks, overflowTime);
				requestNext();
				deltaTime = 0;
			} else {
				setTimeout(requestNext, targetDelay - deltaTime);
			}
			lastTime = currentTime;
		}

		loopIteration();
	}

	queueUpdate() {
		if (!this._pendingUpdate) {
			this._pendingUpdate = true;
			window.requestAnimationFrame(this._update);
		}
	}

	queueRedraw() {
		this._pendingRedraw = true;
		this.queueUpdate();
	}

	queueResizeUpdate(event) {
		this._pendingResizeUpdate = event;
		if (this._responsiveResize) {
			this.__updateUnbound();
		} else {
			this.queueUpdate();
		}
	}

	__updateUnbound() {
		if (this._pendingResizeUpdate) {
			const evnt = this._pendingResizeUpdate;
			this._handleResize(evnt);
			this._pendingResizeUpdate = null;

			this._pendingRedraw = true;
		}
		if (this._pendingRedraw) {
			this._pendingRedraw = false;
			this._redraw();
		}
		this._pendingUpdate = false;
	}

	_handleResize(e) {
		const resizeRect = e[0].contentRect;
		this._isMinimized = (resizeRect.width <= this._minimizeThresholdX || resizeRect.height <= this._minimizeThresholdY);
		this.updateActiveState();
		if (this._isMinimized) {
			return;
		}
		this._divDims = new NPoint(resizeRect.width, resizeRect.height).clamp4(0, window.innerWidth, 0, window.innerHeight);
		// this._divCenter = this._divDims.operate(c => c >> 1);
		this._divCenter = this._divDims.multiply1(0.5);

		this._canvasDims = this._divDims.multiply1(this._pixelRatio);
		this._canvasCenter = this._canvasDims.operate(c => c >> 1);
		this._canvas.width = this._canvasDims.x;
		this._canvas.height = this._canvasDims.y;

		let scaleDims;
		switch (this._fittingBasis) {
			case "element":
				scaleDims = this._divDims;
				break;
			case "window":
				scaleDims = new NPoint(window.innerWidth, window.innerHeight);
		}
		scaleDims = scaleDims.dividep(this._baseActiveAreaDims);

		switch (this._fittingMode) {
			case "fill":
				this._fittingScaleFactor = scaleDims.greater()
				break;
			case "shrink":
				this._fittingScaleFactor = scaleDims.lesser()
				break;
			default:
				this._fittingScaleFactor = 1;
		}
		this._zoomFactorFitted = this._fittingScaleFactor * this._zoomFactor;
		this._viewSpaceUpdated();
		this.callGlobalEvent("resize", {
			resizeEvent: e
		});
	}

	_viewSpaceUpdated() {
		this._visibleAreaMinCorner = this.divToViewportSpace(NPoint.ZERO);
		this._visibleAreaMaxCorner = this.divToViewportSpace(this._divDims);
	}

	_redraw() {
		if (this._isActive) {
			this._ctx.resetTransform();
			this._ctx.clearRect(0, 0, this._canvasDims.x, this._canvasDims.y);

			// matrix version of viewportToDivSpace
			// canvas transform is in canvas space, so pixelRatio must be applied to both scale and offset
			const scale = this._zoomFactorFitted * this._pixelRatio;
			const xOffset = this._canvasCenter.x + this._panCenter.x * this._pixelRatio;
			const yOffset = this._canvasCenter.y + this._panCenter.y * this._pixelRatio;
			this._ctx.setTransform(scale, 0, 0, scale, xOffset, yOffset);

			// erase things outside of bounds
			if (this._activeAreaBounded) {
				this._ctx.save();
				this._ctx.beginPath();
				const dims = this._baseActiveAreaDims;
				this._ctx.rect(-(dims.x >> 1), -(dims.y >> 1), dims.x, dims.y);
				this._ctx.closePath();
				this._ctx.clip();
			}

			for (const uuid of this.getRegistryItemsSorted("drawable")) {
				const obj = this._allObjs[uuid];
				obj.draw(this._ctx);
			}

			if (this._activeAreaBounded) {
				this._ctx.restore();
			}

			this.onRedraw();
		}
	}

	onRedraw() {}

	_setupElements() {
		this._container = document.createElement("div");
		this._container.classList.add("vpContainer");
		this._container.style.height = "100%";
		this._container.style.lineHeight = 0;
		this._container.style.margin = 0;
		this._container.style.padding = 0;
		this._container.style.background = this._outOfBoundsStyle;

		this._canvas = document.createElement("canvas");
		this._canvas.style.width = "100%";
		this._canvas.style.height = "100%";
		this._canvas.style.lineHeight = 0;
		this._container.style.margin = 0;
		this._container.style.padding = 0;
		this._canvas.style.background = "transparent";
		this._container.appendChild(this._canvas);
		this._ctx = this._canvas.getContext("2d");
	}

	divToViewportSpace(npoint) {
		return npoint.subtractp(this._divCenter.addp(this._panCenter)).divide1(this._zoomFactorFitted);
	}

	viewportToDivSpace(npoint) {
		return npoint.multiply1(this._zoomFactorFitted).addp(this._divCenter.addp(this._panCenter));
	}

	_setupScrollLogic() {
		const self = this;
		self._resizeObserver = new ResizeObserver(function (e) {
			self.queueResizeUpdate(e);
		}.bind(self));
		self._resizeObserver.observe(this._container);
	}

	_pointerUpdated(e) {
		let newPointerElemPos = this._pointerElemPos;
		if (e) {
			const boundingRect = this._container.getBoundingClientRect();
			newPointerElemPos = new NPoint(
				e.pageX - boundingRect.left,
				e.pageY - boundingRect.top
			);
		}
		this._pointerElemDelta = newPointerElemPos.subtractp(this._pointerElemPos);
		this._pointerElemPos = newPointerElemPos;
		const newPointerPos = this.divToViewportSpace(this._pointerElemPos);
		this._pointerDragDelta = newPointerPos.subtractp(this._mouseDownPos);
		this._pointerElemDragDelta = newPointerElemPos.subtractp(this._mouseElemDownPos);
		this._pointerDelta = newPointerPos.subtractp(this._pointerPos);
		this._pointerPos = newPointerPos;
		this._pointerWithinBounds = this.isInBounds(this._pointerPos);

		this.callGlobalEvent("prePointerMove", {
			pointerEvent: e
		});

		// dragging
		if (this._mouseDown) {
			this._pointerDragMaxDelta = Math.max(this._pointerDragMaxDelta, this._mouseDownPos.subtractp(newPointerPos).length());
			this._pointerDragDistance += this._pointerDelta.length();
			this._pointerElemDragDistance += this._pointerElemDelta.length();

			if (this._pointerElemDragDistance >= this.nonDragThreshold) {
				for (const uuid of this.getRegistryItemsSorted("held")) {
					const obj = this._allObjs[uuid];
					if (!this.registryForHas("dragged", obj)) {
						this.registerObjFor("dragged", obj);
						obj.onDragStarted(e);
					}
					obj.onDragged(e);
				}
			}
		}

		// determine pointer awareness
		const prevPointerAwareObjIds = new Set(this.getRegistryItems("pointerAware"));
		const currentPointerAwareObjIds = new Set();
		const newlyPointerAwareObjs = [];

		for (const uuid of this.getRegistryItemsSorted("mouseListening")) {
			const obj = this._allObjs[uuid];

			if ((!obj._mouseListening) || obj.ignoreAllPointerEvents()) {
				continue;
			}

			if (obj.intersects(this._pointerPos, this._pointerWithinBounds)) {
				currentPointerAwareObjIds.add(uuid);
				// is newly aware
				if (!prevPointerAwareObjIds.has(uuid)) {
					newlyPointerAwareObjs.push(obj);
					this.registerObjFor("pointerAware", obj);
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
				this.unregisterObjFor("pointerAware", obj);
				obj.onPointerAwarenessEnded(e);
			}
		}

		// determine overlaps (similar to, but not the same as awareness)
		const prevPointerOverlappingObjIds = new Set(this.getRegistryItems("pointerOverlapping"));
		const currentPointerOverlappingObjIds = new Set();
		const newlyPointerOverlappingObjs = [];
		for (const uuid of this.getRegistryItemsSorted("pointerAware")) {
			const obj = this._allObjs[uuid];
			if (obj.ignoreOverlapEvent(e)) {
				continue;
			}
			currentPointerOverlappingObjIds.add(uuid);

			// newly overlapping
			if (!prevPointerOverlappingObjIds.has(uuid)) {
				newlyPointerOverlappingObjs.push(obj);
				this.registerObjFor("pointerOverlapping", obj);
			}
			if (obj.blockOverlapEvent(e)) {
				break;
			}
		}

		// no longer overlapping
		for (const uuid of prevPointerOverlappingObjIds) {
			const obj = this._allObjs[uuid];
			if (!currentPointerOverlappingObjIds.has(uuid)) {
				this.unregisterObjFor("pointerOverlapping", obj);
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
		for (const uuid of this.getRegistryItemsSorted("pointerAware")) {
			const obj = this._allObjs[uuid];
			obj.onPointerOverlapMovement(e);
		}

		this.callGlobalEvent("postPointerMove", {
			pointerEvent: e
		});
	}

	keyPressed(code) {}

	keyReleased(code) {}

	_setupKeyListeners() {
		const self = this;
		document.addEventListener("keydown", function (e) {
			const keyCode = e.key;
			switch (keyCode) {
				case "Shift":
					self._shiftDown = true;
					break;
				case "Control":
					self._ctrlDown = true;
					break;
				case "Alt":
					self._altDown = true;
					break;
				default:
					if (self._pointerWithinElement) {
						self._downKeys.add(keyCode);
						self.keyPressed(keyCode);
					}
			}
		});

		// global key up
		document.addEventListener("keyup", function (e) {
			const keyCode = e.key;
			switch (keyCode) {
				case "Shift":
					self._shiftDown = false;
					break;
				case "Control":
					self._ctrlDown = false;
					break;
				case "Alt":
					self._altDown = false;
					break;
				default:
					if (self._downKeys.delete(keyCode)) {
						self.keyReleased(keyCode);
					}
			}

		});
	}

	_zoomUpdatePanCenter(prevZoomFactor, zoomCenter = null, zoomCenterMode = null, quiet = false) {
		if (this._minZoomFactor > this._maxZoomFactor) {
			throw `Invalid zoom minimum and maximum! [${self._minZoomFactor}, ${self._maxZoomFactor}]`;
		}

		if (this._minZoomFactor == this._maxZoomFactor) {
			return;
		}

		if (zoomCenter === null) {
			switch (zoomCenterMode || this._zoomCenterMode) {
				case "origin":
					zoomCenter = this.viewportToDivSpace(NPoint.ZERO);
					break;
				case "pointer":
					zoomCenter = this._pointerElemPos;
					break;
				case "view":
					zoomCenter = this._divCenter;
					break;
				default:
					throw `"${this._zoomCenterMode}" is not a valid zoom center mode!`;
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
		this._zoomUpdatePanCenter(prevZoomFactor, zoomCenter, null, quiet);
	}

	setZoomCounter(newZoomCounter, zoomCenter = null, quiet = false) {
		const prevZoomFactor = this._zoomFactor;
		this._zoomCounter = clamp(newZoomCounter, this._minZoomCounter, this._maxZoomCounter);
		this._zoomFactor = this.zoomCounterToFactor(this._zoomCounter);
		this._zoomFactorFitted = this._fittingScaleFactor * this._zoomFactor;
		this._zoomUpdatePanCenter(prevZoomFactor, zoomCenter, null, quiet);
	}

	isInBounds(point, padding = NPoint.ZERO) {
		return (!this._activeAreaBounded) || point.withinRect(this._activeAreaCorners[0].addp(padding));
	}

	clampToBounds(point, padding = NPoint.ZERO) {
		if (this._activeAreaBounded) {
			return point.clamp1p(this._activeAreaCorners[0].add1(padding));
		}
		return point;
	}

	scrollZoomCounter(delta, quiet = false) {
		this.setZoomCounter(this._zoomCounter + (delta * this._zoomSensitivity), null, quiet);
	}

	setPanCenter(newCenter, quiet = false) {
		let newPanCenter = newCenter;
		if (this._activeAreaBounded) {
			const corner = this._baseActiveAreaDims.multiply1(0.5 * this._zoomFactorFitted);
			const clamping = corner.subtractp(this._divCenter).addp(this._activeAreaPadding).max1(0);
			newPanCenter = newPanCenter.clamp1p(clamping);
		}
		// if (!this._panCenter.equals(newPanCenter)) {
		this._panCenter = newPanCenter;
		if (!quiet) {
			this._pointerUpdated();
		}
		this.queueRedraw();
		// }
		this._viewSpaceUpdated();
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
			if (self._isActive) {
				self._pointerWithinElement = true;
			}
		});

		this._container.addEventListener("pointerleave", function (e) {
			self._pointerWithinElement = false;
		});

		this._container.addEventListener("wheel", function (e) {
			if (self._isActive) {
				self.callGlobalEvent("preMouseWheel", {
					pointerEvent: e
				});
				for (const uuid of self.getRegistryItemsSorted("pointerAware")) {
					const obj = self._allObjs[uuid];
					if (obj.ignoreWheelEvent(e)) {
						continue;
					}
					obj.onWheel(e);
					if (obj.blockWheelEvent(e)) {
						break;
					}
				}
				self.callGlobalEvent("postMouseWheel", {
					pointerEvent: e
				});
				e.preventDefault();
			}
		});

		this._container.addEventListener("pointerdown", function (e) {
			if (self._isActive) {
				self._mouseElemDownPos = self._pointerElemPos;
				self._mouseDownPos = self.divToViewportSpace(self._mouseElemDownPos);
				self._mouseDown = true;
				self.callGlobalEvent("preMouseDown", {
					pointerEvent: e
				});
				for (const uuid of self.getRegistryItemsSorted("pointerAware")) {
					const obj = self._allObjs[uuid];
					if (obj.ignoreClickEvent(e)) {
						continue;
					}
					self.registerObjFor("held", obj);
					obj.onPressed(e);
					if (obj.blockClickEvent(e)) {
						break;
					}
				}
				self.callGlobalEvent("postMouseDown", {
					pointerEvent: e
				});
				self._pointerUpdated();
				e.preventDefault();
			}
		});

		document.addEventListener("pointerup", function (e) {
			if (self._isActive) {
				self.callGlobalEvent("preMouseUp", {
					pointerEvent: e
				});
				self._mouseDown = false;
				for (const uuid of self.getRegistryItemsSorted("pointerAware")) {
					const obj = self._allObjs[uuid];

					if (obj.ignoreClickEvent(e)) {
						continue;
					}
					obj.onMouseUp(e);
					if (obj.blockClickEvent(e)) {
						break;
					}
				}

				const isDrag = self._pointerElemDragDistance >= self.nonDragThreshold;
				if (!isDrag) {
					self.callGlobalEvent("preMouseClick", {
						pointerEvent: e
					});
				}
				for (const uuid of self.getRegistryItemsSorted("held")) {
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
				self._pointerElemDragDistance = 0;

				self.unregisterAllObjsFor("held");
				self.unregisterAllObjsFor("dragged");
				self.callGlobalEvent("postMouseUp", {
					pointerEvent: e
				});
				if (!isDrag) {
					self.callGlobalEvent("postMouseClick", {
						pointerEvent: e
					});
				}
				self._pointerUpdated();
				e.preventDefault();
			}
		});

		document.addEventListener("pointermove", function (e) {
			if (self._isActive) {
				self._pointerUpdated(e);
				e.preventDefault();
			}
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