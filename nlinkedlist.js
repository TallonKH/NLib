export default class NLinkedList {
    constructor() {
        this._size = 0
        this._head = null
        this._tail = null
    }

    _removeNode(node) {
        const next = node._next;
        const prev = node._prev;
        if (node === this._head) {
            this._head = next;
        }
        if (node === this._tail) {
            this._tail = prev;
        }
        if (next !== null) {
            next._prev = prev;
        }
        if (prev !== null) {
            prev._next = next;
        }
        this._size--;
    }

    forEach(func) {
        let current = this._head;
        while (current) {
            func(current.value);
            current = current._next;
        }
    }

    forEachReverse(func) {
        let current = this._tail;
        while (current) {
            func(current.value);
            current = current._prev;
        }
    }

    * generator() {
        let current = this._head;
        while (current) {
            yield current.value;
            current = current._next;
        }
    }

    getSize() {
        return this._size;
    }

    peekHead() {
        return this._head.value;
    }

    popHead() {
        if (this._size === 0) {
            throw "Cannot pop from empty list!";
        }
        const popped = this._head;
        this._removeNode(popped);
        return popped.value;
    }

    pushHead(value) {
        const node = new NLinkedListNode(value);
        if (this._size == 0) {
            // if list is empty, make both head and tail
            this._tail = node;
        } else {
            // link this node to the existing head and vice versa
            node._next = this._head;
            if (this._head) {
                this._head._prev = node;
            }
        }
        this._head = node;
        this._size++;
    }

    peekTail() {
        return this._tail.value;
    }

    popTail() {
        if (this._size === 0) {
            throw "Cannot pop from empty list!";
        }
        const popped = this._tail;
        this._removeNode(popped);
        return popped.value;
    }

    pushTail(value) {
        const node = new NLinkedListNode(value);
        if (this._size == 0) {
            // if list is empty, make both head and tail
            this._head = node;
        } else {
            // link this node to the existing tail and vice versa
            node._prev = this._tail;
            if (this._tail) {
                this._tail._next = node;
            }
        }
        this._tail = node;
        this._size++;
    }
}

class NLinkedListNode {
    constructor(value) {
        this.value = value;
        this._next = null;
        this._prev = null;
    }

    getNext() {
        return this._next
    }

    getPrev() {
        return this._prev
    }
}