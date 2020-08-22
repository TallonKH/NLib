export class Viewport {
	constructor({
		minZoomFactor = 0.25,
		maxZoomFactor = 2,
		pannable = true,
		zoomSensitivity = 1,
		panSensitivity = 0.5,
		zoomCenter = "mouse", //center, mouse, panCenter
		backgroundClass = VPBackground
	} = {}) {
		this.redrawQueued
		this.background = new backgroundClass(this);

		this.targetTickrate = 30;

		this.zoomCenter = zoomCenter;
		this.minZoomFactor = minZoomFactor;
		this.maxZoomFactor = maxZoomFactor;
		this.minZoomCounter = Math.log(minZoomFactor) / Math.log(1.0075);
		this.maxZoomCounter = Math.log(maxZoomFactor) / Math.log(1.0075);
		this.zoomSensitivity = zoomSensitivity;
		this.zoomFactor = 1;
		this.zoomCounter = -1.0417;

		this.pannable = pannable;
		this.inversePanning = true;
		this.panCenter = new NPoint();
		this.vpCenter = new NPoint();
		this.panSensitivity = panSensitivity;

		this.mouseDown = false;

		/** raw mouse position (relative to viewport element) */
		this.mouseElemPos = new NPoint();
		this.mouseElemDownPos = new NPoint();
		this.mouseElemDelta = new NPoint();

		/** relative to viewport objects */
		this.mousePos = new NPoint();
		/** position where mouse was last pressed down */
		this.mouseDownPos = new NPoint();
		/** movement of mouse between ticks */
		this.mouseDelta = new NPoint();
		/** cumulative distance that mouse has been dragged in the current press */
		this.mouseDragDistance = 0;
		/** farthest distance that mouse has been from its press position */
		this.mouseDragMaxDelta = 0;

		this.cursorSuggests = {
			"default": 1
		};
		this.cursorPriorities = ["none", "not-allowed", "help", "grabbing", "grab", "move", "pointer", "crosshair", "default"];

		this.canvasDims = new NPoint();
		this.nonDragThreshold = 8;

		this.allObjs = {};

		this.drawRegisterCounter = 0
		this.drawnObjIds = new Set();
		this.mouseListeningObjIds = new Set();
		this.mouseOverObjIds = new Set();
		/** objects that the mouse is pressed down on */
		this.heldObjIds = new Set();
		/** objects that the mouse is pressed down on and moved sufficiently */
		this.draggedObjIds = new Set();

		// this.drawnObjIdsSorted = []
		this.mouseListeningObjIdsSorted = []
		this.mouseOverObjIdsSorted = []
		this.heldObjIdsSorted = []
		this.draggedObjIdsSorted = []

		this.preMouseDownListeners = {}
		this.preMouseUpListeners = {}
		this.preMouseClickListeners = {}
		this.preMouseMoveListeners = {}
		this.preMouseWheelListeners = {}
		this.postMouseDownListeners = {}
		this.postMouseUpListeners = {}
		this.postMouseClickListeners = {}
		this.postMouseMoveListeners = {}
		this.postMouseWheelListeners = {}

		// is the mouse over the viewport?
		this.mouseWithin = false;
		this.ctrlDown = false;
		this.shiftDown = false;
		this.altDown = false;
		this.downKeys = new Set();
		this.makeElements();
		this.setupScrollLogic();
		this.setupMouseListeners();
		this.setupKeyListeners();
		this.registerObj(this.background);
		const self = this;
		// setTimeout(function () {
		// 	self.recenter();
		// }, 500);
	}

	recenter() {
		console.log("Asdf");
		this.panCenter = new NPoint(this.canvas.width / 2, this.canvas.height / 2);
		this.queueRedraw();
	}

	preOnMouseDown() {
		if (this.preMouseDownListeners) {
			Object.values(this.preMouseDownListeners).forEach(f => f(this));
		}
	}

	preOnMouseUp() {
		if (this.preMouseUpListeners) {
			Object.values(this.preMouseUpListeners).forEach(f => f(this));
		}
	}

	preOnMouseClick() {
		if (this.preMouseClickListeners) {
			Object.values(this.preMouseClickListeners).forEach(f => f(this));
		}
	}

	preOnMouseMove() {
		if (this.preMouseMoveListeners) {
			Object.values(this.preMouseMoveListeners).forEach(f => f(this));
		}
	}

	preOnMouseWheel(e) {
		if (this.preMouseWheelListeners) {
			Object.values(this.preMouseWheelListeners).forEach(f => f(this, e));
		}
	}

	postOnMouseDown() {
		if (this.postMouseDownListeners) {
			Object.values(this.postMouseDownListeners).forEach(f => f(this));
		}
	}

	postOnMouseUp() {
		if (this.postMouseUpListeners) {
			Object.values(this.postMouseUpListeners).forEach(f => f(this));
		}
	}

	postOnMouseClick() {
		if (this.postMouseClickListeners) {
			Object.values(this.postMouseClickListeners).forEach(f => f(this));
		}
	}

	postOnMouseMove() {
		if (this.postMouseMoveListeners) {
			Object.values(this.postMouseMoveListeners).forEach(f => f(this));
		}
	}

	postOnMouseWheel(e) {
		if (this.postMouseWheelListeners) {
			Object.values(this.postMouseWheelListeners).forEach(f => f(this, e));
		}
	}

	getDepthSorter() {
		const allObjs = this.allObjs;
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
		this.allObjs[obj.uuid] = obj;
		if (obj.drawable) {
			this.registerDrawnObj(obj);
		}
		if (obj.mouseListening) {
			this.registerMouseListeningObj(obj);
		}
		this.queueRedraw();
	}

	registerDrawnObj(obj) {
		obj.drawRegisterNum = this.drawRegisterCounter++;
		this.drawnObjIds.add(obj.uuid);
		// this.drawnObjIdsSorted = Array.from(this.drawnObjIds);
		// this.drawnObjIdsSorted.sort(this.getReversedDepthSorter());
	}

	registerMouseListeningObj(obj) {
		this.mouseListeningObjIds.add(obj.uuid);
		this.mouseListeningObjIdsSorted = Array.from(this.mouseListeningObjIds);
		this.mouseListeningObjIdsSorted.sort(this.getDepthSorter());
	}

	registerMouseOverObj(obj) {
		obj.mouseOverlapping = true;
		this.mouseOverObjIds.add(obj.uuid);
		this.mouseOverObjIdsSorted = Array.from(this.mouseOverObjIds);
		this.mouseOverObjIdsSorted.sort(this.getDepthSorter());
	}

	registerHeldObj(obj) {
		obj.held = true;
		this.heldObjIds.add(obj.uuid);
		this.heldObjIdsSorted = Array.from(this.heldObjIds);
		this.heldObjIdsSorted.sort(this.getDepthSorter());
	}

	registerDraggedObj(obj) {
		obj.dragged = true;
		this.draggedObjIds.add(obj.uuid);
		this.draggedObjIdsSorted = Array.from(this.draggedObjIds);
		this.draggedObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterDrawnObj(obj) {
		this.drawnObjIds.delete(obj.uuid);
		// removeItem(this.drawnObjIdsSorted, obj.uuid);
		// this.drawnObjIdsSorted = Array.from(this.drawnObjIds);
		// this.drawnObjIdsSorted.sort(this.getReversedDepthSorter());
	}

	unregisterMouseListeningObj(obj) {
		this.mouseListeningObjIds.delete(obj.uuid);
		// removeItem(this.mouseListeningObjIdsSorted, obj.uuid);
		this.mouseListeningObjIdsSorted = Array.from(this.mouseListeningObjIds);
		this.mouseListeningObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterMouseOverObj(obj) {
		obj.mouseOverlapping = false;
		this.mouseOverObjIds.delete(obj.uuid);
		// removeItem(this.mouseOverObjIdsSorted, obj.uuid);
		this.mouseOverObjIdsSorted = Array.from(this.mouseOverObjIds);
		this.mouseOverObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterHeldObj(obj) {
		obj.held = false;
		this.heldObjIds.delete(obj.uuid);
		// removeItem(this.heldObjIdsSorted, obj.uuid);
		this.heldObjIdsSorted = Array.from(this.heldObjIds);
		this.heldObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterDraggedObj(obj) {
		obj.dragged = false;
		this.draggedObjIds.delete(obj.uuid);
		// removeItem(this.heldObjIdsSorted, obj.uuid);
		this.draggedObjIdsSorted = Array.from(this.draggedObjIds);
		this.draggedObjIdsSorted.sort(this.getDepthSorter());
	}

	unregisterAllDrawnObjs() {
		this.drawnObjIds.clear();
		// this.drawnObjIdsSorted = [];
		this.registerDrawnObj(this.background);
	}

	unregisterAllMouseListeningObjs() {
		this.mouseListeningObjIds.clear();
		this.mouseListeningObjIdsSorted = [];
		this.registerMouseListeningObj(this.background);
	}

	unregisterAllMouseOverObjs() {
		this.mouseOverObjIds.forEach(id => this.allObjs[id].mouseOverlapping = false);
		this.mouseOverObjIds.clear();
		this.mouseOverObjIdsSorted = [];
	}

	unregisterAllHeldObjs() {
		this.heldObjIds.forEach(id => this.allObjs[id].held = false);
		this.heldObjIds.clear();
		this.heldObjIdsSorted = [];
	}

	unregisterAllDraggedObjs() {
		this.draggedObjIds.forEach(id => this.allObjs[id].dragged = false);
		this.draggedObjIds.clear();
		this.draggedObjIdsSorted = [];
	}

	forget(obj) {
		if (obj === this.background) {
			return false;
		}

		obj.onForget();
		delete this.allObjs[obj.id];
		this.unregisterDrawnObj(obj);
		this.unregisterMouseListeningObj(obj);
		this.unregisterMouseOverObj(obj);
		this.unregisterHeldObj(obj);
		this.unregisterDraggedObj(obj);
		this.queueRedraw();
		// update mouse logic in case an object is removed that was preventing a lower object from being touched
		this.mousePosUpdated();
	}

	forgetAll() {
		for (const obj of Object.values(this.allObjs)) {
			this.forget(obj);
		}
	}

	// tickMultiplier = integer equiv of deltaTime
	// overflow = accidental ms delay since last tick
	onTick(deltaT, tickMultiplier, overflow) {
		// console.log(ticks + " : " + deltaTime + " : " + overflow);
	}

	setupLoop() {
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
		if (!this.redrawQueued) {
			this.redrawQueued = true;
			setTimeout(_ => this.redraw.call(this), 0);
		}
	}

	redraw() {
		this.redrawQueued = false;
		const drawnObjIdsSorted = Array.from(this.drawnObjIds);
		drawnObjIdsSorted.sort(this.getReversedDepthSorter());
		this.ctx.setTransform(this.zoomFactor, 0, 0, this.zoomFactor, this.panCenter.x + this.vpCenter.x, this.panCenter.y + this.vpCenter.y);
		for (const uuid of drawnObjIdsSorted) {
			const obj = this.allObjs[uuid];
			obj.draw(this.ctx);
		}
		this.onRedraw();
	}

	onRedraw() {}

	// drawRect(x, y, w, h) {
	// 	const pos = this.canvasToViewSpace(new NPoint(x, y));
	// 	this.ctx.fillRect(pos.x, pos.y, w * this.zoomFactor, h * this.zoomFactor);
	// }

	makeElements() {
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
		return npoint.subtractp(this.panCenter.addp(this.vpCenter)).divide1(this.zoomFactor).multiply2(1, 1); //.subtract2(this.canvas.width / 2, this.canvas.height / 2);
		// return npoint.subtractp(this.panCenter).divide1(this.zoomFactor).subtract2(this.canvas.width / 2, this.canvas.height / 2).multiply2(1, -1);
	}

	canvasToViewSpace(npoint) {
		return npoint.multiply2(1, 1).add2(this.canvas.width / 2, this.canvas.height / 2).multiply1(this.zoomFactor).addp(this.panCenter.addp(this.vpCenter));
	}

	setupScrollLogic() {
		const self = this;
		new ResizeSensor(this.container, function (e) {
			self.canvas.width = e.width;
			self.canvas.height = e.height;
			self.canvasDims = new NPoint(self.canvas.width, self.canvas.height);
			self.vpCenter = self.canvasDims.divide1(2);
			self.queueRedraw();
		});
	}

	mousePosUpdated() {
		const newMousePos = this.pageToViewSpace(this.mouseElemPos);
		this.mouseDelta = newMousePos.subtractp(this.mousePos);
		this.preOnMouseMove();
		if (this.mouseDown) {
			this.mouseDragMaxDelta = Math.max(this.mouseDragMaxDelta, this.mouseDownPos.subtractp(newMousePos).length());
			this.mouseDragDistance += this.mouseDelta.length();
			if (this.mouseDragDistance >= this.nonDragThreshold) {
				for (const uuid of this.heldObjIdsSorted) {
					const obj = this.allObjs[uuid];
					if (!this.draggedObjIds.has(uuid)) {
						this.registerDraggedObj(obj);
						obj.onDragStarted();
					}
					obj.onDragged();
				}
			}
		}
		this.mousePos = newMousePos;

		const currentMousedOverObjIds = new Set();
		for (const uuid of this.mouseListeningObjIdsSorted) {
			const obj = this.allObjs[uuid];
			if (obj.mouseListening) {
				if (obj.isOverlapping(this.mousePos)) {
					currentMousedOverObjIds.add(uuid);
					if (obj.isMouseBlockingOverlap()) {
						break;
					}
				}
			}
		}

		const prevMousedOverObjIds = new Set(this.mouseOverObjIds);
		// existing & new moused over objs
		if (this.mouseWithin) {
			for (const uuid of currentMousedOverObjIds) {
				if (!prevMousedOverObjIds.has(uuid)) {
					const obj = this.allObjs[uuid];
					this.registerMouseOverObj(obj);
					obj.onMouseEntered();
				}
			}
		}

		// no longer moused over objs
		for (const uuid of prevMousedOverObjIds) {
			if (!currentMousedOverObjIds.has(uuid)) {
				const obj = this.allObjs[uuid];
				this.unregisterMouseOverObj(obj);
				obj.onMouseExited();
			}
		}

		this.queueRedraw();
		this.postOnMouseMove();
	}

	keyPressed(code) {}

	keyReleased(code) {}

	setupKeyListeners() {
		const self = this;
		document.addEventListener("keydown", function (e) {
			const keyCode = e.key;
			switch (keyCode) {
				case 16:
					self.shiftDown = true;
					break;
				case 17:
					self.ctrlDown = true;
					break;
				case 18:
					self.altDown = true;
					break;
				default:
					if (self.mouseWithin) {
						self.downKeys.add(keyCode);
						self.keyPressed(keyCode);
					}
			}
		});

		// global key up
		document.addEventListener("keyup", function (e) {
			const keyCode = e.key;
			switch (keyCode) {
				case 16:
					self.shiftDown = false;
					break;
				case 17:
					self.ctrlDown = false;
					break;
				case 18:
					self.altDown = false;
					break;
				default:
					if (self.downKeys.delete(keyCode)) {
						self.keyReleased(keyCode);
					}
			}

		});
		//TODO add recenter button (space?)

	}

	setupMouseListeners() {
		const self = this;
		this.container.addEventListener("pointerenter", function (e) {
			self.mouseWithin = true;
		});

		this.container.addEventListener("pointerleave", function (e) {
			self.mouseWithin = false;
		});

		this.container.addEventListener("wheel", function (e) {
			self.preOnMouseWheel(e);

			if (e.ctrlKey) {
				if (self.minZoomFactor < self.maxZoomFactor) {
					const prevZoom = self.zoomFactor;
					self.zoomCounter += e.deltaY;
					self.zoomCounter = Math.min(self.maxZoomCounter, Math.max(self.minZoomCounter, self.zoomCounter));
					self.zoomFactor = Math.pow(1.0075, -self.zoomCounter);
					const zoomDelta = self.zoomFactor - prevZoom;
					switch (self.zoomCenter) {
						case "center":
							self.panCenter = new NPoint(0,0);//self.panCenter.subtractp(self.vpCenter.subtractp(self.panCenter).divide1(prevZoom).multiply1(self.zoomFactor - prevZoom));
							break;
						case "mouse":
							self.panCenter = self.panCenter.subtractp(self.mouseElemPos.subtractp(self.panCenter.addp(self.vpCenter)).divide1(prevZoom).multiply1(self.zoomFactor - prevZoom));
							break;
					}
					self.queueRedraw();
					e.preventDefault();
				}
			} else {
				if (self.pannable) {
					let centerDelta = new NPoint(e.deltaX, e.deltaY).multiply1(self.panSensitivity);
					if(self.inversePanning){
						self.panCenter = self.panCenter.subtractp(centerDelta);
					}else{
						self.panCenter = self.panCenter.addp(centerDelta);
					}
					self.mousePosUpdated();
					self.queueRedraw();
					e.preventDefault();
				}
			}
			self.postOnMouseWheel(e);
		});

		this.container.addEventListener("pointerdown", function (e) {
			self.queueRedraw();
			self.mouseElemDownPos = self.mouseElemPos;
			self.mouseDownPos = self.pageToViewSpace(self.mouseElemPos);
			self.mouseDown = true;
			self.preOnMouseDown();
			for (const uuid of self.mouseOverObjIdsSorted) {
				const obj = self.allObjs[uuid];
				self.registerHeldObj(obj);
				obj.onPressed(self);
				if (obj.isMouseBlockingPress(self)) {
					break;
				}
			}
			self.postOnMouseDown();
		});

		document.addEventListener("pointerup", function (e) {
			self.queueRedraw();
			self.preOnMouseUp();
			self.mouseDown = false;
			for (const uuid of self.mouseOverObjIdsSorted) {
				const obj = self.allObjs[uuid];
				obj.onMouseUp();
				if (obj.isMouseBlockingPress()) {
					break;
				}
			}

			for (const uuid of self.heldObjIdsSorted) {
				const obj = self.allObjs[uuid];
				obj.onUnpressed();
				if (self.mouseDragDistance >= self.nonDragThreshold) {
					obj.onDragEnded();
				} else {
					obj.onClicked();
				}
			}
			self.mouseDragDistance = 0;
			self.mouseDragMaxDelta = 0;
			self.unregisterAllHeldObjs();
			self.unregisterAllDraggedObjs();
			self.postOnMouseUp();
		});

		// this.container.style.touchAction = "none";
		document.addEventListener("pointermove", function (e) {
			const newMouseElemPos = new NPoint(
				e.pageX - self.container.offsetLeft,
				e.pageY - self.container.offsetTop
			);

			self.mouseElemDelta = newMouseElemPos.subtractp(self.mouseElemPos);
			self.mouseElemPos = newMouseElemPos;
			self.mousePosUpdated();
		});
	}

	suggestCursor(type, count = 1) {
		this.cursorSuggests[type] = (this.cursorSuggests[type] || 0) + count
		this.refreshCursorType();
	}

	unsuggestCursor(type, count = 1) {
		this.cursorSuggests[type] = Math.max(0, (this.cursorSuggests[type] || 0) - count);
		this.refreshCursorType();
	}

	refreshCursorType() {
		for (const type of this.cursorPriorities) {
			if (this.cursorSuggests[type]) {
				this.canvas.style.cursor = type;
				break;
			}
		}
	}
}