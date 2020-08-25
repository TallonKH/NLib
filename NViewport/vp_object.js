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

    /** if true, will prevent any objects behind from receiving ANY pointer-intersect-based events */
    blocksPointerEvents() {
        return false;
    }

    intersects(point) {
        return this._position.subtractp(point).lengthSquared() < Math.pow(this._size, 2);
    }

    draw(ctx) {
        ctx.fillStyle = "black";
        this.fillCircle(ctx);
    }

    strokeLine(ctx, posA, posB) {
        // posA = this.vp.canvasToViewSpace(posA);
        // posB = this.vp.canvasToViewSpace(posB);
        ctx.beginPath();
        ctx.moveTo(posA.x, posA.y);
        ctx.lineTo(posB.x, posB.y);
        ctx.stroke();
    }

    fillCircle(ctx) {
        // const adPos = this.vp.canvasToViewSpace(this.position);
        const adPos = this._position;
        ctx.beginPath();
        ctx.ellipse(
            adPos.x, adPos.y,
            this._size, this._size,
            0,
            0, 2 * Math.PI);
        ctx.fill();
    }

    strokeCircle(ctx, scale = 1) {
        const self = this;
        const adPos = this._position;
        ctx.beginPath();
        ctx.ellipse(
            adPos.x, adPos.y,
            self._size * scale, self._size * scale,
            0,
            0, 2 * Math.PI);
        ctx.stroke();
    }

    /** 
     * Triggered when the cursor overlaps the object. 
     * Cannot blocked by other objects.
     * For the blocking event, see OnPointerOverlapStarted.
     * For most purposes, (ie: highlighting a hovered object), the blocking event should be used.
     */
    onPointerAwarenessStarted(pointerMoveEvent) {}
    
    /** 
     * Triggered when the cursor stops overlapping the object. 
     * Cannot be blocked by other objects.
     * For the blocking event, see OnPointerOverlapEnded.
     * For most purposes, (ie: highlighting a hovered object), the blocking event should be used.
     */
    onPointerAwarenessEnded(pointerMoveEvent) {}

    /** 
     * Triggered when the cursor overlaps the object, and the event is not blocked by a higher object.
     * For most purposes, (ie: highlighting a hovered object), this is the function to use.
     * Blocking behavior can be changed via the 2nd input (result).
     * Blocking in this event will also block onPointerOverlapMovement and onPointerOverlapEnded.
     * For the non-blocking event, see onPointerAwarenessStarted.
     * Default behavior: block.
     */
    onPointerOverlapStarted(pointerMoveEvent, result) {}

    /** 
     * Will occur after onPointerOverlapStarted in the same frame.
     * Will occur before onPointerOverlapEnded in the same frame.
     */
    onPointerOverlapMovement(pointerMoveEvent) {}

    /** 
     * Triggered when the cursor stops overlapping the object, and the event is not blocked by a higher object.
     * For most purposes, (ie: highlighting a hovered object), this is the function to use.
     * For the non-blocking event, see onPointerAwarenessEnded.
     * This cannot be blocked directly, but blocking onPointerOverlapStarted will prevent this from being called.
     */
    onPointerOverlapEnded(pointerMoveEvent) {}

    /** 
     * Called when the mouse is pressed over an object 
     * Blocking behavior can be changed via the 2nd input (result).
     * Blocking this will also prevent dependent events (onUnpressed, onClicked, onDragStarted, onDragEnded)
     * Default behavior: block.
     */
    onPressed(pointerDownEvent, result) {}

    /** 
     * Called when the mouse is released after having been pressed on the object, regarding of intermediate/final movements/position.
     * Called before both onDragEnded and onClicked.
     * This cannot be blocked directly, but blocking onPressed will prevent this from being called.
     */
    onUnpressed(pointerUpEvent) {}

    /** 
     * Called when the mouse is released over an object, regardless of whether it was pressed on the object 
     * Blocking behavior can be changed via the 2nd input (result).
     * Blocking this will NOT prevent calls to onUnpressed, onClicked, or onDragEnded
     * Default behavior: block.
     */
    onMouseUp(pointerUpEvent, result) {}

    /**
     * Called when the mouse is pressed on object and moved a minimum distance
     * This cannot be blocked directly, but blocking onPressed will prevent this from being called.
     */
    onDragStarted(pointerDownEvent) {}

    /** 
     * Called when the mouse is moved while in drag mode
     * This cannot be blocked directly, but blocking onPressed will prevent this from being called.
    */
    onDragged(pointerMoveEvent) {}

    /**
     * Called when the mouse is released while in drag mode
     * This cannot be blocked directly, but blocking onPressed will prevent this from being called.
     */
    onDragEnded(pointerUpEvent) {}

    /** 
     * Called when the mouse is pressed and released, without having moved a signiciant distance in between.
     * This cannot be blocked directly, but blocking onPressed will prevent this from being called.
     */
    onClicked(pointerUpEvent) {}

    /** 
     * Called when the mouse wheel is used while the cursor is overlapping the object.
     * Blocking behavior can be changed via the 2nd input (result).
     * Default behavior: do not block.
    */
    onWheel(wheelEvent, result){}

    onForgotten() {
        this.unsuggestAllCursors();
    }
}