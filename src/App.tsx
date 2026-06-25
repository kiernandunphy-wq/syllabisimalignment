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

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const newSyllabi: LocalUploadedSyllabus[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      fileName: file.name,
      file,
      assignedProgramTerm: "Term 1",
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
        assignedProgramTerm: "Term 1",
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
            accept="application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
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

export default App;
