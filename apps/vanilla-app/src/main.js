import Quill from "quill";
import "quill/dist/quill.snow.css";
import "./styles.css";
import { createLogger, LoggerEvents, TransmitterEvents } from "./logger";

// The StudyAlign backend the demo logs to (baked in at build time by Vite).
const STUDY_ALIGN_URL =
  import.meta.env.VITE_STUDY_ALIGN_URL || "https://hciaitools.uni-bayreuth.de/study-align-dev";

const logger = createLogger(STUDY_ALIGN_URL);

// ── Status banner ──────────────────────────────────────────────────
const statusEl = document.getElementById("status");
if (logger.isReady) {
  statusEl.textContent = "Connected to StudyAlign: interactions are being recorded.";
  statusEl.className = "status ok";
} else {
  statusEl.textContent =
    "No logger_key in the URL: logging to the console only. Open via a StudyAlign study to record.";
  statusEl.className = "status warn";
}

// ── Quill editor ───────────────────────────────────────────────────
const editor = new Quill("#editor", {
  theme: "snow",
  placeholder: "Start typing… every keystroke and click is logged.",
  modules: {
    toolbar: [
      ["bold", "italic", "underline"],
      [{ list: "ordered" }, { list: "bullet" }],
      ["clean"],
    ],
  },
});

const root = editor.root; // the contenteditable element

// Keyboard: buffer keydowns (sent in bulk on flush), log keyup directly.
root.addEventListener("keydown", (e) =>
  logger.log(LoggerEvents.BULK_KEY_DOWN, e, { text: editor.getText() })
);
root.addEventListener("keyup", (e) => logger.log(LoggerEvents.KEY_UP, e));

// Mouse clicks inside the editor.
root.addEventListener("click", (e) => logger.log(LoggerEvents.MOUSE_CLICK, e));

// Quill-level content and selection changes.
editor.on("text-change", (delta, _old, source) =>
  logger.log(LoggerEvents.EDITOR_TEXT_CHANGE, { delta, source }, { length: editor.getLength() })
);
editor.on("selection-change", (range, _old, source) => {
  if (range) logger.log(LoggerEvents.EDITOR_SELECTION_CHANGE, { range, source });
});

// Record the browser once at the start.
if (logger.isReady) {
  logger.log(LoggerEvents.USER_AGENT, window.navigator.userAgent);
}

// ── Buttons ────────────────────────────────────────────────────────
const flushBtn = document.getElementById("flush");
flushBtn.addEventListener("click", async () => {
  logger.log(LoggerEvents.BULK_MOUSE_CLICK, new MouseEvent("click"), { action: "flush" });
  await logger.transmit(TransmitterEvents.TRANSMIT_KEY_BULK);
  await logger.transmit(TransmitterEvents.TRANSMIT_MOUSE_BULK);
  flushBtn.textContent = "Flushed ✓";
  setTimeout(() => (flushBtn.textContent = "Flush buffered events"), 2500);
});

document.getElementById("proceed").addEventListener("click", () => logger.proceed());

// ── Buffered-events view ───────────────────────────────────────────
// Re-render the collapsed accordion whenever the local buffer changes.
const bufferCountEl = document.getElementById("buffer-count");
const bufferBodyEl = document.getElementById("buffer-body");

logger.onBufferChange((buffer) => {
  bufferCountEl.textContent = String(buffer.length);
  if (buffer.length === 0) {
    bufferBodyEl.innerHTML =
      '<p class="buffer-empty">Nothing buffered yet. Type in the editor: ' +
      "keydown events queue here until you flush them.</p>";
    return;
  }
  const rows = buffer
    .map((entry) => {
      const time = new Date(entry.ts).toLocaleTimeString();
      const detail = entry.detail
        ? `<code>${escapeHtml(entry.detail)}</code>`
        : "";
      return (
        `<li><span class="buffer-kind ${entry.kind}">${entry.type}</span>` +
        `${detail}<time>${time}</time></li>`
      );
    })
    .join("");
  bufferBodyEl.innerHTML = `<ul class="buffer-list">${rows}</ul>`;
});

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}
