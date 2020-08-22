var idCounter = 0;
class VPObject {
    constructor(vp, {
        position = new NPoint(),
        drawable = true,
        mouseListening = false,
        zOrder = 0
    } = {}) {
        this.vp = vp;
        this.uuid = idCounter++;
        
        this.position = position;
        this.drawable = drawable;
        this.mouseListening = mouseListening;
        this.zOrder = zOrder;
        this.zSubOrder = 0;
        
        this.mouseOverlapping = false;
        this.held = false;
        this.grabbed = false;
        this.size = 10;
        this.suggestedCursors = {};
    }

    static globalInit() {

    }

    suggestCursor(type) {
        this.suggestedCursors[type] = (this.suggestedCursors[type] || 0) + 1
        this.vp.suggestCursor(type);
    }

    unsuggestCursor(type) {
        this.suggestedCursors[type] = this.suggestedCursors[type] - 1
        this.vp.unsuggestCursor(type);
    }

    unsuggestAllCursors() {
        for (const type in this.suggestedCursors) {
            this.vp.unsuggestCursor(type, this.suggestedCursors[type]);
        }
        this.suggestedCursors = {};
    }
    isMouseBlockingOverlap() {
        return false;
    }

    isMouseBlockingPress() {
        return false;
    }

    isOverlapping(point) {
        return this.position.subtractp(point).lengthSquared() < Math.pow(this.size, 2);
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
        const adPos = this.position;
        ctx.beginPath();
        ctx.ellipse(
            adPos.x, adPos.y,
            this.size /* * this.vp.zoomFactor*/, this.size /* * this.vp.zoomFactor*/,
            0,
            0, 2 * Math.PI);
        ctx.fill();
    }

    strokeCircle(ctx, scale = 1) {
        const self = this;
        // const adPos = this.vp.canvasToViewSpace(self.position);
        const adPos = this.position;
        ctx.beginPath();
        ctx.ellipse(
            adPos.x, adPos.y,
            self.size /*  * this.vp.zoomFactor */ * scale, self.size /* * this.vp.zoomFactor */ * scale,
            0,
            0, 2 * Math.PI);
        ctx.stroke();
    }

    onMouseEntered() {
        // console.log("ENTER");
    }

    onMouseExited() {
        // console.log("EXIT");
    }

    /** Called when the mouse is pressed over an object */
    onPressed() {
        // console.log("DOWN");
    }

    /** 
     * Called when the mouse is released after having been pressed on the object, disregarding intermediate/final movements/position.
     * Called before both onDragEnded and onClicked
     */
    onUnpressed() {
        // console.log("UP");
    }

    /** Called when the mouse is released over an object, regardless of whether it was pressed on the object */
    onMouseUp() {
        // console.log("UP");
    }

    /** Called when the mouse is pressed on object and moved a minimum distance */
    onDragStarted() {
        // console.log("!! UP");
    }

    onDragged() {

    }

    /** Called when the mouse is pressed on object and released, after moving a minimum distance */
    onDragEnded() {
        // console.log("!! UP");
    }

    /** Called when the mouse is pressed on object and released, after moving a limited distance */
    onClicked() {
        // console.log("CLICKED");
    }

    onForget() {
        this.unsuggestAllCursors();
    }
}