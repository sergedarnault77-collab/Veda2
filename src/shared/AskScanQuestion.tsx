import { useState, useRef, useEffect, useMemo } from "react";
import { loadLS } from "../lib/persist";
import "./AskScanQuestion.css";

type ScanAnswer = {
  shortAnswer: string;
  explanation: string;
  whyFlagged?: string | null;
  practicalNotes?: string[];
  disclaimer: string;
};

interface ScanContext {
  productName: string;
  ingredients: Array<{
    name: string;
    amount: number;
    unit: string;
    percentDailyValue?: number;
  }>;
  flags: string[];
  userContext?: {
    activeMedications?: string[];
    recentSupplements?: string[];
  };
}

interface Props {
  productName: string;
  nutrients: any[];
  interactions: Array<{ headline: string; severity: string }>;
}

const SCAN_PLACEHOLDERS = [
  "Can I take this with my medication?",
  "Is this too much magnesium?",
  "Why is this flagged here?",
  "Should I take this morning or evening?",
  "Does this interact with anything I take?",
  "Is this safe to take daily?",
];

const GENERAL_PLACEHOLDERS = [
  "Can I take magnesium with my ADHD meds?",
  "How much vitamin D is too much?",
  "Should I take iron on an empty stomach?",
  "Do my supplements interact with each other?",
  "When is the best time to take B12?",
  "Is it okay to take calcium and zinc together?",
];

export default function AskScanQuestion({ productName, nutrients, interactions }: Props) {
  const hasScanContext = Boolean(productName);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ScanAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  const examples = hasScanContext ? SCAN_PLACEHOLDERS : GENERAL_PLACEHOLDERS;
  const placeholderIdx = useRef(Math.floor(Math.random() * examples.length));
  const placeholder = examples[placeholderIdx.current % examples.length];

  const triggerLabel = hasScanContext ? "Ask about this scan" : "Have a question?";
  const helperText = hasScanContext
    ? "Ask anything about ingredients, overlaps, timing, or why something is flagged."
    : "Ask about your supplements, medications, timing, or interactions.";

  useEffect(() => {
    if (answer && answerRef.current) {
      answerRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [answer]);

  const scanContext = useMemo((): ScanContext => {
    const ingredients = (Array.isArray(nutrients) ? nutrients : [])
      .filter((n: any) => n?.name && typeof n.amountToday === "number")
      .map((n: any) => ({
        name: n.name,
        amount: n.amountToday,
        unit: n.unit || "mg",
        percentDailyValue: n.dailyReference
          ? Math.round((n.amountToday / n.dailyReference) * 100)
          : undefined,
      }));

    const flags: string[] = [];
    for (const ix of interactions) {
      if (ix.severity === "warning" || ix.severity === "caution") {
        flags.push(ix.headline);
      }
    }

    const meds = loadLS<any[]>("veda.meds.v1", []);
    const supps = loadLS<any[]>("veda.supps.v1", []);

    return {
      productName,
      ingredients,
      flags,
      userContext: {
        activeMedications: meds.map((m: any) => m.displayName).filter(Boolean),
        recentSupplements: supps.map((s: any) => s.displayName).filter(Boolean),
      },
    };
  }, [productName, nutrients, interactions]);

  async function handleAsk() {
    const q = question.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const res = await fetch("/api/ask-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, scanContext }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      let data: any;
      try {
        data = await res.json();
      } catch {
        setError("Could not read response. Please try again.");
        return;
      }

      if (!data?.ok) {
        setError(data?.error || "Something went wrong. Please try again.");
        return;
      }

      setAnswer(data.answer);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setError("Request timed out. Please try again.");
      } else {
        setError("Connection failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!expanded) {
    return (
      <div className="ask-scan">
        <button className="ask-scan__trigger" data-testid="ask-button" onClick={() => {
          setExpanded(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}>
          <span className="ask-scan__triggerIcon">💬</span>
          <span className="ask-scan__triggerText">{triggerLabel}</span>
        </button>
        <div className="ask-scan__helper">
          {helperText}
        </div>
      </div>
    );
  }

  return (
    <div className="ask-scan ask-scan--expanded">
      <div className="ask-scan__header">
        <span className="ask-scan__headerIcon">💬</span>
        <span className="ask-scan__headerTitle">{triggerLabel}</span>
      </div>

      <div className="ask-scan__inputRow">
        <input
          ref={inputRef}
          className="ask-scan__input"
          data-testid="ask-input"
          type="text"
          placeholder={placeholder}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !loading && question.trim()) handleAsk(); }}
          disabled={loading}
          maxLength={500}
        />
        <button
          className="ask-scan__send"
          data-testid="ask-submit"
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          aria-label="Ask"
        >
          {loading ? (
            <span className="ask-scan__spinner" />
          ) : (
            "→"
          )}
        </button>
      </div>

      {error && (
        <div className="ask-scan__error">{error}</div>
      )}

      {answer && (
        <div className="ask-scan__answer" data-testid="ask-answer" ref={answerRef}>
          <div className="ask-scan__short">{answer.shortAnswer}</div>

          {answer.explanation && (
            <div className="ask-scan__explanation">{answer.explanation}</div>
          )}

          {answer.whyFlagged && (
            <div className="ask-scan__flagged">
              <span className="ask-scan__flaggedLabel">Why flagged</span>
              {answer.whyFlagged}
            </div>
          )}

          {Array.isArray(answer.practicalNotes) && answer.practicalNotes.length > 0 && (
            <ul className="ask-scan__notes">
              {answer.practicalNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}

          <div className="ask-scan__disclaimer">{answer.disclaimer}</div>

          <button
            className="ask-scan__another"
            onClick={() => {
              setQuestion("");
              setAnswer(null);
              setError(null);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
          >
            Ask another question
          </button>
        </div>
      )}
    </div>
  );
}
