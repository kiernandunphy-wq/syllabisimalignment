import type {
  BloomLevel,
  ParsedSyllabusModule,
  ParsedSyllabusResponse,
  TopicExposureStatus,
} from "../types";
import { fileToBase64 } from "../utils/text";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const bloomLevels: BloomLevel[] = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];
const exposureStatuses: TopicExposureStatus[] = [
  "first_introduction",
  "review_reinforcement",
  "builds_on_prior_sim",
  "remediation",
  "integration_assessment",
  "end_of_program_mastery",
];
const maxPastedTextChars = 200_000;
const maxFileBytes = 8 * 1024 * 1024;
const acceptedFileTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const acceptedFileExtensions = [".pdf", ".docx", ".txt"];

export const fallbackParsedSyllabus: ParsedSyllabusResponse = {
  courseTitle: "Respiratory Care Therapeutics and Diagnostics",
  courseDescription: "Foundational respiratory therapeutics and diagnostic interpretation.",
  learningObjectives: [
    "Select oxygen and aerosol therapy based on patient findings.",
    "Interpret introductory diagnostic data and patient response.",
  ],
  modules: [
    {
      courseTitle: "Respiratory Care Therapeutics and Diagnostics",
      weekOrModule: "Module 1",
      topic: "Oxygen therapy and pulse oximetry",
      learningObjectives: [
        "Select appropriate oxygen delivery devices.",
        "Interpret pulse oximetry findings in context.",
      ],
      detectedBloomLevel: "Apply",
      clinicalFocus: {
        patientPopulation: ["adult"],
        pathologies: ["hypoxemia", "COPD"],
        therapies: ["oxygen therapy"],
        equipment: ["nasal cannula", "simple mask", "pulse oximeter"],
        assessmentData: ["SpO2", "vital signs", "breath sounds"],
        skills: ["oxygen setup", "patient assessment", "oxygen titration"],
        decisionTypes: ["therapy indication", "therapy effectiveness"],
      },
      topicExposureStatus: "first_introduction",
    },
    {
      courseTitle: "Respiratory Care Therapeutics and Diagnostics",
      weekOrModule: "Module 2",
      topic: "Aerosol therapy for COPD/pneumonia",
      learningObjectives: [
        "Identify indications for aerosolized bronchodilator therapy.",
        "Evaluate patient response to aerosol therapy.",
      ],
      detectedBloomLevel: "Apply",
      clinicalFocus: {
        patientPopulation: ["adult"],
        pathologies: ["COPD", "pneumonia", "bronchospasm"],
        therapies: ["aerosol therapy", "oxygen therapy"],
        equipment: ["small volume nebulizer", "MDI", "pulse oximeter"],
        assessmentData: ["SpO2", "breath sounds", "respiratory rate"],
        skills: ["aerosol delivery", "equipment setup", "assessment"],
        decisionTypes: ["therapy selection", "therapy effectiveness"],
      },
      topicExposureStatus: "first_introduction",
    },
    {
      courseTitle: "Respiratory Care Therapeutics and Diagnostics",
      weekOrModule: "Module 3",
      topic: "Introductory ABG interpretation",
      learningObjectives: [
        "Differentiate oxygenation and ventilation problems using ABG data.",
        "Recommend appropriate next steps based on basic ABG interpretation.",
      ],
      detectedBloomLevel: "Analyze",
      clinicalFocus: {
        patientPopulation: ["adult"],
        pathologies: ["hypoxemia", "hypercapnia"],
        therapies: ["oxygen therapy", "ventilation support"],
        equipment: ["ABG report", "oxygen device"],
        assessmentData: ["PaO2", "PaCO2", "pH", "HCO3"],
        skills: ["ABG interpretation", "data interpretation"],
        decisionTypes: ["diagnostic interpretation", "therapy escalation"],
      },
      topicExposureStatus: "first_introduction",
    },
    {
      courseTitle: "Respiratory Care Therapeutics and Diagnostics",
      weekOrModule: "Module 4",
      topic: "Bronchial hygiene and patient response",
      learningObjectives: [
        "Select bronchial hygiene therapy based on patient findings.",
        "Determine whether airway clearance therapy is effective.",
      ],
      detectedBloomLevel: "Apply",
      clinicalFocus: {
        patientPopulation: ["adult"],
        pathologies: ["pneumonia", "retained secretions", "atelectasis"],
        therapies: ["bronchial hygiene", "airway clearance"],
        equipment: ["PEP device", "suction catheter"],
        assessmentData: ["sputum", "breath sounds", "radiograph", "SpO2"],
        skills: ["bronchial hygiene", "suctioning", "assessment"],
        decisionTypes: ["therapy selection", "therapy effectiveness", "change therapy"],
      },
      topicExposureStatus: "first_introduction",
    },
  ],
};

export async function parseSyllabusWithGemini(
  syllabusText: string,
  syllabusFile?: File | null,
): Promise<{ parsed: ParsedSyllabusResponse; raw: unknown; usedFallback: boolean; error?: string; parseMessage?: string }> {
  const isPdf = isPdfFile(syllabusFile);
  let textForParsing = syllabusText;

  if (isPdf && !textForParsing.trim()) {
    textForParsing = await extractPdfTextLayer(syllabusFile);
  }

  try {
    validateParserInput(textForParsing, syllabusFile);

    const response = await fetch("/api/parse-syllabus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        syllabusText: textForParsing,
        file: syllabusFile
          ? {
              name: syllabusFile.name,
              mimeType: syllabusFile.type || "application/pdf",
              size: syllabusFile.size,
              data: await fileToBase64(syllabusFile),
            }
          : null,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Syllabus parser request failed: ${response.status} ${response.statusText} ${details}`);
    }

    const data = await response.json();
    const parsed = sanitizeParsedResponse(data.parsed);
    return {
      parsed,
      raw: data.raw ?? data.parsed,
      usedFallback: false,
      parseMessage:
        isPdf && textForParsing.trim()
          ? "Parsed from PDF text extraction; faculty review recommended."
          : "Parsed by Gemini.",
    };
  } catch (error) {
    const firstError = error instanceof Error ? error.message : "Unknown Gemini parsing error";

    if (isPdf) {
      const imageFallback = await parseRenderedPdfImages(syllabusFile);
      if (imageFallback) {
        return imageFallback;
      }
    }

    return failedParse(firstError);
  }
}

function validateParserInput(syllabusText: string, syllabusFile?: File | null) {
  if (syllabusText.length > maxPastedTextChars) {
    throw new Error(`Pasted syllabus text is too long. Limit is ${maxPastedTextChars.toLocaleString()} characters.`);
  }

  if (!syllabusFile) {
    return;
  }

  const lowerName = syllabusFile.name.toLowerCase();
  const hasAcceptedExtension = acceptedFileExtensions.some((extension) => lowerName.endsWith(extension));
  const hasAcceptedType = acceptedFileTypes.has(syllabusFile.type);

  if (!hasAcceptedType && !hasAcceptedExtension) {
    throw new Error("Unsupported file type. Upload PDF, DOCX, or TXT files only.");
  }

  if (syllabusFile.size > maxFileBytes) {
    throw new Error(`Uploaded file is too large. Limit is ${Math.floor(maxFileBytes / 1024 / 1024)} MB per file.`);
  }
}

function sanitizeParsedResponse(raw: unknown): ParsedSyllabusResponse {
  const value = raw as Partial<ParsedSyllabusResponse>;
  const modules = Array.isArray(value.modules) ? value.modules.map(sanitizeModule).filter(Boolean) : [];
  if (!modules.length) {
    throw new Error("Parsed data was insufficient: no modules could be extracted.");
  }
  return {
    courseCode: stringOrUndefined(value.courseCode),
    courseTitle: stringOrUndefined(value.courseTitle),
    courseDescription: stringOrUndefined(value.courseDescription),
    learningObjectives: stringArray(value.learningObjectives),
    modules: modules as ParsedSyllabusModule[],
  };
}

function sanitizeModule(raw: unknown): ParsedSyllabusModule {
  const module = raw as Partial<ParsedSyllabusModule>;
  const focus = (module.clinicalFocus ?? {}) as Partial<ParsedSyllabusModule["clinicalFocus"]>;
  return {
    courseCode: stringOrUndefined(module.courseCode),
    courseTitle: stringOrUndefined(module.courseTitle),
    weekOrModule: stringOrUndefined(module.weekOrModule) || "Module",
    topic: stringOrUndefined(module.topic) || "Unspecified topic",
    learningObjectives: stringArray(module.learningObjectives),
    detectedBloomLevel: bloomLevels.includes(module.detectedBloomLevel as BloomLevel)
      ? (module.detectedBloomLevel as BloomLevel)
      : "Understand",
    clinicalFocus: {
      patientPopulation: stringArray(focus.patientPopulation),
      pathologies: stringArray(focus.pathologies),
      therapies: stringArray(focus.therapies),
      equipment: stringArray(focus.equipment),
      assessmentData: stringArray(focus.assessmentData),
      skills: stringArray(focus.skills),
      decisionTypes: stringArray(focus.decisionTypes),
    },
    topicExposureStatus: exposureStatuses.includes(module.topicExposureStatus as TopicExposureStatus)
      ? (module.topicExposureStatus as TopicExposureStatus)
      : "first_introduction",
  };
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function isPdfFile(file?: File | null): file is File {
  return Boolean(file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")));
}

async function extractPdfTextLayer(file: File): Promise<string> {
  try {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      pages.push(text);
    }
    const extractedText = pages.join("\n").trim();
    return isMeaningfulSyllabusText(extractedText) ? extractedText : "";
  } catch (error) {
    console.warn("PDF text-layer extraction failed:", error);
    return "";
  }
}

async function parseRenderedPdfImages(
  file: File,
): Promise<{ parsed: ParsedSyllabusResponse; raw: unknown; usedFallback: boolean; error?: string; parseMessage?: string } | null> {
  try {
    const images = await renderPdfPages(file);
    if (!images.length) {
      return null;
    }

    const extractionResponse = await fetch("/api/extract-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
    });

    if (!extractionResponse.ok) {
      console.warn("PDF image extraction failed:", await extractionResponse.text());
      return null;
    }

    const extractionData = await extractionResponse.json();
    const extractedText = typeof extractionData.text === "string" ? extractionData.text : "";
    if (!isMeaningfulSyllabusText(extractedText)) {
      return null;
    }

    const parseResponse = await fetch("/api/parse-syllabus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        syllabusText: extractedText,
        file: null,
      }),
    });

    if (!parseResponse.ok) {
      console.warn("Parsing extracted PDF image text failed:", await parseResponse.text());
      return null;
    }

    const parseData = await parseResponse.json();
    return {
      parsed: sanitizeParsedResponse(parseData.parsed),
      raw: parseData.raw ?? parseData.parsed,
      usedFallback: false,
      parseMessage: "Parsed from rendered PDF page images using Gemini vision; faculty review recommended.",
    };
  } catch (error) {
    console.warn("Rendered PDF image fallback failed:", error);
    return null;
  }
}

async function renderPdfPages(file: File): Promise<string[]> {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const images: string[] = [];
  const maxPages = Math.min(12, pdf.numPages);

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    if (looksLikePolicyOnlyPage(pageText)) {
      continue;
    }

    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      continue;
    }
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.76));
  }

  return images;
}

function isMeaningfulSyllabusText(value: string): boolean {
  const normalized = value.toLowerCase();
  const curriculumMarkers = [
    "course",
    "objective",
    "outcome",
    "schedule",
    "week",
    "module",
    "topic",
    "respiratory",
    "ventilation",
    "oxygen",
    "airway",
  ];
  const markerCount = curriculumMarkers.filter((marker) => normalized.includes(marker)).length;
  return value.trim().length >= 750 || markerCount >= 4;
}

function looksLikePolicyOnlyPage(value: string): boolean {
  const normalized = value.toLowerCase();
  const hasPolicyMarker = /title ix|academic integrity|student code|disability|accommodation|attendance policy/.test(
    normalized,
  );
  const hasCurriculumMarker = /objective|outcome|schedule|week|module|topic|course outline|respiratory|ventilation/.test(
    normalized,
  );
  return hasPolicyMarker && !hasCurriculumMarker;
}

function failedParse(message: string) {
  return {
    parsed: {
      courseTitle: undefined,
      courseCode: undefined,
      courseDescription: undefined,
      learningObjectives: [],
      modules: [],
    },
    raw: { error: message },
    usedFallback: true,
    error: message,
  };
}
