import { useEffect, useMemo, useState } from "react";
import StudyAlignLib from "study-align-lib";

// Event names the StudyAlign backend understands. Mouse/keyboard names double
// as the DOM event type the library reads off the native event.
export const LoggerEvents = Object.freeze({
  USER_AGENT: "USER_AGENT",
  MOUSE_CLICK: "click",
  MOUSE_DBLCLICK: "dblclick",
  MOUSE_DOWN: "mousedown",
  MOUSE_UP: "mouseup",
  MOUSE_ENTER: "mouseenter",
  MOUSE_LEAVE: "mouseleave",
  KEY_DOWN: "keydown",
  KEY_UP: "keyup",
  // Add-to-bulk variants (buffered locally, flushed with a transmitter call).
  BULK_KEY_DOWN: "bulk_keydown",
  BULK_KEY_UP: "bulk_keyup",
  BULK_MOUSE_CLICK: "bulk_click",
  // App-specific generic events.
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

// Initialises study-align-lib from the URL parameters the StudyAlign study
// frontend passes to a prototype (study_id, condition_id, logger_key,
// participant_token) and returns helpers for logging interactions.
export default function useLogger(apiUrl) {
  const params = useMemo(() => StudyAlignLib.getParamsFromURL(), []);
  const sal = useMemo(
    () => new StudyAlignLib(apiUrl, params.studyId),
    [apiUrl, params.studyId]
  );
  const [isReady, setIsReady] = useState(false);

  const conditionId = params.conditionId;
  const participantToken = params.participantToken;

  useEffect(() => {
    if (params.loggerKey) {
      sal.setLoggerKey(params.loggerKey);
    }
    // Without a logger_key the backend rejects interactions; log locally only.
    setIsReady(Boolean(params.loggerKey && conditionId));
    if (!params.loggerKey) {
      console.warn(
        "[StudyAlign] no logger_key in the URL: interactions are logged to the console only. " +
          "Open this app via a StudyAlign study to record to the backend."
      );
    }
  }, [sal, params.loggerKey, conditionId]);

  // Fire-and-forget: log a single interaction to the backend immediately.
  async function logNow(eventName, data, metaData = {}) {
    const timestamp = sal.getTimestampWithOffset();
    try {
      switch (eventName) {
        case LoggerEvents.MOUSE_CLICK:
        case LoggerEvents.MOUSE_DBLCLICK:
        case LoggerEvents.MOUSE_DOWN:
        case LoggerEvents.MOUSE_UP:
        case LoggerEvents.MOUSE_ENTER:
        case LoggerEvents.MOUSE_LEAVE:
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

  // Buffer an interaction locally; flush later with transmit().
  function addToBulk(eventName, data, metaData = {}) {
    const timestamp = sal.getTimestampWithOffset();
    const type = bulkToEvent(eventName);
    if (type.startsWith("key")) {
      sal.addKeyboardInteraction(type, data, timestamp, metaData);
    } else {
      sal.addMouseInteraction(type, data, timestamp, data.relatedTarget, metaData);
    }
  }

  // Single entry point used by components. Always logs to the console so the
  // demo is observable even without a backend, then forwards to StudyAlign.
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

  // Tells the StudyAlign backend this condition is done (enables "next").
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
