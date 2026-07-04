// RAG types — knowledge base on sake used to assist open-answer exam grading.

export type EmbeddingVector = number[];

export interface RagDocument {
  id: string;
  title: string;
  /** Origin (e.g. "manuale-nihonshu", "dropbox:/SSA/kb/koji.pdf"). */
  source: string;
  lang: string;
  text: string;
  metadata?: Record<string, string>;
}

export interface RagChunk {
  id: string;
  docId: string;
  /** Ordinal of this chunk within its document. */
  index: number;
  text: string;
  title: string;
  source: string;
  lang: string;
  metadata?: Record<string, string>;
}

export interface EmbeddedChunk extends RagChunk {
  embedding: EmbeddingVector;
}

export interface RetrievedChunk {
  chunk: RagChunk;
  /** Cosine similarity in [-1, 1]; higher is more relevant. */
  score: number;
}

// ---- Grading ----

export interface OpenAnswerGradingInput {
  /** The exam question text. */
  question: string;
  /** The student's free-text answer. */
  answer: string;
  /** Rubric / topic key from the question (ExamQuestion.aiKey). */
  rubricKey?: string;
  /** Max points the question is worth. */
  maxPoints: number;
  lang?: string;
  /** KB section/chapter to constrain retrieval to (maps to rag_documents.family
   *  today). Omit to retrieve over the whole corpus — behavior unchanged. */
  kbSection?: string;
}

export interface GradeSuggestion {
  /** Suggested score in [0, maxPoints]. Always reviewed by a human. */
  suggestedPoints: number;
  /** Normalised confidence in [0, 1]. */
  confidence: number;
  rationale: string;
  /** Knowledge-base passages the suggestion was grounded in. */
  citations: RetrievedChunk[];
  /** Which grading backend produced this (real model vs. heuristic stub). */
  provider: "model" | "stub";
}
