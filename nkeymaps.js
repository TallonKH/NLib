isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

class KeybindHandler {
    constructor() {
        this.macAdjust = true;

        this.contextStack = [];
        this.allContextGroups = {};

        this.activeContextGroups = [];

        this.shiftDown = false;
        this.altDown = false;
        this.ctrlDown = false;
        this.metaDown = false;

    }

    setup(){
        this.setupListeners();
    }

    setupListeners() {
        if (this.listenersActive) {
            return false;
        }
        this.listenersActive = true;
        // Object.freeze(this.listenersActive);

        const self = this;

        const keyHandlerGenerator = function (keyState) {
            return function (e) {
                switch (e.code) {
                    case "ShiftLeft":
                    case "ShiftRight":
                        self.shiftDown = keyState;
                        break;
                    case "AltLeft":
                    case "AltRight":
                        self.altDown = keyState;
                        break;
                    case "ControlLeft":
                    case "ControlRight":
                        self.ctrlDown = keyState;
                        break;
                    case "MetaLeft":
                    case "MetaRight":
                        if (self.macAdjust && isMac) {
                            self.ctrlDown = keyState;
                        } else {
                            self.metaDown = keyState;
                        }
                        break;
                }

                outerloop:
                    for (const group of self.activeContextGroups) {
                        const binds = (keyState ? group.downBinds : group.upBinds)[e.code] || [];
                        for (const keybind of binds) {
                            if (keybind.keyCombo.matchesModifiers(self.shiftDown, self.altDown, self.ctrlDown, self.metaDown)) {
                                keybind.action.perform();
                                e.preventDefault();
                                e.stopPropagation();
                                break outerloop;
                            }
                        }
                    }
            }
        }

        document.addEventListener("keydown", keyHandlerGenerator(true));
        document.addEventListener("keyup", keyHandlerGenerator(false));
        return true;
    }

    recalcActiveGroups() {
        const groupsFiltered = [];
        for (const groupCode in this.allContextGroups) {
            const group = this.allContextGroups[groupCode];
            if (group.matches(this.contextStack)) {
                groupsFiltered.push(group);
            }
        }

        groupsFiltered.sort((a, b) => {
            const ap = a.contextMatcher.priority;
            const bp = b.contextMatcher.priority;
            return (bp[0] - ap[0]) || (bp[1] - ap[1]);
        });

        this.activeContextGroups = [];
        const self = this;

        groupsFiltered.forEach(group => {
            self.activeContextGroups.push(group);
        });
    }

    addContextGroup(group) {
        const ctxString = group.contextMatcher.ctxString;
        const existing = this.allContextGroups[ctxString];
        if (existing) {
            existing.merge(group);
            // don't need to recalc if merging
        } else {
            this.allContextGroups[ctxString] = group;
            this.recalcActiveGroups();
        }
    }

    addBindingQuick(ctxStr, keyStr, name, action) {
        const group = new ContextGroup(ContextMatcher.import(ctxStr));
        group.addKeybind(
            new Keybind(KeyCombo.import(keyStr), new KeyAction(name, action))
        );
        this.addContextGroup(group);
    }

    findCollisions(candidateKeybind) {
        // use a set because the same keybind can appear in multiple context groups
        const colliding = new Set();
        this.allContextGroups.forEach(function (_, group) {
            group.findCollisions[candidateKeybind].forEach(x => colliding.add(x));
        });

        return colliding;
    }

    popContext() {
        return this.contextStack.pop();
        this.recalcActiveGroups();
    }

    pushContext(ctx) {
        this.contextStack.push(ctx);
        this.recalcActiveGroups();
    }
}

/** Immutable */
class ContextMatcher {
    static contextModes = Object.freeze({
        "equals": {
            name: "equals",
            priority: 10,
            desc: ls => `Context matches: [${ls}]`,
            comparison: function (active, checks) {
                if (active.length != checks.length) {
                    return false;
                }
                for (let i = 0; i < active.length && i < checks.length; i++) {
                    if (active[i] != checks[i]) {
                        return false;
                    }
                }
                return true;
            }
        },
        "suffix": {
            name: "suffix",
            priority: 8,
            desc: ls => `Context ends with: [${ls}]`,
            comparison: function (active, checks) {
                if (active.length < checks.length) {
                    return false;
                }
                for (let i = 0, j = active.length - checks.length; i < checks.length; i++, j++) {
                    if (active[j] != checks[i]) {
                        return false;
                    }
                }
                return true;
            }
        },
        "prefix": {
            name: "prefix",
            priority: 6,
            desc: ls => `Context begins with: [${ls}]`,
            comparison: function (active, checks) {
                if (active.length < checks.length) {
                    return false;
                }
                for (let i = 0; i < checks.length; i++) {
                    if (active[i] != checks[i]) {
                        return false;
                    }
                }
                return true;
            }
        },
        "hasSeq": {
            name: "hasSeq",
            priority: 4,
            desc: ls => `Context contains sequence: [${ls}]`,
            comparison: function (active, checks) {
                if (active.length < checks.length) {
                    return false;
                }
                for (i = 0; i <= active.length - checks.length; i++) {
                    let success = true;
                    for (j = 0; j < checks.length; j++) {
                        if (active[i + j] != checks[j]) {
                            success = false;
                            break;
                        }
                    }
                    if (success) {
                        return true;
                    }
                }
                return false;
            }
        },
        "hasAll": {
            name: "hasAll",
            priority: 2,
            desc: ls => `Context contains all: [${ls}]`,
            comparison: function (active, checks) {
                return checks.every(a => active.includes(a));
            }
        },
        "global": {
            name: "global",
            priority: 0,
            desc: _ => `Any Context`,
            comparison: (a, b) => true
        }
    });

    constructor(mode, terms) {
        this.mode = mode;
        this.terms = terms;
        this.priority = [ContextMatcher.contextModes[mode], terms.length];
        this.ctxString = `(${this.mode}[${this.terms}])`;
        this.comparison = active => ContextMatcher.contextModes[mode].comparison(active, terms);
        Object.freeze(this);
    }

    static import(str) {
        if (str == "(global)") {
            return new ContextMatcher("global", []);
        }
        const i = str.indexOf("[");
        const terms = str.substring(i + 1, str.length - 2).split(",");
        return new ContextMatcher(str.substring(1, i), terms);
    }

    getDescription() {
        return ContextMatcher.contextModes[this.mode].desc(this.terms);
    }
}

class ContextGroup {
    constructor(contextMatcher) {
        this.contextMatcher = contextMatcher;
        // Object.freeze(this.contextMatcher);

        this.upBinds = {};
        this.downBinds = {};
    }

    findCollisions(candidateKeybind) {
        const binds = candidateKeybind.keyCombo.direction ? this.downBinds : this.upBinds;

        const collisions = [];
        binds.forEach(function (_, existingKeybind) {
            if (existingKeybind.collides[candidateKeybind]) {
                collisions.push(existingKeybind);
            }
        });

        return collisions;
    }

    matches(active) {
        return this.contextMatcher.comparison(active);
    }


    addKeybind(keybind) {
        const binds = keybind.keyCombo.direction ? this.downBinds : this.upBinds;
        const keyCode = keybind.keyCombo.keyCode;
        const existing = binds[keyCode];
        if (existing) {
            existing.push(keybind);
        } else {
            binds[keyCode] = [keybind];
        }
    }

    /** DOES NOT DEAL COLLISION HANDLING - that is up to the implementer */
    merge(other) {
        for (const keyCode in other.upBinds) {
            for (const bind of other.upBinds[keyCode]) {
                this.addKeybind(bind);
            }
        }
        for (const keyCode in other.downBinds) {
            for (const bind of other.downBinds[keyCode]) {
                this.addKeybind(bind);
            }
        }
    }
}

/** (Immutable) */
class KeyCombo {
    // direction: true=press, false=release
    constructor(keyCode, direction, {
        shift = false,
        alt = false,
        ctrl = false,
        meta = false
    } = {}) {
        this.keyCode = keyCode;
        this.direction = direction;
        this.needsShift = shift;
        this.needsAlt = alt;
        this.needsCtrl = ctrl;
        this.needsMeta = meta;
        Object.freeze(this);
    }

    collides(other) {
        return this.keyCode == other.keyCode && this.direction == other.direction &&
            (
                this.needsShift == other.needsShift &&
                this.needsAlt == other.needsAlt &&
                this.needsCtrl == other.needsCtrl &&
                this.needsMeta == other.needsMeta
            );
    }

    matchesModifiers(shiftDown, altDown, ctrlDown, metaDown) {
        return (
            this.needsShift == shiftDown &&
            this.needsAlt == altDown &&
            this.needsMeta == metaDown &&
            this.needsCtrl == ctrlDown
        );
    }

    export () {
        let str = "";
        if (this.needMeta) {
            str += "meta+";
        }
        if (this.needCtrl) {
            str += "ctrl+";
        }
        if (this.needAlt) {
            str += "alt+";
        }
        if (this.needShift) {
            str += "shift+";
        }

        str += this.keyCode + "." + (direction ? "down" : "up");

        return "(" + str + ")";
    }

    static import(str) {
        str = str.substring(1, str.length - 1);
        const terms = str.split("+");

        let [key, dir] = terms.pop().split(".");
        dir = !(dir == "up");
        return new KeyCombo(key, dir, {
            shift: terms.includes("shift"),
            alt: terms.includes("alt"),
            ctrl: terms.includes("ctrl"),
            meta: terms.includes("meta")
        });
    }
}

/** (Immutable) */
class Keybind {
    constructor(keyCombo, action) {
        this.keyCombo = keyCombo;
        this.action = action;
        Object.freeze(this);
    }
}

/** (Immutable) */
class KeyAction {
    constructor(name, func) {
        this.name = name;
        this.perform = func;
        Object.freeze(this);
    }
}

function example() {
    // set up the main handler
    const handler = new KeybindHandler();
    handler.setup();

    // create a context group
    const ctx = new ContextMatcher("suffix", ["viewport"]);
    const globl = new ContextGroup(ctx);
    handler.addContextGroup(globl);

    // add a keybind: ctrl+S, when the top context is viewport
    const skey = new Keybind(
        new KeyCombo("KeyS", direction = true, {
            ctrl: true
        }),
        new KeyAction(
            "test",
            _ => console.log("S")
        )
    );
    globl.addKeybind(skey);

    // change the context
    handler.pushContext("viewport");

    console.log(handler.activeContextGroups);
}

function example2() {
    // set up the main handler
    const handler = new KeybindHandler();
    handler.setup();

    // add a keybind: ctrl+O, in any context
    handler.addBindingQuick(
        "(global)",
        "(ctrl+KeyO)",
        "o",
        _ => console.log("O")
    );

    // add a keybind: ctrl+S, when the top context is viewport
    handler.addBindingQuick(
        "(suffix[viewport])",
        "(ctrl+KeyS)",
        "s suff",
        _ => console.log("S suff")
    );

    // add a keybind: ctrl+S, when the root context is viewport
    handler.addBindingQuick(
        "(prefix[viewport])",
        "(ctrl+KeyS)",
        "s pre",
        _ => console.log("S pre")
    );

    // change the context
    handler.pushContext("viewport");

    console.log(handler.activeContextGroups);
}

example2();