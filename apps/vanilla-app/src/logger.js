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
    if (!isReady) return;
    if (isBulk(eventName)) {
      addToBulk(eventName, data, metaData);
    } else {
      logNow(eventName, data, metaData);
    }
  }

  async function transmit(eventName, bulkSize = 25) {
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

  return { isReady, sal, log, transmit, proceed };
}
