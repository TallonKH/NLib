export default class StateManager {
  static listenerIdCounter = 0;
  constructor() {
    this._data = {};
  }

  ensureExists(name, defaultVal = undefined) {
    let dat = this._data[name];

    if (dat !== undefined) {
      return dat;
    }

    dat = {
      _value: defaultVal,
      _listeners: {},
    };
    this._data[name] = dat;

    return dat;
  }

  set(name, value, changer = null) {
    const dat = this.ensureExists(name);
    const prev = dat._value;
    dat._value = value;
    this.alertListener(name, {
      name: name,
      prevValue: prev,
      changer: changer,
    });
  }

  get(name) {
    const dat = this._data[name];
    if (dat === undefined) {
      throw `Cannot get ${name} from state mangager because it does not exist!`;
    }
    return dat._value;
  }

  perform(name, func, changer = null) {
    const dat = this.ensureExists(name);
    func(dat._value);
    this.alertListener(name, {
      name: name,
      prevValue: undefined, // TODO figure out if this is needed
      changer: changer,
    });
  }

  increment(name, changer = null) {
    const dat = this.ensureExists(name);
    const prev = dat._value;
    dat._value = prev + 1;
    this.alertListener(name, {
      name: name,
      prevValue: prev,
      changer: changer,
    });
    return dat._value;
  }

  listen(name, callback, initialTrigger = true) {
    StateManager.listenerIdCounter++;
    const id = StateManager.listenerIdCounter;
    const dat = this.ensureExists(name);
    dat._listeners[id] = callback;
    if (initialTrigger) {
      this.alertListener(name, {
        name: name,
        prevValue: dat._value,
        changer: null,
      }, id);
    }
    return id;
  }

  update(name, changer = null) {
    this.alertListener(name, {
      name: name,
      changer: changer,
    })
  }

  alertListener(name, info, targetListenerId = -1) {
    const dat = this.ensureExists(name);
    if (targetListenerId === -1) {
      for (const listenerId in dat._listeners) {
        this.alertListener(name, info, listenerId);
      }
    } else {
      dat._listeners[targetListenerId](dat._value, info);
    }
  }
}
