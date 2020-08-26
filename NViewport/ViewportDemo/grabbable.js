import VPObject from "../vp_object.js";
import NColor from "../../ncolor.js";

export default class GrabObj extends VPObject {
    constructor(viewport, position, {} = {}) {
        super(viewport, {
            "mouseListening": true,
            "position": position
        })
        this._size = 100;
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
        if (this._held || (this._pointerOverlapping && !this._vp.mouseDown)) {
            ctx.lineWidth = 6;
            ctx.strokeStyle = "#ec5";
            this.strokeCircle(ctx);
        }
        this.fillCircle(ctx);
    }

    ignoreOverlapEvent(pointerMoveEvent) {
        if (super.ignoreOverlapEvent(pointerMoveEvent)) {
            return true;
        }

        // ignore if something else is being held
        return (this._vp._heldObjIds.size > 0) && (!this._vp._heldObjIds.has(this._uuid));
    }

    ignoreClickEvent(mouseClickEvent){
        if (super.ignoreClickEvent(mouseClickEvent)) {
            return true;
        }

        return this._uuid == 2;
    }

    onPressed(mouseClickEvent) {
        super.onPressed(mouseClickEvent);
        this.setColor(NColor.fromHex("#4455ff"));
    }

    onUnpressed(mouseClickEvent) {
        super.onUnpressed(mouseClickEvent);
        this.setColor(NColor.fromHex("#ff5555"));
    }

    onPointerOverlapStarted(pointerMoveEvent) {
        super.onPointerOverlapStarted(pointerMoveEvent);
        this.suggestCursor("pointer");
        this._vp.queueRedraw();
        return true;
    }

    onPointerOverlapEnded(pointerMoveEvent) {
        super.onPointerOverlapEnded(pointerMoveEvent);
        this.unsuggestCursor("pointer");
        this._vp.queueRedraw();
    }

    onDragStarted(pointerMoveEvent) {
        super.onDragStarted(pointerMoveEvent);
        this.suggestCursor("grabbing");
        this.dragInitialPosition = this._position;
        this._zSubOrder = 1;
    }

    onDragged(pointerMoveEvent) {
        super.onDragged(pointerMoveEvent);
        this._position = this.dragInitialPosition.addp(this._vp._pointerDragDelta);
        this._vp.queueRedraw();
    }

    onDragEnded(pointerUpEvent) {
        super.onDragEnded(pointerUpEvent);
        this.unsuggestCursor("grabbing");
        this._zSubOrder = 0;
    }
}