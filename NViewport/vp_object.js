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
        
        this._mouseOverlapping = false;
        this._held = false;
        this._grabbed = false;

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

    isMouseBlockingOverlap() {
        return false;
    }

    isMouseBlockingPress() {
        return false;
    }

    isBlockingWheel() {
        return false;
    }

    isOverlapping(point) {
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

    onMouseEntered(pointerMoveEvent) {}

    onMouseExited(pointerMoveEvent) {}

    /** Called when the mouse is pressed over an object */
    onPressed(pointerDownEvent) {}

    /** 
     * Called when the mouse is released after having been pressed on the object, regarding of intermediate/final movements/position.
     * Called before both onDragEnded and onClicked
     */
    onUnpressed(pointerUpEvent) {}

    /** Called when the mouse is released over an object, regardless of whether it was pressed on the object */
    onMouseUp(pointerUpEvent) {}

    /** Called when the mouse is pressed on object and moved a minimum distance */
    onDragStarted(pointerDownEvent) {}

    /** Called when the mouse is moved while in drag mode*/
    onDragged(pointerMoveEvent) {}

    /** Called when the mouse is released while in drag mode */
    onDragEnded(pointerUpEvent) {}

    /** Called when the mouse is pressed and released, without having moved a signiciant distance in between */
    onClicked(pointerUpEvent) {}

    /** Called when the mouse wheel is used while the cursor is overlapping the object */
    onWheel(wheelEvent){}

    onForgotten() {
        this.unsuggestAllCursors();
    }
}