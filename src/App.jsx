import { useState, useEffect } from "react";

const LEVELS = ["A1", "A2", "B1", "B2"];
const LEVEL_LABELS = { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-Int." };

const SAMPLE_COLLOCATIONS = {
  A1: ["make a mistake", "do homework", "have lunch", "take a shower", "go shopping", "get up", "come home", "watch TV", "play games", "drink water"],
  A2: ["make friends", "do exercise", "have a good time", "take photos", "go for a walk", "get dressed", "feel tired", "tell a story", "save money", "spend time"],
  B1: ["make progress", "do research", "have a discussion", "take responsibility", "go on a trip", "get permission", "pay attention", "raise awareness", "keep in touch", "break the rules"],
  B2: ["make an exception", "draw a conclusion", "have an impact", "take into account", "come to terms with", "bear in mind", "put forward", "set a precedent", "reach a consensus", "tackle a problem"],
};

const PINK = "#F76C8A";
const TEAL = "#3DBCB8";
const YELLOW = "#FFB347";
const BG = "#F9F6F2";
const WHITE = "#FFFFFF";
const DARK = "#2D2D3A";
const GRAY = "#9898A6";
const LIGHT_PINK = "#FFF0F3";
const LIGHT_TEAL = "#E8F9F8";
const LIGHT_YELLOW = "#FFF8EE";

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const [page, setPage] = useState("setup");
  const [level, setLevel] = useState("B1");
  const [recentWords, setRecentWords] = useState([]);
  const [todayWords, setTodayWords] = useState([]);   // learned today
  const [allWords, setAllWords] = useState([]);        // all-time learned
  const [savedWords, setSavedWords] = useState([]);    // { word, ipa, meaning }
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("learn");

  // Load persisted data
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("colloc_settings") || "{}");
      if (s.level) setLevel(s.level);
      if (s.started) setPage("learn");

      const today = todayKey();
      const tw = JSON.parse(localStorage.getItem("colloc_today_" + today) || "[]");
      setTodayWords(tw);

      const aw = JSON.parse(localStorage.getItem("colloc_all") || "[]");
      setAllWords(aw);

      const sw = JSON.parse(localStorage.getItem("colloc_saved") || "[]");
      setSavedWords(sw);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (page === "learn") generateSuggestions();
  }, [page, level]);

  function saveSettings() {
    try { localStorage.setItem("colloc_settings", JSON.stringify({ level, started: true })); } catch (e) {}
    setPage("learn");
    setActiveTab("learn");
  }

  function generateSuggestions() {
    const pool = SAMPLE_COLLOCATIONS[level] || SAMPLE_COLLOCATIONS["B1"];
    setSuggestions([...pool].sort(() => Math.random() - 0.5).slice(0, 6));
    setSelected(null);
    setDetail(null);
    setError("");
  }

  function trackLearned(collocation) {
    const today = todayKey();
    setTodayWords(prev => {
      const updated = prev.includes(collocation) ? prev : [...prev, collocation];
      try { localStorage.setItem("colloc_today_" + today, JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    setAllWords(prev => {
      const updated = prev.includes(collocation) ? prev : [...prev, collocation];
      try { localStorage.setItem("colloc_all", JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  }

  function toggleSave(collocation, detailData) {
    setSavedWords(prev => {
      const exists = prev.find(s => s.word === collocation);
      const updated = exists
        ? prev.filter(s => s.word !== collocation)
        : [...prev, { word: collocation, ipa: detailData?.ipa || "", meaning: detailData?.meaning || "" }];
      try { localStorage.setItem("colloc_saved", JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  }

  function isSaved(collocation) {
    return savedWords.some(s => s.word === collocation);
  }

  async function fetchDetail(collocation) {
    setSelected(collocation);
    setLoading(true);
    setDetail(null);
    setError("");

    const prompt = `You are an English language teacher for Vietnamese learners. For the collocation "${collocation}" (level ${level}), provide:
1. IPA pronunciation (British English)
2. Meaning: explain in VIETNAMESE what this collocation means, simple and clear for a ${level} learner. Include Vietnamese translation.
3. Origin: describe in VIETNAMESE the brief history of how this collocation formed (2-3 sentences).
4. Examples: 5 realistic English sentences as if from news articles, each with a fictional but realistic source citation.

Respond ONLY in this exact JSON format, no extra text, no markdown, no backticks:
{"ipa":"/..../","meaning":"...(Vietnamese)...","origin":"...(Vietnamese)...","examples":[{"sentence":"...","source":"..."},{"sentence":"...","source":"..."},{"sentence":"...","source":"..."},{"sentence":"...","source":"..."},{"sentence":"...","source":"..."}]}`;

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          setError(`Đang thử lại... (${attempt}/${maxRetries})`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
        const res = await fetch("/.netlify/functions/claude", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1000,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const data = await res.json();
        if (data?.error?.type === "overloaded_error") {
          if (attempt === maxRetries) throw new Error("Server đang bận, vui lòng thử lại sau.");
          continue;
        }
        if (data.error) throw new Error(data.error.message);
        let text = data.content?.[0]?.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Định dạng phản hồi không hợp lệ.");
        const parsed = JSON.parse(jsonMatch[0]);
        setError("");
        setDetail(parsed);
        setRecentWords(prev => [collocation, ...prev.filter(w => w !== collocation)].slice(0, 3));
        trackLearned(collocation);
        setLoading(false);
        return;
      } catch (e) {
        if (attempt === maxRetries) { setError(e.message); setLoading(false); return; }
      }
    }
  }

  function speak(text) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "en-GB"; utt.rate = 0.85;
      window.speechSynthesis.speak(utt);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Nunito', 'Segoe UI', sans-serif", color: DARK, maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 84 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pop { 0%{transform:scale(0.96)} 60%{transform:scale(1.02)} 100%{transform:scale(1)} }
        button { font-family: 'Nunito', 'Segoe UI', sans-serif; }
        button:active { opacity: 0.85; }
        select { font-family: 'Nunito', 'Segoe UI', sans-serif; }
      `}</style>

      {/* ══ SETUP PAGE ══ */}
      {page === "setup" && (
        <div>
          <div style={{ background: `linear-gradient(145deg, ${PINK} 0%, #ff9eb5 100%)`, padding: "56px 28px 40px", borderRadius: "0 0 36px 36px", textAlign: "center" }}>
            <div style={{ fontSize: 60, marginBottom: 10 }}>📚</div>
            <h1 style={{ color: WHITE, fontSize: 28, fontWeight: 900, margin: "0 0 8px", letterSpacing: -0.5 }}>CollocLearn</h1>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, margin: 0, fontWeight: 600 }}>Học cụm từ tiếng Anh thông minh 🇬🇧</p>
          </div>
          <div style={{ padding: "28px 20px", display: "grid", gap: 18 }}>
            <div style={{ background: WHITE, borderRadius: 22, padding: "22px 20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
              <p style={{ fontWeight: 800, fontSize: 15, margin: "0 0 16px", color: DARK }}>🎯 Chọn trình độ của bạn</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {LEVELS.map(l => (
                  <button key={l} onClick={() => setLevel(l)} style={{
                    padding: "16px 12px", borderRadius: 18,
                    border: `2.5px solid ${level === l ? PINK : "#EBEBEB"}`,
                    background: level === l ? LIGHT_PINK : "#FAFAFA",
                    cursor: "pointer", transition: "all 0.15s",
                    boxShadow: level === l ? `0 6px 18px ${PINK}30` : "none",
                  }}>
                    <div style={{ fontWeight: 900, fontSize: 22, color: level === l ? PINK : DARK }}>{l}</div>
                    <div style={{ fontSize: 11, color: level === l ? PINK : GRAY, marginTop: 3, fontWeight: 700 }}>{LEVEL_LABELS[l]}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ background: LIGHT_TEAL, borderRadius: 18, padding: "16px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ fontSize: 30, flexShrink: 0, marginTop: 2 }}>✨</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: TEAL, marginBottom: 5 }}>Cách sử dụng</div>
                <div style={{ fontSize: 12.5, color: "#3a9997", lineHeight: 1.65, fontWeight: 600 }}>Chọn một cụm từ → xem phát âm IPA, ý nghĩa tiếng Việt, nguồn gốc và 5 ví dụ từ báo quốc tế. Nhấn 💾 để lưu từ yêu thích.</div>
              </div>
            </div>
            <button onClick={saveSettings} style={{
              padding: "18px", borderRadius: 22, border: "none",
              background: `linear-gradient(135deg, ${PINK}, #ff9eb5)`,
              color: WHITE, fontSize: 16, fontWeight: 900, cursor: "pointer",
              boxShadow: `0 8px 24px ${PINK}50`,
            }}>Bắt đầu học ngay 🚀</button>
          </div>
        </div>
      )}

      {/* ══ LEARN TAB ══ */}
      {page === "learn" && activeTab === "learn" && (
        <div>
          <div style={{ background: `linear-gradient(145deg, ${TEAL} 0%, #5dd6d2 100%)`, padding: "28px 20px 32px", borderRadius: "0 0 32px 32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: recentWords.length > 0 ? 16 : 0 }}>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.72)", fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>ĐANG HỌC</div>
                <div style={{ color: WHITE, fontWeight: 900, fontSize: 21 }}>Cụm từ tiếng Anh</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", padding: "8px 16px", borderRadius: 20 }}>
                <span style={{ color: WHITE, fontWeight: 900, fontSize: 15 }}>{level}</span>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 600, marginLeft: 6 }}>{LEVEL_LABELS[level]}</span>
              </div>
            </div>
            {recentWords.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>VỪA HỌC XONG</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {recentWords.map(w => (
                    <button key={w} onClick={() => fetchDetail(w)} style={{
                      padding: "6px 14px", borderRadius: 20,
                      background: "rgba(255,255,255,0.22)", border: "none",
                      color: WHITE, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}>✓ {w}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: "20px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: DARK }}>Hôm nay học gì? 🌟</div>
              <button onClick={generateSuggestions} style={{
                padding: "7px 16px", borderRadius: 20, border: `2px solid ${PINK}`,
                background: LIGHT_PINK, color: PINK, fontSize: 12, fontWeight: 800, cursor: "pointer",
              }}>🔄 Làm mới</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {suggestions.map((col, i) => (
                <button key={col} onClick={() => fetchDetail(col)} style={{
                  padding: "15px 13px", borderRadius: 18, border: "none", cursor: "pointer",
                  background: selected === col ? PINK : WHITE,
                  color: selected === col ? WHITE : DARK,
                  textAlign: "left", fontFamily: "inherit",
                  boxShadow: selected === col ? `0 6px 20px ${PINK}44` : "0 2px 10px rgba(0,0,0,0.06)",
                  transition: "all 0.18s",
                  animation: `fadeUp 0.35s ease ${i * 0.06}s both`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.35, marginBottom: 8 }}>{col}</div>
                  <div style={{
                    display: "inline-block", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 10,
                    background: selected === col ? "rgba(255,255,255,0.25)" : LIGHT_TEAL,
                    color: selected === col ? WHITE : TEAL,
                  }}>{level}</div>
                </button>
              ))}
            </div>

            {error && (
              <div style={{ padding: "13px 16px", borderRadius: 16, background: "#FFF0F0", border: `2px solid ${PINK}33`, color: "#d94f6a", fontSize: 13, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚠️</span> {error}
              </div>
            )}

            {loading && (
              <div style={{ background: WHITE, borderRadius: 26, padding: "40px 24px", textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.07)", animation: "fadeUp 0.3s ease" }}>
                <div style={{ width: 48, height: 48, border: `3px solid ${TEAL}22`, borderTop: `3px solid ${TEAL}`, borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.85s linear infinite" }} />
                <div style={{ fontWeight: 700, color: GRAY, fontSize: 13, marginBottom: 6 }}>Claude AI đang phân tích...</div>
                <div style={{ fontWeight: 900, color: TEAL, fontSize: 16, fontStyle: "italic" }}>"{selected}"</div>
              </div>
            )}

            {detail && selected && !loading && (
              <div style={{ background: WHITE, borderRadius: 26, overflow: "hidden", boxShadow: "0 6px 28px rgba(0,0,0,0.09)", animation: "pop 0.35s ease" }}>
                {/* Card header */}
                <div style={{ background: `linear-gradient(145deg, ${PINK}, #ff9eb5)`, padding: "22px 20px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: 700, letterSpacing: 1.2, marginBottom: 5 }}>COLLOCATION • {level}</div>
                      <div style={{ color: WHITE, fontWeight: 900, fontSize: 22, marginBottom: 6, lineHeight: 1.2 }}>{selected}</div>
                      <div style={{ background: "rgba(255,255,255,0.2)", display: "inline-block", padding: "4px 12px", borderRadius: 10 }}>
                        <span style={{ color: WHITE, fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{detail.ipa}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                      {/* Save button */}
                      <button onClick={() => toggleSave(selected, detail)} style={{
                        width: 44, height: 44, borderRadius: 22, border: "none",
                        background: isSaved(selected) ? YELLOW : "rgba(255,255,255,0.28)",
                        color: WHITE, fontSize: 20, cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                        transition: "all 0.2s",
                      }} title={isSaved(selected) ? "Bỏ lưu" : "Lưu từ này"}>
                        {isSaved(selected) ? "⭐" : "🤍"}
                      </button>
                      {/* Speak button */}
                      <button onClick={() => speak(selected)} style={{
                        width: 44, height: 44, borderRadius: 22, border: "none",
                        background: "rgba(255,255,255,0.28)", color: WHITE,
                        fontSize: 20, cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                      }}>🔊</button>
                    </div>
                  </div>
                </div>

                <div style={{ padding: "18px 18px 20px", display: "grid", gap: 14 }}>
                  <InfoBlock icon="💡" title="Ý nghĩa" titleColor={PINK} bg={LIGHT_PINK}>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: DARK, fontWeight: 600 }}>{detail.meaning}</p>
                  </InfoBlock>
                  <InfoBlock icon="📜" title="Nguồn gốc" titleColor={TEAL} bg={LIGHT_TEAL}>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: DARK, fontWeight: 600 }}>{detail.origin}</p>
                  </InfoBlock>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                      <span style={{ fontSize: 17 }}>📰</span>
                      <span style={{ fontWeight: 800, fontSize: 13, color: DARK }}>Ví dụ từ Báo chí Quốc tế</span>
                    </div>
                    <div style={{ display: "grid", gap: 9 }}>
                      {detail.examples?.map((ex, i) => (
                        <div key={i} style={{ padding: "12px 14px", borderRadius: 14, background: "#FAFAFA", borderLeft: `3.5px solid ${i % 2 === 0 ? PINK : TEAL}` }}>
                          <p style={{ margin: "0 0 6px", fontSize: 13.5, lineHeight: 1.65, color: DARK, fontWeight: 600 }}>
                            {highlightCollocation(ex.sentence, selected, PINK)}
                          </p>
                          <div style={{ fontSize: 11, color: GRAY, fontWeight: 700 }}>— {ex.source}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!selected && !loading && (
              <div style={{ textAlign: "center", padding: "44px 24px", background: WHITE, borderRadius: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 56, marginBottom: 14 }}>👆</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: DARK, marginBottom: 6 }}>Chọn một cụm từ</div>
                <div style={{ fontSize: 13, color: GRAY, fontWeight: 600 }}>Tap vào bất kỳ card nào để khám phá chi tiết</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ PROFILE TAB ══ */}
      {page === "learn" && activeTab === "profile" && (
        <div>
          {/* Header */}
          <div style={{ background: `linear-gradient(145deg, ${PINK} 0%, #ff9eb5 100%)`, padding: "44px 24px 36px", borderRadius: "0 0 32px 32px", textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: 40, background: "rgba(255,255,255,0.3)", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>🎓</div>
            <div style={{ color: WHITE, fontWeight: 900, fontSize: 22 }}>Cá nhân</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 6, fontWeight: 600 }}>Trình độ: <strong>{level} — {LEVEL_LABELS[level]}</strong></div>
          </div>

          <div style={{ padding: "24px 16px", display: "grid", gap: 16 }}>

            {/* ── Level dropdown ── */}
            <div style={{ background: WHITE, borderRadius: 22, padding: "20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
              <p style={{ fontWeight: 800, fontSize: 14, margin: "0 0 12px", color: DARK }}>🎯 Trình độ</p>
              <div style={{ position: "relative" }}>
                <select
                  value={level}
                  onChange={e => setLevel(e.target.value)}
                  style={{
                    width: "100%", padding: "13px 44px 13px 16px",
                    borderRadius: 14, border: `2px solid ${PINK}55`,
                    background: LIGHT_PINK, color: DARK,
                    fontSize: 15, fontWeight: 800, cursor: "pointer",
                    appearance: "none", WebkitAppearance: "none",
                    outline: "none",
                  }}
                >
                  {LEVELS.map(l => (
                    <option key={l} value={l}>{l} — {LEVEL_LABELS[l]}</option>
                  ))}
                </select>
                <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: PINK, fontSize: 14, fontWeight: 900 }}>▾</div>
              </div>
            </div>

            {/* ── Stats ── */}
            <div style={{ background: WHITE, borderRadius: 22, padding: "20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
              <p style={{ fontWeight: 800, fontSize: 14, margin: "0 0 14px", color: DARK }}>📊 Thống kê học tập</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Today */}
                <div style={{ background: LIGHT_PINK, borderRadius: 16, padding: "16px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: PINK, lineHeight: 1 }}>{todayWords.length}</div>
                  <div style={{ fontSize: 12, color: PINK, fontWeight: 700, marginTop: 6 }}>Đã học hôm nay</div>
                  <div style={{ fontSize: 10, color: "#f0a0b0", marginTop: 3, fontWeight: 600 }}>📅 {todayKey()}</div>
                </div>
                {/* All time */}
                <div style={{ background: LIGHT_TEAL, borderRadius: 16, padding: "16px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: TEAL, lineHeight: 1 }}>{allWords.length}</div>
                  <div style={{ fontSize: 12, color: TEAL, fontWeight: 700, marginTop: 6 }}>Tổng đã học</div>
                  <div style={{ fontSize: 10, color: "#7acfcc", marginTop: 3, fontWeight: 600 }}>🌍 Tất cả thời gian</div>
                </div>
              </div>
            </div>

            {/* ── Saved words ── */}
            <div style={{ background: WHITE, borderRadius: 22, padding: "20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: DARK }}>⭐ Từ đã lưu</p>
                <span style={{
                  background: LIGHT_YELLOW, color: YELLOW, fontSize: 11, fontWeight: 800,
                  padding: "3px 10px", borderRadius: 10,
                }}>{savedWords.length} từ</span>
              </div>

              {savedWords.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: GRAY }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🤍</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Chưa có từ nào được lưu</div>
                  <div style={{ fontSize: 12, marginTop: 4, color: "#b0b0c0" }}>Nhấn 🤍 khi xem chi tiết để lưu từ yêu thích</div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {savedWords.map((s, i) => (
                    <div key={s.word} style={{
                      display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "12px 14px", borderRadius: 14,
                      background: LIGHT_YELLOW,
                      animation: `fadeUp 0.3s ease ${i * 0.05}s both`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: DARK }}>{s.word}</span>
                          <span style={{ fontSize: 11, color: GRAY, fontFamily: "monospace" }}>{s.ipa}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#7a6a50", fontWeight: 600, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {s.meaning}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => fetchDetail(s.word) || setActiveTab("learn")} style={{
                          width: 32, height: 32, borderRadius: 16, border: "none",
                          background: TEAL, color: WHITE, fontSize: 14, cursor: "pointer",
                        }} title="Xem lại">👁</button>
                        <button onClick={() => toggleSave(s.word, null)} style={{
                          width: 32, height: 32, borderRadius: 16, border: "none",
                          background: "#ffddaa", color: WHITE, fontSize: 14, cursor: "pointer",
                        }} title="Bỏ lưu">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => { saveSettings(); setActiveTab("learn"); }} style={{
              padding: "18px", borderRadius: 22, border: "none",
              background: `linear-gradient(135deg, ${TEAL}, #5dd6d2)`,
              color: WHITE, fontSize: 16, fontWeight: 900, cursor: "pointer",
              boxShadow: `0 8px 24px ${TEAL}44`,
            }}>Lưu & Tiếp tục học 🚀</button>
          </div>
        </div>
      )}

      {/* ══ BOTTOM NAV ══ */}
      {page === "learn" && (
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 480, background: WHITE,
          borderTop: "1px solid #F0EDF0",
          display: "flex", justifyContent: "space-around", alignItems: "center",
          padding: "10px 0 16px",
          boxShadow: "0 -6px 24px rgba(0,0,0,0.07)", zIndex: 999,
        }}>
          <BottomTab icon="📚" label="Học" active={activeTab === "learn"} onClick={() => setActiveTab("learn")} />
          <BottomTab icon="👤" label="Cá nhân" active={activeTab === "profile"} onClick={() => setActiveTab("profile")} badge={savedWords.length} />
        </div>
      )}
    </div>
  );
}

function InfoBlock({ icon, title, titleColor, bg, children }) {
  return (
    <div style={{ background: bg, borderRadius: 16, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: 17 }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: 13, color: titleColor }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function BottomTab({ icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{
      border: "none", background: "none", cursor: "pointer",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      padding: "2px 32px", position: "relative",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 22,
        background: active ? PINK : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, transition: "all 0.2s",
        boxShadow: active ? `0 4px 16px ${PINK}50` : "none",
      }}>{icon}</div>
      {badge > 0 && (
        <div style={{
          position: "absolute", top: 0, right: 24,
          width: 18, height: 18, borderRadius: 9,
          background: YELLOW, color: WHITE,
          fontSize: 10, fontWeight: 900,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `2px solid ${WHITE}`,
        }}>{badge}</div>
      )}
      <div style={{ fontSize: 11, fontWeight: 800, color: active ? PINK : "#C5C5D0" }}>{label}</div>
    </button>
  );
}

function highlightCollocation(sentence, collocation, color) {
  try {
    const escaped = collocation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = sentence.split(new RegExp(`(${escaped})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === collocation.toLowerCase()
        ? <strong key={i} style={{ color, fontWeight: 900 }}>{part}</strong>
        : part
    );
  } catch { return sentence; }
}
