/**
 * FS-RESEARCHER: File-System-Based Dual Agent for Long-Context Research
 *
 * Based on: arXiv 2026 "FS-Researcher: A File-System-Based Dual Agent Framework
 * for Automating Academic Research"
 *
 * Two agents:
 * - **Context Builder (Librarian)**: browses sources, archives them in a
 *   hierarchical file-system-based knowledge base (KB) that persists beyond
 *   the LLM's context window. Can collect 100+ sources without running out
 *   of context.
 * - **Report Writer**: composes the report section by section, reading from
 *   the KB files rather than keeping everything in context.
 *
 * This scales test-time compute beyond the context window limit.
 *
 * In NomosX, this enables:
 * 1. Collecting 100+ sources for strategic/dossier briefs
 * 2. Writing section-by-section without loading all sources at once
 * 3. Persistent KB that survives across pipeline phases
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { callLLM, type LLMTask } from '../llm/unified-llm';

export interface KBEntry {
  id: string;
  /** File path in the KB */
  filePath: string;
  /** Source title */
  title: string;
  /** Source provider */
  provider: string;
  /** Source URL/DOI */
  url?: string;
  doi?: string;
  /** When this was added to the KB */
  addedAt: number;
  /** Tags for categorization */
  tags: string[];
  /** Quality score (0-100) */
  qualityScore?: number;
}

export interface KBSection {
  /** Section name (e.g., "executive_summary", "analysis", "recommendations") */
  name: string;
  /** File path for this section's draft */
  filePath: string;
  /** Sources used in this section */
  sourceIds: string[];
  /** Whether this section is complete */
  complete: boolean;
}

export interface FSResearcherState {
  /** Root directory of the KB */
  kbRoot: string;
  /** Index of all sources in the KB */
  index: KBEntry[];
  /** Sections being written */
  sections: KBSection[];
  /** Query being researched */
  query: string;
}

/**
 * Initialize a file-system knowledge base for a research query.
 *
 * Creates a directory structure:
 *   kb_root/
 *     sources/       — individual source files
 *     sections/      — section drafts
 *     index.json     — KB index
 *     query.txt      — the research query
 */
export async function initKnowledgeBase(
  kbRoot: string,
  query: string,
): Promise<FSResearcherState> {
  // Create directory structure
  await fs.mkdir(path.join(kbRoot, 'sources'), { recursive: true });
  await fs.mkdir(path.join(kbRoot, 'sections'), { recursive: true });

  // Write query file
  await fs.writeFile(path.join(kbRoot, 'query.txt'), query);

  const state: FSResearcherState = {
    kbRoot,
    index: [],
    sections: [],
    query,
  };

  await saveIndex(state);
  console.log(`[FS-Researcher] KB initialized at ${kbRoot} for query: ${query.slice(0, 80)}...`);

  return state;
}

/**
 * Context Builder: archive a source in the KB.
 *
 * Writes the source content to a file and updates the index.
 */
export async function archiveSource(
  state: FSResearcherState,
  source: {
    title: string;
    abstract?: string;
    fullText?: string;
    provider: string;
    url?: string;
    doi?: string;
  },
  tags: string[] = [],
): Promise<string> {
  const id = `src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const fileName = `${id}.txt`;
  const filePath = path.join(state.kbRoot, 'sources', fileName);

  // Write source content to file
  const content = `TITLE: ${source.title}
PROVIDER: ${source.provider}
${source.url ? `URL: ${source.url}` : ''}
${source.doi ? `DOI: ${source.doi}` : ''}
TAGS: ${tags.join(', ')}

ABSTRACT:
${source.abstract || 'N/A'}

FULL TEXT:
${source.fullText || 'N/A'}
`;

  await fs.writeFile(filePath, content);

  // Update index
  const entry: KBEntry = {
    id,
    filePath,
    title: source.title,
    provider: source.provider,
    url: source.url,
    doi: source.doi,
    addedAt: Date.now(),
    tags,
  };
  state.index.push(entry);
  await saveIndex(state);

  return id;
}

/**
 * Context Builder: retrieve sources from the KB by tags or text search.
 *
 * Instead of loading all sources into context, this returns only the
 * relevant ones based on the section's needs.
 */
export async function retrieveFromKB(
  state: FSResearcherState,
  options: {
    tags?: string[];
    textSearch?: string;
    maxResults?: number;
  } = {}
): Promise<Array<{ entry: KBEntry; content: string }>> {
  const { tags, textSearch, maxResults = 20 } = options;

  let candidates = state.index;

  // Filter by tags
  if (tags && tags.length > 0) {
    candidates = candidates.filter(e =>
      e.tags.some(t => tags.includes(t))
    );
  }

  // Filter by text search
  if (textSearch) {
    const searchLower = textSearch.toLowerCase();
    candidates = candidates.filter(e =>
      e.title.toLowerCase().includes(searchLower) ||
      e.tags.some(t => t.toLowerCase().includes(searchLower))
    );
  }

  // Read content for top candidates
  const results: Array<{ entry: KBEntry; content: string }> = [];
  for (const entry of candidates.slice(0, maxResults)) {
    try {
      const content = await fs.readFile(entry.filePath, 'utf-8');
      results.push({ entry, content });
    } catch {
      // Non-blocking — skip files that can't be read
    }
  }

  return results;
}

/**
 * Report Writer: write a section of the report.
 *
 * Reads only the relevant sources from the KB (not all of them),
 * writes the section draft to a file.
 */
export async function writeSection(
  state: FSResearcherState,
  sectionName: string,
  sectionPrompt: string,
  sourceTags: string[] = [],
): Promise<string> {
  const sectionFile = path.join(state.kbRoot, 'sections', `${sectionName}.md`);

  // Retrieve relevant sources from KB
  const sources = await retrieveFromKB(state, { tags: sourceTags, maxResults: 15 });
  const sourceContext = sources.map(s =>
    `[${s.entry.id}] ${s.entry.title}\n${s.content.slice(0, 2000)}`
  ).join('\n\n---\n\n');

  // Generate section using LLM
  const prompt = `You are writing a section of a research report.

RESEARCH QUERY: ${state.query}

SECTION: ${sectionName}

INSTRUCTIONS: ${sectionPrompt}

RELEVANT SOURCES FROM KB:
${sourceContext}

Write the section. Use [src_id] citations to reference sources.`;

  try {
    const response = await callLLM({
      messages: [
        { role: 'system', content: 'You are a research report writer. Write clear, well-cited sections.' },
        { role: 'user', content: prompt },
      ],
      task: 'analyst_brief',
      temperature: 0.3,
      maxTokens: 2000,
    });

    const sectionContent = response.content || '';

    // Write section to file
    await fs.writeFile(sectionFile, sectionContent);

    // Update sections index
    state.sections.push({
      name: sectionName,
      filePath: sectionFile,
      sourceIds: sources.map(s => s.entry.id),
      complete: true,
    });

    console.log(`[FS-Researcher] Section "${sectionName}" written (${sectionContent.length} chars, ${sources.length} sources)`);

    return sectionContent;
  } catch (error: any) {
    console.error(`[FS-Researcher] Failed to write section ${sectionName}: ${error.message}`);
    return '';
  }
}

/**
 * Assemble the final report from all sections.
 */
export async function assembleReport(state: FSResearcherState): Promise<string> {
  const sections: string[] = [];

  for (const section of state.sections) {
    if (!section.complete) continue;
    try {
      const content = await fs.readFile(section.filePath, 'utf-8');
      sections.push(`## ${section.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n\n${content}`);
    } catch {
      // Non-blocking
    }
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Save the KB index to disk.
 */
async function saveIndex(state: FSResearcherState): Promise<void> {
  const indexPath = path.join(state.kbRoot, 'index.json');
  const data = {
    query: state.query,
    index: state.index,
    sections: state.sections,
  };
  await fs.writeFile(indexPath, JSON.stringify(data, null, 2));
}

/**
 * Load a KB from disk.
 */
export async function loadKnowledgeBase(kbRoot: string): Promise<FSResearcherState> {
  const indexPath = path.join(kbRoot, 'index.json');
  const data = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
  return {
    kbRoot,
    index: data.index || [],
    sections: data.sections || [],
    query: data.query || '',
  };
}
