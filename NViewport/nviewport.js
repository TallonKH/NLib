import VPBackground from "./vp-background.js";
import NPoint from "../npoint.js";
import {
  clamp
} from "../nmath.js";
import {
  insertSorted,
  removeSorted,
  findSorted,
} from "../nmisc.js";

class NLayer {
  constructor(vp, name, {
    height = 0,
    needsClearing = true,
    fixed = false, // does not update on pan/zoom
    contextArgs = {}, // ie: {alpha: false}
    logRedraws = false,
  } = {}) {
    this._vp = vp;
    this._name = name;

    this._height = height;
    this._fixed = fixed;
    this._contextArgs = contextArgs;
    this._needsClearing = needsClearing;

    this._drawables = new Set();
    this._drawablesSorted = [];
    this._canvas;
    this._ctx;

    this._pendingRedraw = false;
    this._pendingRedrawCauses = [];
    this._logRedraws = logRedraws;
  }

  setupElement() {
    this._canvas = document.createElement("canvas");
    this._canvas.style.background = "transparent";
    this._canvas.style.width = "100%";
    this._canvas.style.height = "100%";
    this._canvas.style.lineHeight = 0;
    this._canvas.style.margin = 0;
    this._canvas.style.padding = 0;
    this._canvas.style.position = "absolute";
    this._ctx = this._canvas.getContext("2d", this._contextArgs);
    delete this._contextArgs; // not needed anymore
  }

  registerObj(obj) {
    if (obj._layer !== null) {
      throw `Object ${obj} already has a layer!`;
    }
    obj._layer = this;
    this._drawables.add(obj._uuid);
    insertSorted(this._drawablesSorted, obj._uuid, this._vp.reveseDepthSorter);

    this._vp._registerObj(obj);
  }

  unregisterObj(obj) {
    this._vp.forget(obj);
  }

  _unregisterObjLogic() {
    obj._layer = null;
    this._drawables.delete(obj._uuid);
    removeSorted(this._drawablesSorted, obj._uuid, this._vp.reveseDepthSorter);
  }

  queueRedraw(cause) {
    this._vp.queueLayerRedraw(this, cause);
  }

  _redraw() {
    if (this._logRedraws) {
      console.log(this._name + " redraw [" + this._pendingRedrawCauses + "]");
    }

    this._pendingRedrawCauses = [];
    this._pendingRedraw = false;
    this._ctx.resetTransform();
    if (this._needsClearing) {
      this._ctx.clearRect(0, 0, this._vp._canvasDims.x, this._vp._canvasDims.y);
    }

    const scale = this._vp._computedScale;
    const xOffset = this._vp._computedOffset.x;
    const yOffset = this._vp._computedOffset.y;

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

    for (const uuid of this._drawablesSorted) {
      this._vp._allObjs[uuid].draw(this._ctx);
    }

    if (this._vp._activeAreaBounded) {
      this._ctx.restore();
    }

    this.onRedraw();
  }

  onRedraw() {
    this._vp.onLayerRedraw(this);
  }
}

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
    outOfBoundsStyle = "#211",
    minimizeThresholdX = 100,
    minimizeThresholdY = 100,
    updateMethod = "animframe", //animframe, timeout, idle
    lazyTransformDelay = 100, // ms delay between panning and redraw; 0 for instant panning
  } = {}) {
    this._container;
    this._outOfBoundsStyle = outOfBoundsStyle;
    this._updateMethod = updateMethod;
    this._boundingRect;

    this._layers = new Map();
    this._layersSorted = [];
    this._layersPendingRedraw = new Set();


    this._isActive = false;
    this._enabled = true;
    this._setupDone = false;
    this._visible = false;
    this.forceVisible = false;
    this._isMinimized = false;
    this._resizeHandled = false;
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
    this._lazyTransformDelay = lazyTransformDelay;
    this._pendingTransformUpdate = false;
    // the offset of the origin to the viewport center. In screen space.
    this._physicalPanCenter = NPoint.ZERO; // displacement of the canvas div
    this._lastContextPanCenter = NPoint.ZERO;
    this._panCenter = NPoint.ZERO;
    // this._lastContextZoom = 1;
    this.panSensitivity = panSensitivity;

    this._mouseDownConsumed = false;
    this._mouseDownBlocked = false;

    this._pointerDragging = false;
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
    this._mouseDownElemPos = NPoint.ZERO;
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

    this.layerSorter = function (a, b) {
      return this._layers.get(a)._height - this._layers.get(b).height;
    }.bind(this);

    // this._redraw = this.__redrawUnbound.bind(this);
    this._update = this.__updateUnbound.bind(this);
    this._pendingUpdate = false;
    this._pendingRedraw = false;
    this._pendingResizeUpdate = null;
  }

  newLayer(name, args) {
    if (this._layers.has(name)) {
      throw `Layer "${name}" already exists!`;
    }
    const layer = new NLayer(this, name, args);
    layer.setupElement();
    return layer;
  }

  addLayer(layer) {
    this._layers.set(layer._name, layer);
    const i = insertSorted(this._layersSorted, layer._name, this.layerSorted);
    if (i < this._layersSorted.length - 1) {
      this._container.insertBefore(layer._canvas, this._layers.get(this._layersSorted[i])._canvas);
    } else {
      this._container.appendChild(layer._canvas);
    }
    return layer;
  }

  removeLayer(layer) {
    this._layers.delete(layer._name);
    insertSorted(this._layersSorted, layer._name, this.layerSorter);
    layer._canvas.remove();
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

      this._resizeObserver = new ResizeObserver(function (e) {
        this.queueResizeUpdate(e);
      }.bind(this));
      this._resizeObserver.observe(this._container);

      this._setupMouseListeners();
      this._setupKeyListeners();
      this._setupLayers();
      window.setTimeout(function () {
        const pc = this._panCenter;
        this._setupDone = true;
        this._setupVisibilityListener();
        this.onSetup();
        this.updateActiveState();
        // window.setTimeout(function () {
        //   this.queueTotalRedraw("post-setup");
        // }.bind(this), 0);
      }.bind(this), 0);
    }
    return this;
  }

  _setupLayers() {
    const bgLayer = this.addLayer(this.newLayer("background", {
      height: -1,
    }));
    const mainLayer = this.addLayer(this.newLayer("main", {
      height: 0,
    }));

    this._activeBackground = new this._activeBackgroundClass(this);
    bgLayer.registerObj(this._activeBackground);
  }

  _setupObjRegistries() {
    this.addObjRegistry("drawable", this.reverseDepthSorter, function (obj) {
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

  _setupGlobalEventChannels() {
    this._addGlobalEventChannel("preMouseDown");
    this._addGlobalEventChannel("postMouseDown");
    this._addGlobalEventChannel("preMouseUp");
    this._addGlobalEventChannel("postMouseUp");
    this._addGlobalEventChannel("preMouseClick");
    this._addGlobalEventChannel("postMouseClick");
    this._addGlobalEventChannel("prePointerDragStart");
    this._addGlobalEventChannel("postPointerDragStart");
    this._addGlobalEventChannel("prePointerDrag");
    this._addGlobalEventChannel("postPointerDrag");
    this._addGlobalEventChannel("prePointerDragEnd");
    this._addGlobalEventChannel("postPointerDragEnd");
    this._addGlobalEventChannel("prePointerMove");
    this._addGlobalEventChannel("postPointerMove");
    this._addGlobalEventChannel("preMouseWheel");
    this._addGlobalEventChannel("postMouseWheel");
    this._addGlobalEventChannel("preTick");
    this._addGlobalEventChannel("postTick");
    this._addGlobalEventChannel("resize");
    this._addGlobalEventChannel("keyPress");
    this._addGlobalEventChannel("keyRelease");
  }

  _setupVisibilityListener() {
    const observer = new IntersectionObserver(function (entries, observer) {
      if (entries[0].isIntersecting) {
        this._visible = true;
        this.updateActiveState();
        this.onVisible();
      } else {
        this._visible = false;
        this.updateActiveState();
        this.onHidden();
      }
    }.bind(this), {
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
    const newState = this._setupDone && this._enabled && (this._visible || this.forceVisible) && (!this._isMinimized) && this._resizeHandled;
    if (newState ^ this._isActive) {
      this._isActive = newState;
      if (newState) {
        this.queueTotalRedraw(`activeState: ${newState}`);
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

  getLayer(name) {
    return this._layers.get(name);
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
    dat._listeners.set(dat._listenerIdCounter, callback);
    return dat._listenerIdCounter;
  }

  unregisterGlobalEventListener(eventName, listenerId) {
    this._globalEventChannels.get(eventName).delete(listenerId);
  }

  callGlobalEvent(eventName, data) {
    for (const [key, func] of this._globalEventChannels.get(eventName)._listeners) {
      func(this, data);
    }
  }

  _registerObj(obj) {
    this._allObjs[obj._uuid] = obj;
    if (obj._mouseListening) {
      this.registerObjFor("mouseListening", obj);
    }
    if (obj._tickable) {
      this.registerObjFor("tickable", obj);
    }
    if (obj._drawable) {
      this.registerObjFor("drawable", obj);
    }

    this.onRegisterObj(obj);
  }

  onRegisterObj(obj) {}

  registryForHas(registryName, obj) {
    return this._objRegistries.get(registryName)._idSet.has(obj._uuid);
  }

  /** Returns sorted index. If not sorted, returns nothing */
  registerObjFor(registryName, obj) {
    // set appropriate object field to sorted index (or true if unsorted)
    obj._registeredStates.set(registryName, true);

    // add to registry
    const dat = this._objRegistries.get(registryName);
    dat._idSet.add(obj._uuid);
    dat._onRegister(obj);

    if (dat._sorted !== undefined) {
      return insertSorted(dat._sorted, obj._uuid, dat._sorter);
    }
  }

  /** Returns sorted index. If not sorted, returns nothing */
  unregisterObjFor(registryName, obj) {
    // set appropriate object field
    obj._registeredStates.set(registryName, false);

    // remove from registry
    const dat = this._objRegistries.get(registryName);
    dat._idSet.delete(obj._uuid);
    if (dat._sorted !== undefined) {
      dat._sorted.splice(dat._sorted.indexOf(obj._uuid), 1);
      // TODO figure out why removeSorted breaks
      return removeSorted(dat._sorted, obj._uuid, dat._sorter);
    }
  }

  findRegisteredObjSorted(registryName, obj) {
    const dat = this._objRegistries.get(registryName);
    return findSorted(dat._sorted, obj._uuid, dat._sorter);
  }

  // changeObjOrdering(registryName, obj, func) {
  //   const dat = this._objRegistries.get(registryName);
  //   removeSorted(dat._sorted, obj._uuid, dat._sorter);
  //   func(obj);
  //   insertSorted(dat._sorted, obj._uuid, dat._sorter);
  // }

  unregisterAllObjsFor(registryName) {
    const dat = this._objRegistries.get(registryName);
    dat._idSet.forEach(id => this._allObjs[id]._registeredStates.set(registryName, false));
    dat._idSet.clear();
    if (dat._sorted !== undefined) {
      dat._sorted.length = 0;
    }
  }

  addObjRegistry(registryName, sorter = null, onRegister = Function.prototype) {
    const dat = {
      _idSet: new Set(),
    };
    if (sorter !== null) {
      dat._sorter = sorter;
      dat._sorted = [];
    }

    dat._onRegister = onRegister;

    this._objRegistries.set(registryName, dat);
  }

  getRegistryItems(registryName) {
    return this._objRegistries.get(registryName)._idSet;
  }

  getRegistryItemsSorted(registryName) {
    return this._objRegistries.get(registryName)._sorted;
  }

  getRegistrySize(registryName) {
    return this._objRegistries.get(registryName)._idSet.size;
  }

  forget(obj) {
    obj._layer._unregisterObjLogic(obj);

    obj.onForget();

    // deal with drawable separately
    const wasDrawable = obj._registeredStates.get("drawable");

    // unregister from every registry
    for (const [registryName, state] of obj._registeredStates) {
      if (state) {
        this.unregisterObjFor(registryName, obj);
      }
    }
    delete this._allObjs[obj._uuid];

    if (wasDrawable === true) {
      this.queueRedraw(`${obj} forgotten`);
    }
    // update mouse logic in case an object is removed that was preventing a lower object from being touched
    if (this._isActive) {
      this._pointerUpdated();
    }
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
    let lastTime = Date.now();

    loopIteration = function () {
      const currentTime = Date.now();
      this._onTick((currentTime - lastTime) * 0.001);
      lastTime = currentTime;
      this.request
      window.requestAnimationFrame(loopIteration, null, null);
    }.bind(this);
    loopIteration();
  }

  _setupComplexLoop() {
    let currentTime = Date.now();
    let lastTime = currentTime;
    let deltaTime = 0;
    let overflowTime = 0;

    function requestNext() {
      window.requestAnimationFrame(loopIteration);
    };

    loopIteration = function () {
      const targetDelay = 1000 / this._targetTickrate;
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
        // this._onTick(deltaTime * extraTicks / 1000, extraTicks, overflowTime);
        this._onTick(deltaTime / 1000, extraTicks, overflowTime);
        requestNext();
        deltaTime = 0;
      } else {
        setTimeout(requestNext, targetDelay - deltaTime);
      }
      lastTime = currentTime;
    }.bind(this);

    loopIteration();
  }

  queueUpdate() {
    if (!this._pendingUpdate) {
      this._pendingUpdate = true;
      switch (this._updateMethod) {
        case "animframe":
          window.requestAnimationFrame(this._update);
          break;
        case "timeout":
          window.setTimeout(this._update, 0);
          break;
        case "idle":
          window.requestIdleCallback(this._update);
          break;
      }
    }
  }

  queueResizeUpdate(event) {
    this._pendingResizeUpdate = event;
    if (this._responsiveResize) {
      this.__updateUnbound();
    } else {
      this.queueUpdate();
    }
  }

  queueLayerRedraw(layer, cause) {
    layer._pendingRedrawCauses.push(cause);
    if (!layer._pendingRedraw) {
      layer._pendingRedraw = true;
      this._layersPendingRedraw.add(layer._name);
      this.queueUpdate();
    }
  }

  queueTotalRedraw(cause) {
    for (const [_, layer] of this._layers) {
      layer.queueRedraw(`total (${cause})`);
    }
  }

  queueNavigationalRedraw(cause) {
    this._pendingTransformUpdate = true;
    for (const [_, layer] of this._layers) {
      if (!layer._fixed) {
        layer.queueRedraw(`nav (${cause})`);
      }
    }
  }

  __updateUnbound() {
    if (this._pendingResizeUpdate) {
      const evnt = this._pendingResizeUpdate;
      this._handleResize(evnt);
      this._pendingResizeUpdate = null;
      
      this.queueNavigationalRedraw("resize");
    }
    this._redrawLayers();
    this._pendingUpdate = false;
  }

  _handleResize(e) {
    this._boundingRect = this._container.getBoundingClientRect();
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
    for (const [_, layer] of this._layers) {
      layer._canvas.width = this._canvasDims.x;
      layer._canvas.height = this._canvasDims.y;
    }

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
    this.updateFittedZoomFactor();
    this._viewSpaceUpdated();
    this.callGlobalEvent("resize", {
      resizeEvent: e
    });
    this._resizeHandled = true;
    this.updateActiveState();
  }

  _viewSpaceUpdated() {
    this._visibleAreaMinCorner = this.divToViewportSpace(NPoint.ZERO);
    this._visibleAreaMaxCorner = this.divToViewportSpace(this._divDims);
  }

  _redrawLayers() {
    if (this._pendingTransformUpdate && this._lazyTransformDelay > 0) {
      this.resetPhysicalTransform();
    }

    this._computedScale = this._zoomFactorFitted * this._pixelRatio;
    this._computedOffset = this._canvasCenter.addp(this._panCenter.multiply1(this._pixelRatio));
    if (this._layersPendingRedraw.size > 0) {
      const pending = Array.from(this._layersPendingRedraw);
      this._layersPendingRedraw.clear();
      for (const layerName of pending) {
        this._layers.get(layerName)._redraw();
      }
    }
    this.onRedraw();
  }

  onLayerRedraw(layer) {}

  onRedraw() {}

  _setupElements() {
    this._container = document.createElement("div");
    this._container.classList.add("vpContainer");
    this._container.style.height = "100%";
    this._container.style.lineHeight = 0;
    this._container.style.margin = 0;
    this._container.style.padding = 0;
    this._container.style.background = this._outOfBoundsStyle;
    this._container.style.width = "100%";
    this._container.style.height = "100%";
  }

  divToViewportSpace(npoint) {
    return npoint.subtractp(this._divCenter.addp(this._panCenter)).divide1(this._zoomFactorFitted);
  }

  viewportToDivSpace(npoint) {
    return npoint.multiply1(this._zoomFactorFitted).addp(this._divCenter.addp(this._panCenter));
  }

  _pointerUpdated(e) {
    if (!this._isActive) {
      return false;
    }
    let newPointerElemPos = this._pointerElemPos;
    if (e) {
      newPointerElemPos = new NPoint(
        e.pageX - this._boundingRect.left,
        e.pageY - this._boundingRect.top
      );
    }
    this._pointerElemDelta = newPointerElemPos.subtractp(this._pointerElemPos);
    this._pointerElemPos = newPointerElemPos;
    const newPointerPos = this.divToViewportSpace(this._pointerElemPos);
    const pointerChanged = !newPointerPos.equals(this._pointerPos);
    this._pointerDragDelta = newPointerPos.subtractp(this._mouseDownPos);
    this._pointerElemDragDelta = newPointerElemPos.subtractp(this._mouseDownElemPos);
    this._pointerDelta = newPointerPos.subtractp(this._pointerPos);
    this._pointerPos = newPointerPos;
    this._pointerWithinBounds = this._pointerWithinElement && this.isInBounds(this._pointerPos);

    if (pointerChanged) {
      this.callGlobalEvent("prePointerMove", {
        pointerEvent: e,
        position: this._pointerPos,
      });

      // dragging
      if (this._mouseDown) {
        this._pointerDragMaxDelta = Math.max(this._pointerDragMaxDelta, this._mouseDownPos.subtractp(newPointerPos).length());
        this._pointerDragDistance += this._pointerDelta.length();
        this._pointerElemDragDistance += this._pointerElemDelta.length();

        if (this._pointerDragging || this._pointerElemDragDistance >= this.nonDragThreshold) {
          if (!this._pointerDragging) {
            this.callGlobalEvent("prePointerDragStart", {
              pointerEvent: e,
              startPosition: this._mouseDownPos,
              position: this._pointerPos,
            });
          }
          this.callGlobalEvent("prePointerDrag", {
            pointerEvent: e,
            startPosition: this._mouseDownPos,
            position: this._pointerPos,
          });
          for (const uuid of this.getRegistryItemsSorted("held")) {
            const obj = this._allObjs[uuid];
            if (!this.registryForHas("dragged", obj)) {
              this.registerObjFor("dragged", obj);
              obj.onDragStarted(e);
            }
            obj.onDragged(e);
          }
          if (!this._pointerDragging) {
            this._pointerDragging = true;
            this.callGlobalEvent("postPointerDragStart", {
              pointerEvent: e,
              startPosition: this._mouseDownPos,
              position: this._pointerPos,
              downConsumed: !!this._mouseDownConsumers.length,
              downBlocked: !!this._mouseDownBlockers.length,
              downConsumers: this._mouseDownConsumers,
              downBlockers: this._mouseDownBlockers,
            });
          }
          this.callGlobalEvent("postPointerDrag", {
            pointerEvent: e,
            startPosition: this._mouseDownPos,
            position: this._pointerPos,
            downConsumed: !!this._mouseDownConsumers.length,
            downBlocked: !!this._mouseDownBlockers.length,
            downConsumers: this._mouseDownConsumers,
            downBlockers: this._mouseDownBlockers,
          });
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

    if (pointerChanged) {
      this.callGlobalEvent("postPointerMove", {
        pointerEvent: e,
        position: this._pointerPos,
      });
    }
  }

  keyPressed(key, event) {
    this.callGlobalEvent("keyPress", {
      key: key,
      keyEvent: event,
    });
  }

  keyReleased(key, event) {
    this.callGlobalEvent("keyRelease", {
      key: key,
      keyEvent: event,
    });
  }

  _setupKeyListeners() {
    document.addEventListener("keydown", function (e) {
      const key = e.key;
      switch (key) {
        case "Shift":
          this._shiftDown = true;
          this._downKeys.add(key);
          this.keyPressed(key, e);
          break;
        case "Control":
          this._ctrlDown = true;
          this._downKeys.add(key);
          this.keyPressed(key, e);
          break;
        case "Alt":
          this._altDown = true;
          this._downKeys.add(key);
          this.keyPressed(key, e);
          break;
        default:
          if (this._pointerWithinElement) {
            this._downKeys.add(key);
            this.keyPressed(key, e);
          }
      }
    }.bind(this));

    // global key up
    document.addEventListener("keyup", function (e) {
      const key = e.key;
      switch (key) {
        case "Shift":
          this._shiftDown = false;
          if (this._downKeys.delete(key)) {
            this.keyReleased(key, e);
          }
          break;
        case "Control":
          this._ctrlDown = false;
          if (this._downKeys.delete(key)) {
            this.keyReleased(key, e);
          }
          break;
        case "Alt":
          this._altDown = false;
          if (this._downKeys.delete(key)) {
            this.keyReleased(key, e);
          }
          break;
        default:
          if (this._downKeys.delete(key)) {
            this.keyReleased(key, e);
          }
      }

    }.bind(this));
  }

  getActiveZoomCenter() {
    switch (this._zoomCenterMode) {
      case "origin":
        return this.viewportToDivSpace(NPoint.ZERO);
        break;
      case "pointer":
        return this._pointerElemPos;
        break;
      case "view":
        return this._divCenter;
        break;
      default:
        throw `"${this._zoomCenterMode}" is not a valid zoom center mode!`;
    }
  }

  _zoomUpdatePanCenter(prevZoomFactor, zoomCenter = null, zoomCenterMode = null, quiet = false) {
    if (this._minZoomFactor > this._maxZoomFactor) {
      throw `Invalid zoom minimum and maximum! [${this._minZoomFactor}, ${this._maxZoomFactor}]`;
    }

    if (this._minZoomFactor == this._maxZoomFactor) {
      return;
    }

    if (zoomCenter === null) {
      zoomCenter = zoomCenterMode || this.getActiveZoomCenter();
    }
    this.queueNavigationalRedraw("zoom");
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
    newZoomFactor = clamp(newZoomFactor, this._minZoomFactor, this._maxZoomFactor);
    if (this._zoomFactor === newZoomFactor) {
      return false;
    }

    const prevZoomFactor = this._zoomFactor;
    this._zoomFactor = newZoomFactor;
    this._zoomCounter = this.zoomFactorToCounter(this._zoomFactor);
    this.updateFittedZoomFactor();
    this._zoomUpdatePanCenter(prevZoomFactor, zoomCenter, null, quiet);
  }

  setZoomCounter(newZoomCounter, zoomCenter = null, quiet = false) {
    newZoomCounter = clamp(newZoomCounter, this._minZoomCounter, this._maxZoomCounter);
    if (this._zoomCounter === newZoomCounter) {
      return false;
    }

    this._zoomCounter = newZoomCounter;
    const prevZoomFactor = this._zoomFactor;
    this._zoomFactor = this.zoomCounterToFactor(this._zoomCounter);
    this.updateFittedZoomFactor();
    this._zoomUpdatePanCenter(prevZoomFactor, zoomCenter, null, quiet);
  }

  updateFittedZoomFactor() {
    this._zoomFactorFitted = this._fittingScaleFactor * this._zoomFactor;
  }

  isInBounds(point, padding = NPoint.ZERO) {
    return ((!this._activeAreaBounded) || point.withinRect(this._activeAreaCorners[0].addp(padding)));
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
    if (newPanCenter.equals(this._panCenter)) {
      return false;
    }

    if (this._isActive) {
      this._panCenter = newPanCenter;
      if (this._lazyTransformDelay > 0) {
        this._physicalPanCenter = this._panCenter.subtractp(this._lastContextPanCenter);
        // this._physicalZoom = this._zoomFactorFitted / this._lastContextZoom;
        this.physicalTransformUpdate();
        if (!this._pendingTransformUpdate) {
          this._pendingTransformUpdate = true;
          window.setTimeout(this.queueNavigationalRedraw.bind(this, "panCenter (lazy)"), this._lazyTransformDelay);
        }
      } else {
        this.queueNavigationalRedraw("panCenter (instant)");
      }
      if (!quiet) {
        this._pointerUpdated();
      }

    }
    this._viewSpaceUpdated();
  }

  physicalTransformUpdate() {
    for (const [_, layer] of this._layers) {
      layer._canvas.style.left = this._physicalPanCenter.x + "px";
      layer._canvas.style.top = this._physicalPanCenter.y + "px";
    }
    // const origin = this.getActiveZoomCenter().dividep(this._divDims).multiply1(100);
    // this._canvas.style.transform = `scale(${this._physicalZoom})`;
    // this._canvas.style.transform = `matrix(${this._physicalZoom}, 0, 0, ${this._physicalZoom}, ${-this._physicalPanCenter.x}, ${-this._physicalPanCenter.y})`;
    // this._canvas.style.transformOrigin = `${origin.x}% ${origin.x}% 0px`;
  }

  resetPhysicalTransform() {
    this._lastContextPanCenter = this._panCenter;
    // this._lastContextZoom = this._zoomFactorFitted;
    this._physicalPanCenter = NPoint.ZERO;
    // this._physicalZoom = 1;
    this._pendingTransformUpdate = false;
    this.physicalTransformUpdate();
  }

  scrollPanCenter(deltaX, deltaY, quiet = false) {
    let centerDelta = new NPoint(deltaX, deltaY).multiply1(this.panSensitivity);
    if (this.inversePanning) {
      centerDelta = centerDelta.negate();
    }
    this.setPanCenter(this._panCenter.addp(centerDelta), quiet);
  }

  _setupMouseListeners() {
    this._container.addEventListener("pointerenter", function (e) {
      if (this._isActive) {
        this._pointerWithinElement = true;
      }
    }.bind(this));

    this._container.addEventListener("pointerleave", function (e) {
      this._pointerWithinElement = false;
    }.bind(this));

    this._container.addEventListener("wheel", function (e) {
      if (this._isActive && this._pointerWithinBounds) {
        let consumers = [];
        let blockers = [];
        this.callGlobalEvent("preMouseWheel", {
          pointerEvent: e
        });
        for (const uuid of this.getRegistryItemsSorted("pointerAware")) {
          const obj = this._allObjs[uuid];
          if (obj.ignoreWheelEvent(e)) {
            continue;
          }
          consumers.push(obj);
          obj.onWheel(e);
          if (obj._skipToGlobal) {
            break;
          }
          if (obj.blockWheelEvent(e)) {
            blockers.push(obj);
            break;
          }
        }
        this.callGlobalEvent("postMouseWheel", {
          consumed: !!consumers.length,
          blocked: !!blockers.length,
          consumers: consumers,
          blockers: blockers,
          pointerEvent: e,
        });
        e.preventDefault();
      }
    }.bind(this));

    this._container.addEventListener("pointerdown", function (e) {
      this._mouseDownConsumers = [];
      this._mouseDownBlockers = [];
      if (this._isActive && this._pointerWithinBounds) {
        this._mouseDownElemPos = this._pointerElemPos;
        this._mouseDownPos = this.divToViewportSpace(this._mouseDownElemPos);
        this._mouseDown = true;
        this.callGlobalEvent("preMouseDown", {
          pointerEvent: e,
          position: this._pointerPos,
        });
        for (const uuid of this.getRegistryItemsSorted("pointerAware")) {
          const obj = this._allObjs[uuid];
          if (obj.ignoreClickEvent(e)) {
            continue;
          }
          this._mouseDownConsumers.push(obj);
          this.registerObjFor("held", obj);
          obj.onPressed(e);
          if (obj._skipToGlobal) {
            break;
          }
          if (obj.blockClickEvent(e)) {
            this._mouseDownBlockers.push(obj);
            break;
          }
        }
        this.callGlobalEvent("postMouseDown", {
          consumed: !!this._mouseDownConsumers.length,
          blocked: !!this._mouseDownBlockers.length,
          consumers: this._mouseDownConsumers,
          blockers: this._mouseDownBlockers,
          pointerEvent: e,
          position: this._pointerPos,
        });
        this._pointerUpdated();
        e.preventDefault();
      }
    }.bind(this));

    document.addEventListener("pointerup", function (e) {
      // the mouseDown check is necessary for when the click starts outside the canvas
      if (this._isActive && this._mouseDown) {
        let consumers = [];
        let blockers = [];
        this.callGlobalEvent("preMouseUp", {
          pointerEvent: e,
          startPosition: this._mouseDownPos,
          position: this._pointerPos,
        });
        this._mouseDown = false;

        const isDrag = this._pointerElemDragDistance >= this.nonDragThreshold;
        if (isDrag) {
          this.callGlobalEvent("prePointerDragEnd", {
            pointerEvent: e,
            startPosition: this._mouseDownPos,
            position: this._pointerPos,
          });
        } else {
          this.callGlobalEvent("preMouseClick", {
            pointerEvent: e,
            startPosition: this._mouseDownPos,
            position: this._pointerPos,
          });
        }

        for (const uuid of this.getRegistryItemsSorted("pointerAware")) {
          const obj = this._allObjs[uuid];

          if (obj.ignoreClickEvent(e)) {
            continue;
          }
          consumers.push(obj);
          obj.onMouseUp(e);
          if (obj._skipToGlobal) {
            break;
          }
          if (obj.blockClickEvent(e)) {
            blockers.push(obj);
            break;
          }
        }

        for (const uuid of this.getRegistryItemsSorted("held")) {
          const obj = this._allObjs[uuid];
          obj.onUnpressed(e);
          if (isDrag) {
            obj.onDragEnded(e);
          } else {
            obj.onClicked(e);
          }
        }
        this._pointerDragging = false;
        this._pointerDragDistance = 0;
        this._pointerDragMaxDelta = 0;
        this._pointerElemDragDistance = 0;

        this.unregisterAllObjsFor("held");
        this.unregisterAllObjsFor("dragged");
        this.callGlobalEvent("postMouseUp", {
          pointerEvent: e,
          startPosition: this._mouseDownPos,
          position: this._pointerPos,
          upConsumed: consumers,
          upBlocked: blockers,
          downConsumed: !!this._mouseDownConsumers.length,
          downBlocked: !!this._mouseDownBlockers.length,
          downConsumers: this._mouseDownConsumers,
          downBlockers: this._mouseDownBlockers,
        });
        if (isDrag) {
          this.callGlobalEvent("postPointerDragEnd", {
            pointerEvent: e,
            startPosition: this._mouseDownPos,
            position: this._pointerPos,
            upConsumed: consumers,
            upBlocked: blockers,
            downConsumed: !!this._mouseDownConsumers.length,
            downBlocked: !!this._mouseDownBlockers.length,
            downConsumers: this._mouseDownConsumers,
            downBlockers: this._mouseDownBlockers,
          });
        } else {
          this.callGlobalEvent("postMouseClick", {
            pointerEvent: e,
            startPosition: this._mouseDownPos,
            position: this._pointerPos,
            upConsumed: consumers,
            upBlocked: blockers,
            downConsumed: !!this._mouseDownConsumers.length,
            downBlocked: !!this._mouseDownBlockers.length,
            downConsumers: this._mouseDownConsumers,
            downBlockers: this._mouseDownBlockers,
          });
        }
        this._pointerUpdated();
        e.preventDefault();
      }
    }.bind(this));

    document.addEventListener("pointermove", function (e) {
      if (this._isActive) {
        this._pointerUpdated(e);
        e.preventDefault();
      }
    }.bind(this));
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
        this._cursorChange(type);
        break;
      }
    }
  }

  _cursorChange(type) {
    this._container.style.cursor = type;
  }
}
