import { useEffect, useRef } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { LoggerEvents } from "./studyalign/useLogger";

// A Quill rich-text editor that reports interactions through the StudyAlign
// logger passed in as a prop. Instantiates Quill imperatively on a ref (the
// robust way to use Quill 2 inside React).
export default function QuillEditor({ log }) {
  const containerRef = useRef(null);
  const quillRef = useRef(null);

  useEffect(() => {
    // Quill inserts its toolbar as a sibling of the element it's given, so init
    // into a throwaway child and clear the wrapper on cleanup, otherwise React
    // StrictMode's double-invoke in dev leaves a second toolbar behind.
    const wrapper = containerRef.current;
    const editorEl = document.createElement("div");
    wrapper.appendChild(editorEl);

    const editor = new Quill(editorEl, {
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
    quillRef.current = editor;

    const root = editor.root; // the contenteditable element

    // ── Keyboard events ──────────────────────────────────────────────
    // logging every keydown directly can be chatty; buffer keydowns and log
    // keyup immediately, so the demo shows both bulk and direct logging.
    const onKeyDown = (e) => log(LoggerEvents.BULK_KEY_DOWN, e, { text: editor.getText() });
    const onKeyUp = (e) => log(LoggerEvents.KEY_UP, e);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("keyup", onKeyUp);

    // ── Mouse events ─────────────────────────────────────────────────
    const onClick = (e) => log(LoggerEvents.MOUSE_CLICK, e);
    root.addEventListener("click", onClick);

    // ── Quill-level events ───────────────────────────────────────────
    editor.on("text-change", (delta, _old, source) => {
      log(LoggerEvents.EDITOR_TEXT_CHANGE, { delta, source }, { length: editor.getLength() });
    });
    editor.on("selection-change", (range, _old, source) => {
      if (range) log(LoggerEvents.EDITOR_SELECTION_CHANGE, { range, source });
    });

    return () => {
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("keyup", onKeyUp);
      root.removeEventListener("click", onClick);
      quillRef.current = null;
      wrapper.innerHTML = ""; // remove Quill's toolbar + editor DOM
    };
  }, [log]);

  return (
    <div className="editor-shell">
      <div ref={containerRef} />
    </div>
  );
}
