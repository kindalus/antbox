import { Feature } from "./feature.ts";
import { RunContext } from "./feature_run_context.ts";
import { AIToolMetadata, featureToAITool, AIToolRegistry } from "./ai_tool.ts";

/**
 * Example AI Tool Feature: Text Analyzer
 *
 * This demonstrates how to create a feature specifically designed for AI integration.
 * It analyzes text and provides structured output that AI models can easily consume.
 */
const textAnalyzerAITool: Feature = {
  uuid: "ai-text-analyzer-001",
  name: "Text Analyzer",
  description: "Analyzes text content for sentiment, readability, keywords, and structure. Provides comprehensive metrics suitable for AI model consumption.",

  // Exposure settings - this is specifically an AI tool
  exposeAction: false,
  exposeExtension: false,
  exposeAITool: true, // This makes it available to AI systems

  // Execution settings
  runOnCreates: false,
  runOnUpdates: false,
  runManually: true,

  // Security and permissions
  runAs: undefined,
  groupsAllowed: [],

  // No filters - can run on any context
  filters: [],

  // Parameters with detailed descriptions for AI understanding
  parameters: [
    {
      name: "text",
      type: "string",
      required: true,
      description: "The text content to analyze. Can be any length from a sentence to multiple paragraphs."
    },
    {
      name: "analysisDepth",
      type: "string",
      required: false,
      description: "Level of analysis: 'basic' for quick metrics, 'detailed' for comprehensive analysis, 'full' for all available metrics",
      defaultValue: "detailed"
    },
    {
      name: "includeKeywords",
      type: "boolean",
      required: false,
      description: "Whether to extract and rank keywords from the text",
      defaultValue: true
    },
    {
      name: "language",
      type: "string",
      required: false,
      description: "Expected language of the text (auto-detect if not specified). Supports: 'en', 'es', 'pt', 'fr'",
      defaultValue: "auto"
    }
  ],

  // Return type optimized for AI consumption
  returnType: "object",
  returnDescription: "Structured analysis results including sentiment scores, readability metrics, keywords, and text statistics",
  returnContentType: "application/json",

  // AI Tool implementation
  async run(ctx: RunContext, args: Record<string, unknown>): Promise<unknown> {
    const text = args.text as string;
    const analysisDepth = (args.analysisDepth as string) || "detailed";
    const includeKeywords = (args.includeKeywords as boolean) ?? true;
    const language = (args.language as string) || "auto";

    if (!text) {
      throw new Error("Text parameter is required for analysis");
    }

    // Basic text metrics
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const characterCount = text.length;
    const characterCountNoSpaces = text.replace(/\s/g, '').length;
    const paragraphCount = text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;

    // Sentiment analysis (simplified)
    const sentiment = analyzeSentiment(text);

    // Readability metrics
    const readability = calculateReadabilityMetrics(text, wordCount, sentenceCount);

    // Base result structure
    const result: any = {
      metadata: {
        timestamp: new Date().toISOString(),
        analysisDepth,
        language: detectLanguage(text, language),
        processingTime: 0 // Will be set at the end
      },
      textMetrics: {
        characterCount,
        characterCountNoSpaces,
        wordCount,
        sentenceCount,
        paragraphCount,
        averageWordsPerSentence: Math.round((wordCount / sentenceCount) * 100) / 100,
        averageCharactersPerWord: Math.round((characterCountNoSpaces / wordCount) * 100) / 100
      },
      sentiment: {
        overall: sentiment.overall,
        score: sentiment.score,
        confidence: sentiment.confidence,
        dominant_emotions: sentiment.emotions
      },
      readability: {
        fleschReadingEase: readability.fleschReadingEase,
        readingLevel: readability.readingLevel,
        complexity: readability.complexity
      }
    };

    // Add keywords if requested
    if (includeKeywords) {
      result.keywords = extractKeywords(text);
    }

    // Add detailed analysis if requested
    if (analysisDepth === "detailed" || analysisDepth === "full") {
      result.structure = analyzeTextStructure(text);
      result.vocabulary = {
        uniqueWords: new Set(text.toLowerCase().match(/\b\w+\b/g) || []).size,
        lexicalDiversity: calculateLexicalDiversity(text),
        averageWordLength: calculateAverageWordLength(text)
      };
    }

    // Add full analysis if requested
    if (analysisDepth === "full") {
      result.advanced = {
        topicModeling: extractTopics(text),
        namedEntities: extractNamedEntities(text),
        linguisticFeatures: analyzeLinguisticFeatures(text)
      };
    }

    // Set processing time
    result.metadata.processingTime = Date.now() - (ctx as any).startTime || 0;

    return result;
  }
};

// Helper functions for text analysis
function analyzeSentiment(text: string): {
  overall: "positive" | "negative" | "neutral";
  score: number;
  confidence: number;
  emotions: string[];
} {
  // Simplified sentiment analysis using keyword matching
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'love', 'like', 'happy', 'joy'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'sad', 'angry', 'disappointed'];

  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const positiveCount = words.filter(word => positiveWords.includes(word)).length;
  const negativeCount = words.filter(word => negativeWords.includes(word)).length;

  const score = (positiveCount - negativeCount) / words.length;
  const overall = score > 0.1 ? "positive" : score < -0.1 ? "negative" : "neutral";

  return {
    overall,
    score: Math.max(-1, Math.min(1, score * 10)),
    confidence: Math.min(1, Math.abs(score) * 5),
    emotions: score > 0 ? ["positive"] : score < 0 ? ["negative"] : ["neutral"]
  };
}

function calculateReadabilityMetrics(text: string, wordCount: number, sentenceCount: number): {
  fleschReadingEase: number;
  readingLevel: string;
  complexity: "very_easy" | "easy" | "moderate" | "difficult" | "very_difficult";
} {
  // Simplified Flesch Reading Ease calculation
  const syllableCount = estimateSyllables(text);
  const avgSentenceLength = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / wordCount;

  const fleschScore = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);

  let readingLevel: string;
  let complexity: "very_easy" | "easy" | "moderate" | "difficult" | "very_difficult";

  if (fleschScore >= 90) {
    readingLevel = "5th grade";
    complexity = "very_easy";
  } else if (fleschScore >= 80) {
    readingLevel = "6th grade";
    complexity = "easy";
  } else if (fleschScore >= 70) {
    readingLevel = "7th grade";
    complexity = "easy";
  } else if (fleschScore >= 60) {
    readingLevel = "8th-9th grade";
    complexity = "moderate";
  } else if (fleschScore >= 50) {
    readingLevel = "10th-12th grade";
    complexity = "moderate";
  } else if (fleschScore >= 30) {
    readingLevel = "College level";
    complexity = "difficult";
  } else {
    readingLevel = "Graduate level";
    complexity = "very_difficult";
  }

  return {
    fleschReadingEase: Math.round(fleschScore * 100) / 100,
    readingLevel,
    complexity
  };
}

function estimateSyllables(text: string): number {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  return words.reduce((count, word) => {
    // Simple syllable estimation
    const vowels = word.match(/[aeiouy]+/g) || [];
    let syllables = vowels.length;
    if (word.endsWith('e')) syllables--;
    return count + Math.max(1, syllables);
  }, 0);
}

function extractKeywords(text: string): Array<{ word: string; frequency: number; relevance: number }> {
  const words = text.toLowerCase().match(/\b\w{3,}\b/g) || [];
  const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'that', 'which', 'who', 'when', 'where', 'why', 'how']);

  const frequency = new Map<string, number>();
  words.filter(word => !stopWords.has(word)).forEach(word => {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  });

  return Array.from(frequency.entries())
    .map(([word, freq]) => ({
      word,
      frequency: freq,
      relevance: freq / words.length
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);
}

function detectLanguage(text: string, requested: string): string {
  if (requested !== "auto") return requested;

  // Simple language detection based on common words
  const englishIndicators = ['the', 'and', 'to', 'of', 'a', 'in', 'is', 'it', 'you', 'that'];
  const spanishIndicators = ['el', 'la', 'de', 'que', 'y', 'en', 'un', 'es', 'se', 'no'];
  const portugueseIndicators = ['o', 'a', 'de', 'que', 'e', 'em', 'um', 'é', 'se', 'não'];

  const words = text.toLowerCase().match(/\b\w+\b/g) || [];

  const englishScore = words.filter(word => englishIndicators.includes(word)).length;
  const spanishScore = words.filter(word => spanishIndicators.includes(word)).length;
  const portugueseScore = words.filter(word => portugueseIndicators.includes(word)).length;

  const maxScore = Math.max(englishScore, spanishScore, portugueseScore);

  if (maxScore === englishScore) return "en";
  if (maxScore === spanishScore) return "es";
  if (maxScore === portugueseScore) return "pt";

  return "unknown";
}

function analyzeTextStructure(text: string): {
  hasIntroduction: boolean;
  hasConclusion: boolean;
  listCount: number;
  questionCount: number;
  exclamationCount: number;
} {
  return {
    hasIntroduction: /^(introduction|intro|first|initially|to begin)/i.test(text),
    hasConclusion: /(conclusion|summary|in conclusion|finally|to conclude|in summary)/i.test(text),
    listCount: (text.match(/^\s*[-*•]\s/gm) || []).length,
    questionCount: (text.match(/\?/g) || []).length,
    exclamationCount: (text.match(/!/g) || []).length
  };
}

function calculateLexicalDiversity(text: string): number {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const uniqueWords = new Set(words);
  return words.length > 0 ? uniqueWords.size / words.length : 0;
}

function calculateAverageWordLength(text: string): number {
  const words = text.match(/\b\w+\b/g) || [];
  if (words.length === 0) return 0;
  return words.reduce((sum, word) => sum + word.length, 0) / words.length;
}

function extractTopics(text: string): string[] {
  // Simplified topic extraction based on keyword clustering
  const keywords = extractKeywords(text);
  return keywords.slice(0, 3).map(k => k.word);
}

function extractNamedEntities(text: string): Array<{ entity: string; type: string; confidence: number }> {
  // Simplified named entity recognition
  const entities: Array<{ entity: string; type: string; confidence: number }> = [];

  // Look for capitalized words (potential proper nouns)
  const properNouns = text.match(/\b[A-Z][a-z]+\b/g) || [];
  properNouns.forEach(noun => {
    if (noun.length > 2) {
      entities.push({
        entity: noun,
        type: "PERSON_OR_PLACE",
        confidence: 0.6
      });
    }
  });

  return entities.slice(0, 5); // Return top 5
}

function analyzeLinguisticFeatures(text: string): {
  passiveVoicePercentage: number;
  modalVerbCount: number;
  complexSentencePercentage: number;
} {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // Simple passive voice detection
  const passiveIndicators = /\b(is|are|was|were|been|being)\s+\w+ed\b/gi;
  const passiveCount = (text.match(passiveIndicators) || []).length;

  // Modal verbs
  const modalVerbs = /\b(can|could|may|might|must|shall|should|will|would)\b/gi;
  const modalCount = (text.match(modalVerbs) || []).length;

  // Complex sentences (containing subordinating conjunctions)
  const complexIndicators = /\b(because|although|since|while|when|if|unless|whereas|though)\b/gi;
  const complexCount = sentences.filter(s => complexIndicators.test(s)).length;

  return {
    passiveVoicePercentage: sentences.length > 0 ? (passiveCount / sentences.length) * 100 : 0,
    modalVerbCount: modalCount,
    complexSentencePercentage: sentences.length > 0 ? (complexCount / sentences.length) * 100 : 0
  };
}

// Register the AI tool on module load
try {
  AIToolRegistry.register(textAnalyzerAITool);
} catch (error) {
  console.warn("Failed to register Text Analyzer AI Tool:", error);
}

export default textAnalyzerAITool;
