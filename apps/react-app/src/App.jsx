import { useEffect, useState } from "react";
import useLogger, { LoggerEvents, TransmitterEvents } from "./studyalign/useLogger";
import QuillEditor from "./QuillEditor";
import "./styles.css";

// The StudyAlign backend the demo logs to (baked in at build time).
const STUDY_ALIGN_URL =
  import.meta.env.VITE_STUDY_ALIGN_URL || "https://hciaitools.uni-bayreuth.de/study-align-dev";

export default function App() {
  const { isReady, log, transmit, proceed } = useLogger(STUDY_ALIGN_URL);
  const [flushed, setFlushed] = useState(false);

  useEffect(() => {
    if (isReady) {
      // Record the browser once at the start of the condition.
      log(LoggerEvents.USER_AGENT, window.navigator.userAgent);
    }
  }, [isReady, log]);

  const handleFlush = async () => {
    log(LoggerEvents.BULK_MOUSE_CLICK, new MouseEvent("click"), { action: "flush" });
    await transmit(TransmitterEvents.TRANSMIT_KEY_BULK);
    await transmit(TransmitterEvents.TRANSMIT_MOUSE_BULK);
    setFlushed(true);
    setTimeout(() => setFlushed(false), 2500);
  };

  return (
    <div className="page">
      <header className="intro">
        <span className="brand-tag">StudyAlign · React demo</span>
        <h1>Rich-text editor with interaction logging</h1>
        <p>
          This is a <strong>StudyAlign demo app</strong>. It embeds a Quill rich-text
          editor and uses the <code>study-align-lib</code> library to record how you
          interact with it: every keystroke and mouse click, plus editor
          text and selection changes, is logged to the StudyAlign backend (and
          echoed to the browser console). It mirrors how you would instrument a
          real study prototype so participant behaviour can be analysed later.
        </p>
        <p className={"status " + (isReady ? "ok" : "warn")}>
          {isReady
            ? "Connected to StudyAlign: interactions are being recorded."
            : "No logger_key in the URL: logging to the console only. Open via a StudyAlign study to record."}
        </p>
      </header>

      <main>
        <QuillEditor log={log} />

        <div className="actions">
          <button className="btn btn-primary" onClick={handleFlush}>
            {flushed ? "Flushed ✓" : "Flush buffered events"}
          </button>
          <button className="btn btn-outline" onClick={proceed}>
            Finish &amp; proceed
          </button>
        </div>
        <p className="hint">
          Buffered keydown events are held locally and sent in bulk when you flush;
          open the console to watch every logged interaction live.
        </p>
      </main>
    </div>
  );
}
