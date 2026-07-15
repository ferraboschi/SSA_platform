"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RegField, RunnerQuestion } from "./ExamRunner";
import { EMAIL_RE } from "./exam-chrome";
// Google Places address autocomplete lives in the SHARED component — also used
// by the /conferma attendee page.
import { GoogleAddressInput } from "@/components/address/AddressInput";

// Country dial codes — Italy first (the SSA audience), then common ones.
const COUNTRY_CODES: { c: string; n: string }[] = [
  { c: "+39", n: "Italia" },
  { c: "+1", n: "USA / Canada" },
  { c: "+44", n: "Regno Unito" },
  { c: "+33", n: "Francia" },
  { c: "+49", n: "Germania" },
  { c: "+34", n: "Spagna" },
  { c: "+41", n: "Svizzera" },
  { c: "+43", n: "Austria" },
  { c: "+32", n: "Belgio" },
  { c: "+31", n: "Paesi Bassi" },
  { c: "+81", n: "Giappone" },
  { c: "+86", n: "Cina" },
  { c: "+61", n: "Australia" },
];

function splitPhone(val: string): { code: string; num: string } {
  const m = /^(\+\d{1,4})\s*(.*)$/.exec(val.trim());
  if (m && COUNTRY_CODES.some((x) => x.c === m[1])) return { code: m[1], num: m[2] };
  return { code: "+39", num: val.replace(/^\+\d{1,4}\s*/, "") };
}


export function RegInput({
  field,
  t,
  value,
  onChange,
}: {
  field: RegField;
  t: Record<string, string>;
  value: string[] | string | undefined;
  onChange: (v: string) => void;
}): ReactNode {
  const labels: Record<RegField, string> = {
    name: t.regName,
    gender: t.regGender,
    nationality: t.regNationality,
    email: t.regEmail,
    phone: t.regPhone,
    address: t.regAddress,
    dob: t.regDob,
    occupation: t.regOccupation,
    residency: t.regResidency,
  };
  const val = typeof value === "string" ? value : "";
  return (
    <>
      <p className="exam-public-q-text">{labels[field]}</p>
      {field === "gender" ? (
        <div className="exam-public-options">
          {[t.male, t.female].map((opt) => (
            <button
              key={opt}
              type="button"
              className={`exam-public-opt ${val === opt ? "selected" : ""}`}
              onClick={() => onChange(opt)}
            >
              <span className="exam-public-opt-mark" aria-hidden>
                {val === opt ? "●" : "○"}
              </span>
              <span>{opt}</span>
            </button>
          ))}
        </div>
      ) : field === "name" ? (
        (() => {
          const sp = val.indexOf(" ");
          const first = sp >= 0 ? val.slice(0, sp) : val;
          const last = sp >= 0 ? val.slice(sp + 1) : "";
          return (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="exam-public-input"
                type="text"
                placeholder="Nome"
                autoComplete="given-name"
                value={first}
                onChange={(e) => onChange(`${e.target.value} ${last}`.trim())}
                style={{ flex: 1 }}
              />
              <input
                className="exam-public-input"
                type="text"
                placeholder="Cognome"
                autoComplete="family-name"
                value={last}
                onChange={(e) => onChange(`${first} ${e.target.value}`.trim())}
                style={{ flex: 1 }}
              />
            </div>
          );
        })()
      ) : field === "address" ? (
        <GoogleAddressInput value={val} onChange={onChange} />
      ) : field === "email" ? (
        <>
          <input
            className="exam-public-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={val}
            onChange={(e) => onChange(e.target.value)}
          />
          {val.trim() !== "" && !EMAIL_RE.test(val.trim()) && (
            <p style={{ color: "#b42318", fontSize: 13, marginTop: 6 }}>{t.emailInvalid}</p>
          )}
        </>
      ) : field === "phone" ? (
        (() => {
          const { code, num } = splitPhone(val);
          return (
            <div style={{ display: "flex", gap: 8 }}>
              <select
                className="exam-public-input"
                value={code}
                onChange={(e) => onChange(`${e.target.value} ${num}`.trim())}
                style={{ flex: "0 0 130px" }}
              >
                {COUNTRY_CODES.map((cc) => (
                  <option key={cc.c + cc.n} value={cc.c}>
                    {cc.n} ({cc.c})
                  </option>
                ))}
              </select>
              <input
                className="exam-public-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={num}
                onChange={(e) => onChange(`${code} ${e.target.value}`.trim())}
                style={{ flex: 1 }}
              />
            </div>
          );
        })()
      ) : (
        <input
          className="exam-public-input"
          type="text"
          value={val}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}

// Drag-and-drop (+ arrow) ordering for "order" questions. The answer is the
// current arrangement of the option texts.
function OrderInput({
  options,
  value,
  onChange,
  hint,
}: {
  options: string[];
  value: string[] | string | undefined;
  onChange: (v: string[]) => void;
  hint: string;
}): ReactNode {
  const order = useMemo<string[]>(() => {
    const v = Array.isArray(value) ? value.filter((o) => options.includes(o)) : [];
    const missing = options.filter((o) => !v.includes(o));
    return v.length ? [...v, ...missing] : options.slice();
  }, [value, options]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  // TOUCH drag (owner batch 8): HTML5 draggable is mouse-only, so phones only
  // had the arrows. Pointer events move the row live under the finger
  // (touch-action:none on the handle keeps the page from scrolling meanwhile).
  // The pointer is CAPTURED BY THE CONTAINER, not the handle: each move
  // re-keys the rows, and a remounted handle would lose the capture and kill
  // the drag after one swap. The container survives every reorder.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchFrom = useRef<number | null>(null);
  // Only the pointer that grabbed the handle drives the drag — a second finger
  // must neither steal the row nor end the gesture.
  const touchPointer = useRef<number | null>(null);
  const [touchIdx, setTouchIdx] = useState<number | null>(null);
  const endTouch = (e: React.PointerEvent) => {
    if (touchPointer.current != null && e.pointerId !== touchPointer.current) return;
    touchPointer.current = null;
    touchFrom.current = null;
    setTouchIdx(null);
  };
  const onTouchDragMove = (e: React.PointerEvent) => {
    if (e.pointerId !== touchPointer.current) return;
    const from = touchFrom.current;
    if (from == null) return;
    const hit = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el) => (el as HTMLElement).dataset?.orderIdx != null) as HTMLElement | undefined;
    const to = hit ? Number(hit.dataset.orderIdx) : NaN;
    if (Number.isInteger(to) && to !== from) {
      move(from, to);
      touchFrom.current = to;
      setTouchIdx(to);
    }
  };

  // Commit the displayed arrangement once, so an order question the student
  // simply leaves as-is is still a real (submittable) answer, not "skipped".
  useEffect(() => {
    if (!Array.isArray(value)) onChange(order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = order.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
  };

  const btn: React.CSSProperties = {
    width: 28,
    height: 24,
    borderRadius: 6,
    border: "1px solid var(--border, #d4d4d8)",
    background: "var(--surface, #fff)",
    cursor: "pointer",
    fontSize: 11,
    lineHeight: 1,
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={onTouchDragMove}
      onPointerUp={endTouch}
      onPointerCancel={endTouch}
      style={{ display: "grid", gap: 8 }}
    >
      <div style={{ fontSize: 12, color: "var(--text-3, #6b7280)" }}>{hint}</div>
      {order.map((opt, i) => (
        <div
          key={`${i}-${opt}`}
          data-order-idx={i}
          draggable
          onDragStart={(e) => {
            // Firefox refuses to start a drag with an empty dataTransfer; the
            // payload is just the row index — never question text.
            e.dataTransfer.setData("text/plain", String(i));
            e.dataTransfer.effectAllowed = "move";
            setDragIdx(i);
          }}
          onDragOver={(e) => {
            // Accept row drags only — an external link/file must not turn the
            // row into a drop target (its default drop action NAVIGATES away).
            if (dragIdx != null) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIdx != null) move(dragIdx, i);
            setDragIdx(null);
          }}
          onDragEnd={() => setDragIdx(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            border: "1px solid var(--border, #d4d4d8)",
            borderRadius: 10,
            background: dragIdx === i || touchIdx === i ? "#fff7ed" : "var(--surface, #fff)",
            cursor: "grab",
          }}
        >
          <span
            aria-hidden
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") return; // mouse keeps HTML5 dnd
              if (touchPointer.current != null) return; // one drag at a time
              e.preventDefault();
              try {
                containerRef.current?.setPointerCapture(e.pointerId);
              } catch {
                /* inactive pointer — the drag still works via bubbling */
              }
              touchPointer.current = e.pointerId;
              touchFrom.current = i;
              setTouchIdx(i);
            }}
            // Generous hit area (~44px) — a missed grab falls on the row and
            // scrolls the page instead of dragging.
            style={{ color: "var(--text-4, #9ca3af)", fontSize: 16, touchAction: "none", padding: "14px 12px", margin: "-14px -6px", cursor: "grab" }}
          >⠿</span>
          <span style={{ flex: 1, fontSize: 15 }}>{opt}</span>
          <span style={{ display: "inline-flex", gap: 4 }}>
            <button type="button" style={btn} disabled={i === 0} aria-label="su" onClick={() => move(i, i - 1)}>▲</button>
            <button type="button" style={btn} disabled={i === order.length - 1} aria-label="giù" onClick={() => move(i, i + 1)}>▼</button>
          </span>
        </div>
      ))}
    </div>
  );
}

export function QuestionInput({
  q,
  value,
  onChange,
  answerLabel,
  dragHint,
  reveal,
}: {
  q: RunnerQuestion;
  value: string[] | string | undefined;
  onChange: (v: string[] | string) => void;
  answerLabel: string;
  dragHint: string;
  reveal?: boolean;
}): ReactNode {
  const multi = q.type === "multi";
  const optionTypes = ["single", "multi", "truefalse", "image"];
  const selected = useMemo<string[]>(
    () => (Array.isArray(value) ? value : value ? [value] : []),
    [value],
  );
  const correctSet = new Set(q.correct ?? []);

  if (optionTypes.includes(q.type) && q.options.length > 0) {
    const toggle = (opt: string) => {
      if (multi) {
        onChange(
          selected.includes(opt)
            ? selected.filter((o) => o !== opt)
            : [...selected, opt],
        );
      } else {
        onChange([opt]);
      }
    };
    return (
      <div className="exam-public-options">
        {q.options.map((opt, i) => {
          const isCorrect = reveal && correctSet.has(i);
          return (
            <button
              key={i}
              type="button"
              className={`exam-public-opt ${selected.includes(opt) ? "selected" : ""} ${isCorrect ? "correct" : ""}`}
              onClick={() => toggle(opt)}
            >
              <span className="exam-public-opt-mark" aria-hidden>
                {multi
                  ? selected.includes(opt)
                    ? "☑"
                    : "☐"
                  : selected.includes(opt)
                    ? "●"
                    : "○"}
              </span>
              <span>{opt}</span>
              {isCorrect && (
                <span style={{ marginLeft: "auto", color: "#1a7f43", fontWeight: 700 }}>
                  ✓ corretta
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (q.type === "order" && q.options.length > 0) {
    return <OrderInput options={q.options} value={value} onChange={onChange} hint={dragHint} />;
  }

  if (q.type === "fill") {
    return (
      <input
        className="exam-public-input"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={answerLabel}
      />
    );
  }

  if (q.type === "rating") {
    const current = Number(typeof value === "string" ? value : Array.isArray(value) ? value[0] : 0) || 0;
    return (
      <div style={{ display: "flex", gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(String(n))}
            aria-label={`${n}`}
            style={{
              width: 46,
              height: 46,
              borderRadius: 10,
              border: "1.5px solid " + (n <= current ? "#e8a33d" : "var(--border, #d4d4d8)"),
              background: n <= current ? "#fbe9c8" : "transparent",
              color: n <= current ? "#b97400" : "var(--text-mute, #9ca3af)",
              fontSize: 20,
              cursor: "pointer",
              transition: "all 120ms",
            }}
          >
            ★
          </button>
        ))}
      </div>
    );
  }

  return (
    <textarea
      className="exam-public-textarea"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={answerLabel}
      rows={5}
    />
  );
}
