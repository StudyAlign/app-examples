import StudyAlignLib from "study-align-lib";

// Event names the StudyAlign backend understands. Mouse/keyboard names double
// as the DOM event type the library reads off the native event.
export const LoggerEvents = Object.freeze({
  USER_AGENT: "USER_AGENT",
  MOUSE_CLICK: "click",
  MOUSE_DOWN: "mousedown",
  MOUSE_UP: "mouseup",
  KEY_DOWN: "keydown",
  KEY_UP: "keyup",
  BULK_KEY_DOWN: "bulk_keydown",
  BULK_MOUSE_CLICK: "bulk_click",
  EDITOR_TEXT_CHANGE: "EDITOR_TEXT_CHANGE",
  EDITOR_SELECTION_CHANGE: "EDITOR_SELECTION_CHANGE",
});

export const TransmitterEvents = Object.freeze({
  TRANSMIT_MOUSE_BULK: "transmit_mouse_bulk",
  TRANSMIT_KEY_BULK: "transmit_key_bulk",
  TRANSMIT_GENERIC_BULK: "transmit_generic_bulk",
});

const isBulk = (name) => name.startsWith("bulk_");
const bulkToEvent = (name) => name.slice("bulk_".length);

// Compact, display-only summary of a buffered interaction, for the demo's
// "buffered events" view. Not sent to the backend.
let bufferSeq = 0;
function describeBuffered(type, data) {
  const kind = type.startsWith("key") ? "key" : "mouse";
  let detail = "";
  if (kind === "key") {
    detail = data && data.key ? data.key : "";
  } else if (data && typeof data.clientX === "number") {
    detail = `${data.clientX}, ${data.clientY}`;
  }
  return { id: ++bufferSeq, kind, type, detail, ts: Date.now() };
}

// Removes up to n buffered entries of the given kind (mirrors what a bulk
// transmitter sends), leaving the rest queued.
function removeUpTo(list, kind, n) {
  let removed = 0;
  return list.filter((entry) => {
    if (entry.kind === kind && removed < n) {
      removed += 1;
      return false;
    }
    return true;
  });
}

// Wraps study-align-lib: reads the StudyAlign URL parameters, initialises the
// library, and exposes log / transmit / proceed helpers. Mirrors the React
// app's useLogger hook, without React.
export function createLogger(apiUrl) {
  const params = StudyAlignLib.getParamsFromURL();
  const sal = new StudyAlignLib(apiUrl, params.studyId);

  if (params.loggerKey) {
    sal.setLoggerKey(params.loggerKey);
  }
  const conditionId = params.conditionId;
  const participantToken = params.participantToken;
  const isReady = Boolean(params.loggerKey && conditionId);

  // Locally buffered bulk events + simple subscription so the UI can re-render.
  let buffer = [];
  const listeners = new Set();
  const notify = () => listeners.forEach((cb) => cb(buffer));
  const onBufferChange = (cb) => {
    listeners.add(cb);
    cb(buffer);
    return () => listeners.delete(cb);
  };

  if (!isReady) {
    console.warn(
      "[StudyAlign] no logger_key in the URL: interactions are logged to the console only. " +
        "Open this app via a StudyAlign study to record to the backend."
    );
  }

  async function logNow(eventName, data, metaData = {}) {
    const timestamp = sal.getTimestampWithOffset();
    try {
      switch (eventName) {
        case LoggerEvents.MOUSE_CLICK:
        case LoggerEvents.MOUSE_DOWN:
        case LoggerEvents.MOUSE_UP:
          await sal.logMouseInteraction(conditionId, eventName, data, timestamp, data.relatedTarget, metaData);
          break;
        case LoggerEvents.KEY_DOWN:
        case LoggerEvents.KEY_UP:
          await sal.logKeyboardInteraction(conditionId, eventName, data, timestamp, metaData);
          break;
        default:
          await sal.logGenericInteraction(conditionId, eventName, data, timestamp, metaData);
      }
    } catch (e) {
      console.warn("[StudyAlign] logging failed", eventName, e);
    }
  }

  function addToBulk(eventName, data, metaData = {}) {
    const timestamp = sal.getTimestampWithOffset();
    const type = bulkToEvent(eventName);
    if (type.startsWith("key")) {
      sal.addKeyboardInteraction(type, data, timestamp, metaData);
    } else {
      sal.addMouseInteraction(type, data, timestamp, data.relatedTarget, metaData);
    }
  }

  function log(eventName, data, metaData = {}) {
    console.log("[StudyAlign] log", eventName, { data, metaData });
    if (isBulk(eventName)) {
      // Record every bulk event in the local view (visible even without a
      // backend); forward to the library for transmission only when ready.
      buffer = [...buffer, describeBuffered(bulkToEvent(eventName), data)];
      notify();
      if (isReady) addToBulk(eventName, data, metaData);
      return;
    }
    if (isReady) logNow(eventName, data, metaData);
  }

  async function transmit(eventName, bulkSize = 25) {
    // Clear the buffered view for the flushed kind (up to bulkSize), matching
    // what the library sends. Runs even in console-only mode so the flush button
    // stays interactive.
    const kind =
      eventName === TransmitterEvents.TRANSMIT_KEY_BULK
        ? "key"
        : eventName === TransmitterEvents.TRANSMIT_MOUSE_BULK
          ? "mouse"
          : null;
    if (kind) {
      buffer = removeUpTo(buffer, kind, bulkSize);
      notify();
    }
    if (!isReady) return;
    try {
      switch (eventName) {
        case TransmitterEvents.TRANSMIT_MOUSE_BULK:
          return await sal.logMouseInteractionBulk(conditionId, bulkSize);
        case TransmitterEvents.TRANSMIT_KEY_BULK:
          return await sal.logKeyboardInteractionBulk(conditionId, bulkSize);
        case TransmitterEvents.TRANSMIT_GENERIC_BULK:
          return await sal.logGenericInteractionBulk(conditionId, bulkSize);
        default:
          return undefined;
      }
    } catch (e) {
      console.warn("[StudyAlign] bulk transmission failed", eventName, e);
    }
  }

  async function proceed() {
    if (!participantToken) return;
    try {
      await sal.updateNavigator(participantToken, "condition", "done");
    } catch (e) {
      console.warn("[StudyAlign] navigator update failed", e);
    }
  }

  return { isReady, sal, log, transmit, proceed, onBufferChange };
}
