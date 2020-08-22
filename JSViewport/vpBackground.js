class VPBackground extends VPObject {
    constructor(viewport, {} = {}) {
        super(viewport, {
            "mouseListening": true,
            "zOrder": -65536
        })
        this.color = "#ebebeb";
    }

    draw(ctx) {
        let currentTransform = ctx.getTransform();
        ctx.resetTransform();
        ctx.fillStyle = this.color;
        ctx.fillRect(0, 0, this.vp.canvas.width, this.vp.canvas.height);
        ctx.setTransform(currentTransform);
    }

    isOverlapping(point) {
        return true;
    }

    isMouseBlockingOverlap() {
        return true;
    }

    isMouseBlockingPress() {
        return true;
    }

    onDragStarted() {
        super.onDragStarted();
        if (this.vp.pannable) {
            this.suggestCursor("move");
        }
    }

    onDragged() {
        super.onDragged();
        if (this.vp.pannable) {
            this.vp.panCenter = this.vp.panCenter.addp(this.vp.mouseElemDelta);
        }
    }

    onDragEnded() {
        super.onDragEnded();
        if (this.vp.pannable) {
            this.unsuggestCursor("move");
        }
    }
}