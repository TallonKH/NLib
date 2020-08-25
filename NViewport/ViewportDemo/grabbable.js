import VPObject from "../vp_object.js";
import NColor from "../../ncolor.js";

export default class GrabObj extends VPObject {
    constructor(viewport, position, {} = {}) {
        super(viewport, {
            "mouseListening": true,
            "position": position
        })
        this._size = 15;
        this.colorHex = "#aaa"
        this.color = NColor.fromHex(this.colorHex);
    }

    setColor(color) {
        this.color = color;
        this.colorHex = color.toHex();
        this._vp.queueRedraw();
    }

    draw(ctx) {
        ctx.fillStyle = this.color.toHex();
        if (this._held || (this._mouseOverlapping && !this._vp.mouseDown)) {
            ctx.lineWidth = 6;
            ctx.strokeStyle = "#ec5";
            this.strokeCircle(ctx);
        }
        this.fillCircle(ctx);
    }

    isMouseBlockingOverlap() {
        return true;
    }

    isMouseBlockingPress() {
        return true;
    }

    onDragStarted(pointerMoveEvent) {
        super.onDragStarted(pointerMoveEvent);
        this.suggestCursor("grabbing");
        this.dragInitialPosition = this._position;
        this._zSubOrder = 1;
    }

    onDragged(pointerMoveEvent) {
        super.onDragged(pointerMoveEvent);
        this._position = this.dragInitialPosition.addp(this._vp._mousePos.subtractp(this._vp._mouseDownPos));
        this._vp.queueRedraw();
    }

    onDragEnded(pointerUpEvent) {
        super.onDragEnded(pointerUpEvent);
        this.unsuggestCursor("grabbing");
        this._zSubOrder = 0;
    }

    onMouseEntered(pointerMoveEvent) {
        super.onMouseEntered();
        this.suggestCursor("pointer");
        this._vp.queueRedraw();
    }

    onMouseExited() {
        super.onMouseExited();
        this.unsuggestCursor("pointer");
        this._vp.queueRedraw();
    }

    onClicked() {
        super.onClicked();
        if (this._vp.shiftDown) {

        }
    }
}