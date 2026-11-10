import { evt, Evts } from "./events.manage.js";

let eventsTally = {};
let requestTally = {};

evt.onListen(function (eventInfo) {
  let { data: eventData, event: name, timestamp } = eventInfo;
  if (name === "request") {
    let { method, path } = eventData[0];
    requestTally[method] = (requestTally[method] ?? {}) || {};
    requestTally[method][path] = (requestTally[method][path] || 0) + 1;
  } else {
    eventsTally[name] = (eventsTally[name] || 0) + 1;
  }
});

function tallyDebug(json = false) {
  if (json) {
    return { requests: requestTally, events: eventsTally };
  }
}

export default tallyDebug;
