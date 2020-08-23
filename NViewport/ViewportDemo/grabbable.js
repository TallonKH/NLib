import VPObject from "../vp_object.js";
import NColor from "../../ncolor.js";

export default class GrabObj extends VPObject {
    constructor(viewport, position, {} = {}) {
        super(viewport, {
            "mouseListening": true,
            "position": position
        })
        this.size = 15;
        this.colorHex = "#aaa"
        this.color = NColor.fromHex(this.colorHex);
    }

    setColor(color){
        this.color = color;
        this.colorHex = color.toHex();
        this.vp.queueRedraw();
    }

    draw(ctx) {
        ctx.fillStyle = this.color.toHex();
        if (this.held || (this.mouseOverlapping && !this.vp.mouseDown)) {
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

    onDragStarted() {
        super.onDragStarted();
        this.suggestCursor("grabbing");
        this.dragInitialPosition = this.position;
        this.zSubOrder = 1;
    }
    
    onDragged() {
        super.onDragged();
        this.position = this.dragInitialPosition.addp(this.vp._mousePos.subtractp(this.vp._mouseDownPos));
        this.vp.queueRedraw();
    }
    
    onDragEnded() {
        super.onDragEnded();
        this.unsuggestCursor("grabbing");
        this.zSubOrder = 0;
    }

    onMouseEntered() {
        super.onMouseEntered();
        this.suggestCursor("pointer");
        this.vp.queueRedraw();
    }
    
    onMouseExited() {
        super.onMouseExited();
        this.unsuggestCursor("pointer");
        this.vp.queueRedraw();
    }

    onClicked() {
        super.onClicked();
        if (this.vp.shiftDown) {

        }
    }
}