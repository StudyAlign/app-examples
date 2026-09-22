import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // Locally buffered bulk events, exposed so the UI can display them.
  const [buffer, setBuffer] = useState([]);

  const conditionId = params.conditionId;
  const participantToken = params.participantToken;

  // Read readiness through a ref so the logger callbacks below stay stable and
  // never re-create the Quill editor (which keys its effect off `log`).
  const isReadyRef = useRef(false);
  useEffect(() => {
    isReadyRef.current = isReady;
  }, [isReady]);

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
  const logNow = useCallback(
    async (eventName, data, metaData = {}) => {
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
    },
    [sal, conditionId]
  );

  // Buffer an interaction in the library; flushed later with transmit().
  const addToBulk = useCallback(
    (eventName, data, metaData = {}) => {
      const timestamp = sal.getTimestampWithOffset();
      const type = bulkToEvent(eventName);
      if (type.startsWith("key")) {
        sal.addKeyboardInteraction(type, data, timestamp, metaData);
      } else {
        sal.addMouseInteraction(type, data, timestamp, data.relatedTarget, metaData);
      }
    },
    [sal]
  );

  // Single entry point used by components. Always logs to the console so the
  // demo is observable even without a backend, then forwards to StudyAlign.
  const log = useCallback(
    (eventName, data, metaData = {}) => {
      console.log("[StudyAlign] log", eventName, { data, metaData });
      if (isBulk(eventName)) {
        // Record every bulk event in the local view (visible even without a
        // backend); forward to the library for transmission only when ready.
        setBuffer((prev) => [...prev, describeBuffered(bulkToEvent(eventName), data)]);
        if (isReadyRef.current) addToBulk(eventName, data, metaData);
        return;
      }
      if (isReadyRef.current) logNow(eventName, data, metaData);
    },
    [addToBulk, logNow]
  );

  const transmit = useCallback(
    async (eventName, bulkSize = 25) => {
      // Clear the buffered view for the flushed kind (up to bulkSize), matching
      // what the library sends. Runs even in console-only mode so the flush
      // button stays interactive.
      const kind =
        eventName === TransmitterEvents.TRANSMIT_KEY_BULK
          ? "key"
          : eventName === TransmitterEvents.TRANSMIT_MOUSE_BULK
            ? "mouse"
            : null;
      if (kind) setBuffer((prev) => removeUpTo(prev, kind, bulkSize));
      if (!isReadyRef.current) return undefined;
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
    },
    [sal, conditionId]
  );

  // Tells the StudyAlign backend this condition is done (enables "next").
  const proceed = useCallback(async () => {
    if (!participantToken) return;
    try {
      await sal.updateNavigator(participantToken, "condition", "done");
    } catch (e) {
      console.warn("[StudyAlign] navigator update failed", e);
    }
  }, [sal, participantToken]);

  return { isReady, sal, log, transmit, proceed, buffer };
}
