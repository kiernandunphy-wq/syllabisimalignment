import { useMemo, useState } from "react";
import {
  assignSims,
  buildProgramTermAlignment,
  getAllowedDifficulties,
  getTermRules,
} from "./services/decisionEngine";
import { parseSyllabusWithGemini } from "./services/geminiService";
import type {
  ProgramTerm,
  ProgramTermAlignment,
  SimRecommendationResult,
  UploadedSyllabus,
} from "./types";

type LocalUploadedSyllabus = UploadedSyllabus & {
  file?: File;
};

const programTerms: ProgramTerm[] = ["Term 1", "Term 2", "Term 3", "Term 4", "Term 5"];
const programOverview: Record<
  ProgramTerm,
  {
    phase: string;
    courses: string;
    cognitiveFocus: string[];
    simDifficulty: string;
    bloomLevel: string;
    selectionDifficulty: string;
    recommendedOptions: string;
  }
> = {
  "Term 1": {
    phase: "Foundation",
    courses: "RCP100 / RCP110",
    cognitiveFocus: ["Assessment basics", "Oxygen & meds", "Guided decisions"],
    simDifficulty: "Basic",
    bloomLevel: "Remember -> Apply",
    selectionDifficulty: "Basic",
    recommendedOptions: "Al K. Seltzer, George Jayson, Joe Blow, Flo Mieter, Mr. R.T. Fuller, Oxygen Rounds",
  },
  "Term 2": {
    phase: "Structured Application",
    courses: "RCP120 / RCP130 / RCP140",
    cognitiveFocus: ["Pathophysiology links", "ABG/CXR/ECG intro", "Prioritization begins"],
    simDifficulty: "Basic-Intermediate",
    bloomLevel: "Apply -> Analyze",
    selectionDifficulty: "Basic -> Intermediate",
    recommendedOptions: "Inowana Newby, Will Williams, Hy Ball, Patty Mitrail, intermediate bridge cases",
  },
  "Term 3": {
    phase: "Clinical Application",
    courses: "RCP150",
    cognitiveFocus: ["Mechanical ventilation", "ABG-driven decisions", "Alarm troubleshooting"],
    simDifficulty: "Intermediate",
    bloomLevel: "Analyze",
    selectionDifficulty: "Intermediate",
    recommendedOptions: "Intermediate ventilator and ABG-driven cases, with faculty-approved advanced bridge cases",
  },
  "Term 4": {
    phase: "Integrated Critical Thinking",
    courses: "RCP160 / RCP170",
    cognitiveFocus: ["ICU integration", "Hemodynamics", "Neonatal/Peds adaptation"],
    simDifficulty: "Advanced",
    bloomLevel: "Analyze -> Evaluate",
    selectionDifficulty: "Advanced",
    recommendedOptions: "Baby Adams, Baby Baxter, Baby Collins, Baby Greene, advanced ICU/neonatal/pediatric cases",
  },
  "Term 5": {
    phase: "NBRC-Level Reasoning",
    courses: "RCP180 / RCP190",
    cognitiveFocus: ["Diagnostics mastery", "CPG/TDP application", "Terminate/Modify/Continue decisions"],
    simDifficulty: "NBRC-Level",
    bloomLevel: "Evaluate",
    selectionDifficulty: "NBRC-Level",
    recommendedOptions: "Problem 14-22 advanced set, mixed CSE-style sequencing, end-of-program readiness cases",
  },
};

function App() {
  const [syllabi, setSyllabi] = useState<LocalUploadedSyllabus[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [message, setMessage] = useState("");

  const programMap = useMemo<ProgramTermAlignment[]>(
    () => buildProgramTermAlignment(syllabi),
    [syllabi],
  );
  const isReportReady =
    syllabi.length > 0 &&
    syllabi.every((syllabus) => syllabus.parsingStatus === "parsed" && syllabus.parsedModules.length > 0);

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const newSyllabi: LocalUploadedSyllabus[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      fileName: file.name,
      file,
      assignedProgramTerm: inferProgramTerm(file.name),
      parsedModules: [],
      parsingStatus: "pending",
    }));
    setSyllabi((current) => [...current, ...newSyllabi]);
    setMessage("Files added. Assign each syllabus to a program term, then analyze.");
  }

  function addPastedSyllabus() {
    if (!pastedText.trim()) return;
    setSyllabi((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        fileName: `Pasted syllabus ${current.filter((item) => item.rawText).length + 1}`,
        rawText: pastedText,
        assignedProgramTerm: inferProgramTerm(pastedText),
        parsedModules: [],
        parsingStatus: "pending",
      },
    ]);
    setPastedText("");
    setMessage("Pasted syllabus added. Assign it to a program term, then analyze.");
  }

  function updateTerm(id: string, assignedProgramTerm: ProgramTerm) {
    setSyllabi((current) =>
      current.map((syllabus) =>
        syllabus.id === id ? { ...syllabus, assignedProgramTerm } : syllabus,
      ),
    );
  }

  function removeSyllabus(id: string) {
    setSyllabi((current) => current.filter((syllabus) => syllabus.id !== id));
  }

  async function analyzeSyllabus(target: LocalUploadedSyllabus): Promise<LocalUploadedSyllabus> {
    setSyllabi((current) =>
      current.map((syllabus) =>
        syllabus.id === target.id ? { ...syllabus, parsingStatus: "parsing" } : syllabus,
      ),
    );

    const response = await parseSyllabusWithGemini(target.rawText ?? "", target.file ?? null);
    return {
      ...target,
      detectedCourseCode: response.parsed.courseCode,
      detectedCourseTitle: response.parsed.courseTitle,
      parsedModules: response.parsed.modules,
      rawParsedJson: response.raw,
      parsingStatus: response.usedFallback ? "fallback" : "parsed",
      parseMessage: response.usedFallback
        ? response.error
          ? `Fallback used: ${response.error}`
          : "Fallback used because no Gemini API key is configured."
        : "Parsed by Gemini.",
    };
  }

  async function handleAnalyzeAll() {
    const pendingSyllabi =
      syllabi.length > 0
        ? syllabi
        : pastedText.trim()
          ? [
              {
                id: crypto.randomUUID(),
                fileName: "Pasted syllabus 1",
                rawText: pastedText,
                assignedProgramTerm: "Term 1" as ProgramTerm,
                parsedModules: [],
                parsingStatus: "pending" as const,
              },
            ]
          : [];

    if (!pendingSyllabi.length) {
      setMessage("Add at least one PDF or pasted syllabus before analyzing.");
      return;
    }

    setIsAnalyzing(true);
    setMessage("Analyzing syllabi one at a time...");
    const analyzed: LocalUploadedSyllabus[] = [];
    for (const syllabus of pendingSyllabi) {
      analyzed.push(await analyzeSyllabus(syllabus));
    }
    setSyllabi(analyzed);
    setPastedText("");
    setIsAnalyzing(false);
    setMessage("Program curriculum map updated. Course codes were treated as metadata only.");
  }

  function downloadFiveTermReport() {
    if (!syllabi.length && !pastedText.trim()) {
      setMessage("Add and analyze syllabi before downloading the 5-term report.");
      return;
    }

    if (!isReportReady) {
      setMessage("Analyze all syllabi successfully before downloading the 5-term report.");
      return;
    }

    const reportHtml = buildFiveTermReportHtml(programMap);
    const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `classmatelr-five-term-report-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>ClassmateLR Syllabus-to-Simulation Alignment Prototype</h1>
          <p>Assign each syllabus to a program term. Gemini parses; TypeScript rules assign simulations.</p>
        </div>
      </header>

      <section className="product-disclaimer" aria-label="Product disclaimer">
        <strong>Faculty decision-support only.</strong>
        <span> This tool supports syllabus review and simulation alignment; it is not automatic curriculum approval.</span>
      </section>

      <section className="control-panel" aria-label="Syllabus controls">
        <label className="file-input">
          Upload syllabus files
          <input
            type="file"
            accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/plain,.txt"
            multiple
            onChange={(event) => handleFiles(event.target.files)}
          />
        </label>

        <label className="text-area-label">
          Paste syllabus text
          <textarea
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
            placeholder="Paste a syllabus, course outline, weekly topics, and objectives here..."
          />
        </label>

        <div className="actions">
          <button type="button" className="secondary" onClick={addPastedSyllabus} disabled={!pastedText.trim()}>
            Add Pasted Syllabus
          </button>
          <button type="button" onClick={handleAnalyzeAll} disabled={isAnalyzing}>
            {isAnalyzing ? "Analyzing..." : "Analyze All Syllabi"}
          </button>
          <button type="button" className="secondary" onClick={downloadFiveTermReport}>
            Download 5-Term Report
          </button>
          <button type="button" className="secondary" onClick={() => setDebugOpen((open) => !open)}>
            {debugOpen ? "Hide Debug" : "Show Debug"}
          </button>
        </div>
        {message && <p className="status-message">{message}</p>}
      </section>

      <section className="alignment-map" aria-label="Five-term alignment map">
        {programTerms.map((term) => (
          <div key={term} className="term-card">
            <span>{term}</span>
            <strong>{getTermRules(term).label}</strong>
            <small>{getTermRules(term).assignedTier}</small>
            <small>{syllabi.filter((syllabus) => syllabus.assignedProgramTerm === term).length} syllabus item(s)</small>
          </div>
        ))}
      </section>

      <section className="syllabus-list" aria-label="Uploaded syllabi">
        <h2>Uploaded Syllabi</h2>
        {syllabi.length === 0 ? (
          <p className="empty-state">Upload PDF or Word syllabi, or add pasted syllabus text to begin building the program map.</p>
        ) : (
          syllabi.map((syllabus) => (
            <article key={syllabus.id} className="syllabus-row">
              <div>
                <h3>{syllabus.fileName}</h3>
                <p>
                  {syllabus.detectedCourseTitle || "Course title not parsed yet"}
                  {syllabus.detectedCourseCode ? ` (${syllabus.detectedCourseCode})` : ""}
                </p>
                <small>Parsing status: {syllabus.parsingStatus}</small>
                {syllabus.parseMessage && <small>{syllabus.parseMessage}</small>}
              </div>
              <label>
                Program term
                <select
                  value={syllabus.assignedProgramTerm}
                  onChange={(event) => updateTerm(syllabus.id, event.target.value as ProgramTerm)}
                >
                  {programTerms.map((term) => (
                    <option key={term} value={term}>
                      {term}: {getTermRules(term).label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row-actions">
                <button type="button" className="secondary" onClick={() => removeSyllabus(syllabus.id)}>
                  Remove
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="results-section" aria-label="Program term recommendations">
        <h2>Five-Term Program Curriculum Simulation Alignment Map</h2>
        {programMap.map((termAlignment) => (
          <TermAlignmentSection key={termAlignment.term} termAlignment={termAlignment} />
        ))}
      </section>

      {debugOpen && (
        <section className="debug-panel" aria-label="Debug panel">
          <h2>Debug Panel</h2>
          <div className="debug-grid">
            {syllabi.length === 0 ? (
              <DebugBlock title="No Syllabi" value="Add and analyze at least one syllabus." />
            ) : (
              syllabi.map((syllabus) => {
                const recommendations = assignSims(syllabus.parsedModules, syllabus.assignedProgramTerm);
                return (
                  <DebugBlock
                    key={syllabus.id}
                    title={syllabus.fileName}
                    value={{
                      rawParsedGeminiJson: syllabus.rawParsedJson ?? "No parse yet",
                      parsingStatus: syllabus.parsingStatus,
                      parseMessage: syllabus.parseMessage ?? "No parse message yet",
                      manuallyAssignedTerm: syllabus.assignedProgramTerm,
                      termRuleApplied: getTermRules(syllabus.assignedProgramTerm),
                      allowedDifficulties: getAllowedDifficulties(syllabus.assignedProgramTerm),
                      rejectedSimsAndReasons: recommendations.map((result) => ({
                        module: result.weekOrModule,
                        topic: result.topic,
                        rejectedNearMatches: result.rejectedNearMatches,
                      })),
                      scoredEligibleSims: recommendations.map((result) => ({
                        module: result.weekOrModule,
                        topic: result.topic,
                        candidateScores: result.appropriateSimPool,
                      })),
                    }}
                  />
                );
              })
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function TermAlignmentSection({ termAlignment }: { termAlignment: ProgramTermAlignment }) {
  return (
    <div className="term-results">
      <h3>
        {termAlignment.term}: {termAlignment.termLabel}
      </h3>
      {termAlignment.uploadedSyllabi.length === 0 ? (
        <p className="muted">No syllabi assigned to this term.</p>
      ) : (
        termAlignment.uploadedSyllabi.map((syllabus) => (
          <section key={syllabus.syllabusId} className="syllabus-results">
            <div className="syllabus-results-heading">
              <div>
                <h4>{syllabus.fileName}</h4>
                <p>
                  {syllabus.detectedCourseTitle || "Untitled course"}
                  {syllabus.detectedCourseCode ? ` (${syllabus.detectedCourseCode})` : ""}
                </p>
              </div>
              <small>{syllabus.clinicalFocusSummary.join(", ") || "Clinical focus not parsed yet"}</small>
            </div>
            {syllabus.recommendations.map((result) => (
              <RecommendationCard key={`${syllabus.syllabusId}-${result.weekOrModule}-${result.topic}`} result={result} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function RecommendationCard({ result }: { result: SimRecommendationResult }) {
  return (
    <article className="recommendation-card">
      <div className="card-heading">
        <div>
          <h4>
            {result.weekOrModule}
            {result.courseCode ? ` · ${result.courseCode}` : ""}
          </h4>
          <p>{result.topic}</p>
        </div>
        <span className={`status ${result.alignmentStatus.toLowerCase().replace(/\s+/g, "-")}`}>
          {result.alignmentStatus}
        </span>
      </div>

      <dl className="details-grid">
        <div>
          <dt>Assigned term</dt>
          <dd>{result.term}</dd>
        </div>
        <div>
          <dt>Assigned tier</dt>
          <dd>{result.assignedDifficultyTier}</dd>
        </div>
        <div>
          <dt>Bloom level</dt>
          <dd>{result.detectedBloomLevel}</dd>
        </div>
        <div>
          <dt>Topic exposure</dt>
          <dd>{result.topicExposureStatus}</dd>
        </div>
      </dl>

      <dl className="details-grid one-line">
        <div>
          <dt>Clinical focus</dt>
          <dd>{result.clinicalFocusSummary.join(", ") || "Not detected"}</dd>
        </div>
      </dl>

      <div className="split">
        <section>
          <h5>Objectives</h5>
          <ul>
            {result.learningObjectives.length === 0 ? (
              <li>No objectives parsed.</li>
            ) : (
              result.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)
            )}
          </ul>
        </section>
        <section>
          <h5>Appropriate simulations to pick from</h5>
          <ul>
            {result.appropriateSimPool.length === 0 ? (
              <li>No eligible scored sims.</li>
            ) : (
              result.appropriateSimPool.map((sim) => (
                <li key={sim.id}>
                  <strong>{sim.name}</strong> ({sim.difficulty}, score {sim.score}) - {sim.whyAppropriate}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="best-picks">
        <h5>Best recommended simulation</h5>
        {result.recommendedSims.length === 0 ? (
          <p>{result.alignmentNote}</p>
        ) : (
          result.recommendedSims.map((sim) => (
            <div key={sim.id} className="pick">
              <strong>
                {sim.name} · {sim.difficulty} · score {sim.score}
              </strong>
              <p>{sim.rationale}</p>
              <p>{sim.bloomAlignment}</p>
              <p>{sim.readinessAlignment}</p>
              <p>{sim.instructorUseNote}</p>
              {sim.not100PercentAlignmentNote && <p>{sim.not100PercentAlignmentNote}</p>}
              <DebriefList questions={sim.debriefQuestions} />
            </div>
          ))
        )}
      </section>

      <section>
        <h5>Alignment note</h5>
        <p>{result.alignmentNote}</p>
      </section>

      <section>
        <h5>Rejected near-matches with reasons</h5>
        <ul>
          {result.rejectedNearMatches.map((sim) => (
            <li key={sim.id}>
              <strong>{sim.name}</strong> ({sim.difficulty}) - {sim.reasonRejected}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

function DebriefList({ questions }: { questions: SimRecommendationResult["recommendedSims"][number]["debriefQuestions"] }) {
  return (
    <div className="debrief">
      <h6>Debriefing questions</h6>
      <ul>
        {questions.allans3w.map((question) => (
          <li key={question}>{question}</li>
        ))}
        <li>{questions.therapyIndication}</li>
        <li>{questions.therapyEffectiveness}</li>
        <li>{questions.setupAccuracy}</li>
        <li>{questions.evidenceRequired}</li>
        <li>{questions.stopChangeEscalate}</li>
      </ul>
    </div>
  );
}

function DebugBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="debug-block">
      <h3>{title}</h3>
      <pre>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function inferProgramTerm(value: string): ProgramTerm {
  const match = value.match(/\b(?:RT|RCP)\s*-?\s*(\d{3})(?!\d)/i);
  if (!match) {
    return "Term 1";
  }

  const courseNumber = Number(match[1]);
  if (courseNumber >= 380) return "Term 5";
  if (courseNumber >= 330) return "Term 4";
  if (courseNumber >= 300) return "Term 3";
  if (courseNumber >= 240) return "Term 2";
  return "Term 1";
}

function buildFiveTermReportHtml(programMap: ProgramTermAlignment[]): string {
  const generatedAt = new Date().toLocaleString();
  const progressionRows = programTerms
    .map((term) => {
      const overview = programOverview[term];
      return `
        <tr class="${termClass(term)}">
          <td><strong>${escapeHtml(term)}</strong><br />${escapeHtml(overview.phase)}</td>
          <td>${escapeHtml(overview.courses).replace(/\s\/\s/g, "<br />")}</td>
          <td>${overview.cognitiveFocus.map(escapeHtml).join("<br />")}</td>
          <td>${escapeHtml(overview.simDifficulty)}</td>
          <td>${escapeHtml(overview.bloomLevel)}</td>
        </tr>`;
    })
    .join("");

  const matrixRows = programTerms
    .map((term) => {
      const overview = programOverview[term];
      return `
        <tr>
          <td>${escapeHtml(term)}</td>
          <td>${escapeHtml(overview.courses)}</td>
          <td>${escapeHtml(overview.selectionDifficulty)}</td>
          <td>${escapeHtml(overview.recommendedOptions)}</td>
        </tr>`;
    })
    .join("");

  const detailSections = programMap
    .map((termAlignment) => {
      const syllabi = termAlignment.uploadedSyllabi
        .map(
          (syllabus) => `
            <section class="syllabus">
              <h3>${escapeHtml(syllabus.fileName)}</h3>
              <p class="muted">${escapeHtml(syllabus.detectedCourseTitle || "Untitled course")}${
                syllabus.detectedCourseCode ? ` (${escapeHtml(syllabus.detectedCourseCode)})` : ""
              }</p>
              ${syllabus.recommendations.map(reportRecommendationCard).join("")}
            </section>`,
        )
        .join("");

      return `
        <section class="term-section">
          <h2>${escapeHtml(termAlignment.term)}: ${escapeHtml(termAlignment.termLabel)}</h2>
          ${syllabi || '<p class="muted">No syllabi assigned to this term.</p>'}
        </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ClassmateLR Five-Term SIM Alignment Report</title>
  <style>
    body { color: #172026; font-family: Arial, sans-serif; line-height: 1.35; margin: 32px; }
    h1 { font-size: 30px; margin: 0 0 8px; text-align: center; }
    h2 { border-bottom: 2px solid #0b168a; color: #0b168a; font-size: 20px; margin-top: 28px; padding-bottom: 5px; }
    h3 { margin-bottom: 4px; }
    h4 { margin: 16px 0 6px; }
    table { border-collapse: collapse; margin: 16px 0 24px; width: 100%; }
    th { background: #0b168a; color: white; font-weight: 700; text-align: center; }
    th, td { border: 1px solid #858585; padding: 10px; vertical-align: middle; }
    .term-1 { background: #f7f7f7; }
    .term-2 { background: #d8d8d8; }
    .term-3 { background: #dff0f8; }
    .term-4 { background: #fff0d5; }
    .term-5 { background: #f6ccd3; }
    .lead { font-size: 15px; margin: 0 auto 18px; max-width: 920px; text-align: center; }
    .disclaimer { background: #fff8df; border: 1px solid #e7d38b; margin: 18px 0; padding: 12px; }
    .muted { color: #5d6b72; }
    .recommendation { border: 1px solid #d8e0e5; margin: 12px 0; padding: 12px; }
    .pick { border-left: 4px solid #12636f; margin: 10px 0; padding-left: 10px; }
    .details { display: grid; gap: 8px; grid-template-columns: repeat(4, 1fr); }
    .details div { background: #f6f8f9; padding: 8px; }
    ul { margin-top: 6px; }
    @media print { body { margin: 0.5in; } .term-section { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>Carrington Respiratory Therapy Program</h1>
  <p class="lead">ClassmateLR Five-Term Syllabus-to-Simulation Alignment Report<br />Generated ${escapeHtml(generatedAt)}</p>
  <div class="disclaimer"><strong>Faculty decision-support only.</strong> This report supports syllabus review and simulation alignment; it is not automatic curriculum approval.</div>

  <h2>Term-by-Term Cognitive Progression Model</h2>
  <table>
    <thead>
      <tr><th>Term</th><th>Courses</th><th>Cognitive Focus</th><th>SIM Difficulty</th><th>Bloom Level</th></tr>
    </thead>
    <tbody>${progressionRows}</tbody>
  </table>
  <p><strong>Program Outcome:</strong> Graduates demonstrate progressive cognitive development from foundational recall to NBRC-level evaluative decision-making. Simulation timing is intentionally sequenced to align with cognitive growth and board exam readiness.</p>

  <h2>ClassmateLR SIM Selection Matrix</h2>
  <table>
    <thead>
      <tr><th>Term</th><th>Course</th><th>Difficulty</th><th>Recommended SIM Options</th></tr>
    </thead>
    <tbody>${matrixRows}</tbody>
  </table>

  <h2>Parsed Syllabus Alignment Detail</h2>
  ${detailSections}
</body>
</html>`;
}

function reportRecommendationCard(result: SimRecommendationResult): string {
  const recommended = result.recommendedSims
    .map(
      (sim) => `
        <div class="pick">
          <strong>${escapeHtml(sim.name)} - ${escapeHtml(sim.difficulty)} - score ${sim.score}</strong>
          <p>${escapeHtml(sim.rationale)}</p>
          <p>${escapeHtml(sim.bloomAlignment)}</p>
          <p>${escapeHtml(sim.readinessAlignment)}</p>
          <p>${escapeHtml(sim.instructorUseNote)}</p>
          ${sim.not100PercentAlignmentNote ? `<p>${escapeHtml(sim.not100PercentAlignmentNote)}</p>` : ""}
          <h4>Debriefing Questions</h4>
          <ul>
            ${sim.debriefQuestions.allans3w.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}
            <li>${escapeHtml(sim.debriefQuestions.therapyIndication)}</li>
            <li>${escapeHtml(sim.debriefQuestions.therapyEffectiveness)}</li>
            <li>${escapeHtml(sim.debriefQuestions.setupAccuracy)}</li>
            <li>${escapeHtml(sim.debriefQuestions.evidenceRequired)}</li>
            <li>${escapeHtml(sim.debriefQuestions.stopChangeEscalate)}</li>
          </ul>
        </div>`,
    )
    .join("");

  return `
    <article class="recommendation">
      <h4>${escapeHtml(result.weekOrModule)}: ${escapeHtml(result.topic)}</h4>
      <div class="details">
        <div><strong>Term</strong><br />${escapeHtml(result.term)}</div>
        <div><strong>Assigned tier</strong><br />${escapeHtml(result.assignedDifficultyTier)}</div>
        <div><strong>Bloom level</strong><br />${escapeHtml(result.detectedBloomLevel)}</div>
        <div><strong>Status</strong><br />${escapeHtml(result.alignmentStatus)}</div>
      </div>
      <p><strong>Alignment note:</strong> ${escapeHtml(result.alignmentNote)}</p>
      <p><strong>Objectives:</strong></p>
      <ul>${(result.learningObjectives.length ? result.learningObjectives : ["No objectives parsed."])
        .map((objective) => `<li>${escapeHtml(objective)}</li>`)
        .join("")}</ul>
      <h4>Recommended Simulation and Debrief</h4>
      ${recommended || `<p>${escapeHtml(result.alignmentNote)}</p>`}
    </article>`;
}

function termClass(term: ProgramTerm): string {
  return term.toLowerCase().replace(/\s+/g, "-");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default App;
