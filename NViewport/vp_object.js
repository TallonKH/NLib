import NPoint from "../npoint.js";

var idCounter = 0;

export default class VPObject {
    constructor(vp, {
        position = new NPoint(),
        drawable = true,
        mouseListening = false,
        zOrder = 0
    } = {}) {
        this._vp = vp;
        this._uuid = idCounter++;

        this._position = position;
        this._drawable = drawable;
        this._mouseListening = mouseListening;
        this._zOrder = zOrder;
        this._zSubOrder = 0;


        // true if the pointer is overlapping the object
        this._pointerAware = false;

        // true if (the pointer is overlapping the object) && (the OnPointerOverlap event is not blocked by higher objects)
        this._pointerOverlapping = false;

        // true if (the mouse is down) && (this._pointerAware was true when the mouse was pressed) && (the OnPressed event is not blocked by higher objects)
        this._held = false;

        // true if (this._held is true) && (the cursor has moved a minimum distance since the mouse was pressed)
        this._dragged = false;

        this._size = 10;
        this._suggestedCursors = {};
    }

    static globalInit() {

    }

    setSize(size){
        this._size = size;
        this._vp.queueRedraw();
    }

    suggestCursor(type) {
        this._suggestedCursors[type] = (this._suggestedCursors[type] || 0) + 1
        this._vp.suggestCursor(type);
    }

    unsuggestCursor(type) {
        this._suggestedCursors[type] = this._suggestedCursors[type] - 1
        this._vp.unsuggestCursor(type);
    }

    unsuggestAllCursors() {
        for (const type in this._suggestedCursors) {
            this._vp.unsuggestCursor(type, this._suggestedCursors[type]);
        }
        this._suggestedCursors = {};
    }

    intersects(point) {
        return this._position.subtractp(point).lengthSquared() < Math.pow(this._size, 2);
    }

    draw(ctx) {
        ctx.fillStyle = "red";
        this.fillCircle(ctx);
    }

    strokeLine(ctx, posA, posB) {
        ctx.beginPath();
        ctx.moveTo(posA.x, posA.y);
        ctx.lineTo(posB.x, posB.y);
        ctx.stroke();
    }

    fillCircle(ctx) {
        ctx.beginPath();
        ctx.ellipse(
            ~~this._position.x, ~~this._position.y,
            this._size, this._size,
            0,
            0, 2 * Math.PI);
        ctx.fill();
    }

    strokeCircle(ctx, scale = 1) {
        ctx.beginPath();
        ctx.ellipse(
            ~~this._position.x, ~~this._position.y,
            this._size * scale, this._size * scale,
            0,
            0, 2 * Math.PI);
        ctx.stroke();
    }

    /**
     * Return true if this object should indiscriminately block all pointer-based events from reaching lower objects.
     * 
     * The affected events are: (onPointerAwarenessStarted, onPointerAwarenessEnded),
     * (onPointerOverlapStarted, onPointerOverlapMovement, onPointerOverlapEnded),
     * (onPressed, onUnpressed, onMouseUp, onClicked),
     * (onDragStarted, onDragged, onDragEnded),
     * (onWheel)
     * 
     * Default behavior: block.
     */
    blockAllPointerEvents() {
        return false;
    }

    /**
     * Return true if this object should indiscriminately ignore all pointer-based events
     * 
     * The affected events are: (onPointerAwarenessStarted, onPointerAwarenessEnded),
     * (onPointerOverlapStarted, onPointerOverlapMovement, onPointerOverlapEnded),
     * (onPressed, onUnpressed, onMouseUp, onClicked),
     * (onDragStarted, onDragged, onDragEnded),
     * (onWheel)
     * 
     * If true, blocking will also be locked to false.
     */
    ignoreAllPointerEvents() {
        return false;
    }

    /**
     * Return true if this object should block the overlap event from reaching lower objects.
     * 
     * The affected events are: (onPointerOverlapStarted, onPointerOverlapMovement, onPointerOverlapEnded).
     * 
     * Default behavior: block.
     */
    blockOverlapEvent(pointerMoveEvent) {
        return true;
    }

    /**
     * If true, will prevent (onPointerOverlapStarted, onPointerOverlapMovement, onPointerOverlapEnded).
     * 
     * If true, blocking will also be locked to false.
     */
    ignoreOverlapEvent(pointerMoveEvent) {
        return false;
    }

    /**
     * Return true if this object should block the click event from reaching lower objects.
     * 
     * If true for the mouse down event, will block (onPressed, onDragStarted, onDragged, onDragEnded, onClicked).
     * 
     * If true for the mouse up event, will only block (onMouseUp). 
     * 
     * (onDragEnded, onClicked, onUnpressed) will not be blocked. This is to prevent unexpected behavior,
     * (ie: a dragged object not realizing that the mouse has been released).
     * 
     * Default behavior: block.
     */
    blockClickEvent(mouseClickEvent) {
        return true;
    }

    /**
     * If true for the mouse down event, will prevent (onPressed, onDragStarted, onDragged, onDragEnded, onClicked).
     * 
     * If true for the mouse up event, will only prevent (onMouseUp). 
     * 
     * (onDragEnded, onClicked, onUnpressed) will still be carried out. This is to prevent unexpected behavior,
     * (ie: a dragged object not realizing that the mouse has been released).
     * 
     * It true, blocking will also be locked to false.
     */
    ignoreClickEvent(mouseClickEvent) {
        return false;
    }

    /**
     * Return true if this object should block the wheel event from reaching lower objects.
     * 
     * The affected events are: (onWheel).
     * 
     * Default behavior: do not block.
     */
    blockWheelEvent(wheelEvent) {
        return false;
    }

    /**
     * If true, will prevent onWheel.
     * 
     * It true, blocking will also be locked to false.
     */
    ignoreWheelEvent(wheelEvent) {
        return false;
    }

    /** 
     * Triggered when the cursor is intersecting the object, disregarding higher objects. 
     * 
     * Can only be blocked with blockAllPointerEvents.
     * 
     * For the blocking event, see OnPointerOverlapStarted.
     * For most purposes, (ie: highlighting a hovered object), the blocking event should be used.
     */
    onPointerAwarenessStarted(pointerMoveEvent) {}

    /** 
     * Triggered when the cursor stops intersecting the object, disregarding higher objects. 
     * 
     * Can only be blocked with blockAllPointerEvents.
     * 
     * For the blocking event, see OnPointerOverlapEnded.
     * For most purposes, (ie: highlighting a hovered object), the blocking event should be used.
     */
    onPointerAwarenessEnded(pointerMoveEvent) {}

    /** 
     * Triggered when the cursor overlaps the object, and the event is not blocked by a higher object.
     * 
     * Blocking behavior is determined by blockOverlapEvent.
     * 
     * For most purposes, (ie: highlighting a hovered object), this is the function to use.
     * For the non-blocking event, see onPointerAwarenessStarted.
     */
    onPointerOverlapStarted(pointerMoveEvent) {}

    /** 
     * Will occur after onPointerOverlapStarted in the same frame.
     * Will occur before onPointerOverlapEnded in the same frame.
     * 
     * Blocking behavior is determined by blockOverlapEvent.
     */
    onPointerOverlapMovement(pointerMoveEvent) {}

    /** 
     * Triggered when the cursor stops overlapping the object, and the event is not blocked by a higher object.
     * 
     * Blocking behavior is determined by blockOverlapEvent.
     * 
     * For most purposes, (ie: highlighting a hovered object), this is the function to use.
     * For the non-blocking event, see onPointerAwarenessEnded.
     */
    onPointerOverlapEnded(pointerMoveEvent) {}

    /** 
     * Called when the mouse is pressed over an object.
     * 
     * Blocking behavior is determined by blockClickEvent.
     */
    onPressed(mouseClickEvent) {}

    /** 
     * Called when the mouse is released over an object, regardless of whether it was pressed on the object 
     * 
     * Event order: onMouseUp -> onUnpressed -> onDragEnded/onClicked
     * 
     * Blocking behavior is determined by blockClickEvent.
     */
    onMouseUp(mouseClickEvent) {}

    /** 
     * Called when the mouse is released after having been pressed on the object, regarding of intermediate/final movements/position.
     * 
     * Event order: onMouseUp -> onUnpressed -> onDragEnded/onClicked
     * 
     * Blocking behavior is determined by blockClickEvent.
     */
    onUnpressed(mouseClickEvent) {}

    /**
     * Called when the mouse is pressed on object and moved a minimum distance.
     * 
     * Blocking behavior is determined by blockClickEvent.
     */
    onDragStarted(pointerMoveEvent) {}

    /** 
     * Called when the mouse is moved while in drag mode. Movement does not have to take place on the object.
     * 
     * Blocking behavior is determined by blockClickEvent.
     */
    onDragged(pointerMoveEvent) {}

    /**
     * Called when the mouse is released while in dragging mode.
     * 
     * Event order: onMouseUp -> onUnpressed -> onDragEnded/onClicked
     * 
     * Blocking behavior is determined by blockClickEvent.
     */
    onDragEnded(mouseClickEvent) {}

    /** 
     * Called when the mouse is pressed on the object and released, without having moved a signiciant distance in between.
     * 
     * Event order: onMouseUp -> onUnpressed -> onDragEnded/onClicked
     * 
     * Blocking behavior is determined by blockClickEvent.
     */
    onClicked(mouseClickEvent) {}

    /** 
     * Called when the mouse wheel is used while the cursor is overlapping the object.
     * 
     * Blocking behavior is determined by blockWheelEvent.
     */
    onWheel(wheelEvent) {}

    onForgotten() {
        this.unsuggestAllCursors();
    }
}