import * as diff from 'diff';
import { TextNormalizer } from './text-normalizer.js';
import { NoiseFilter } from './noise-filter.js';

export class DiffEngine {
  /**
   * Deterministically compare two text documents and generate structured differences
   *
   * @param {string} oldRawText
   * @param {string} newRawText
   * @param {Object} [options]
   * @param {Object} [options.noiseOptions]
   * @param {boolean} [options.ignoreWhitespaceOnly=true]
   * @returns {Object} Structured comparison result
   */
  static compare(oldRawText, newRawText, options = {}) {
    const { noiseOptions = {}, ignoreWhitespaceOnly = true } = options;

    // Apply deterministic noise filtering & normalization
    const oldNorm = NoiseFilter.filterText(oldRawText, noiseOptions);
    const newNorm = NoiseFilter.filterText(newRawText, noiseOptions);

    const oldHash = TextNormalizer.hash(oldNorm);
    const newHash = TextNormalizer.hash(newNorm);

    // Fast-path: Identical normalized content hash
    if (oldHash === newHash) {
      return {
        hasChanged: false,
        addedLines: [],
        removedLines: [],
        addedCount: 0,
        removedCount: 0,
        totalDiffLines: 0,
        blocks: [],
        diffBlocks: [],
        summary: 'No textual changes detected',
        textDiffJson: null
      };
    }

    // Check if difference is purely whitespace shifts (when ignoreWhitespaceOnly is true)
    if (ignoreWhitespaceOnly) {
      const oldCompact = oldNorm.replace(/\s+/g, '');
      const newCompact = newNorm.replace(/\s+/g, '');
      if (oldCompact === newCompact && oldCompact.length > 0) {
        return {
          hasChanged: false,
          addedLines: [],
          removedLines: [],
          addedCount: 0,
          removedCount: 0,
          totalDiffLines: 0,
          blocks: [],
          diffBlocks: [],
          summary: 'Whitespace-only alteration ignored',
          textDiffJson: null
        };
      }
    }

    // Generate line-by-line diff
    const lineDiffs = diff.diffLines(oldNorm, newNorm);

    const addedLines = [];
    const removedLines = [];
    const diffBlocks = [];
    let oldLineNum = 1;
    let newLineNum = 1;

    for (const part of lineDiffs) {
      const rawLines = part.value.split('\n');
      // Remove trailing empty element caused by split on trailing newline
      if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
        rawLines.pop();
      }

      if (part.added) {
        addedLines.push(...rawLines);
        diffBlocks.push({
          type: 'added',
          startLine: newLineNum,
          lines: rawLines
        });
        newLineNum += rawLines.length;
      } else if (part.removed) {
        removedLines.push(...rawLines);
        diffBlocks.push({
          type: 'removed',
          startLine: oldLineNum,
          lines: rawLines
        });
        oldLineNum += rawLines.length;
      } else {
        // Unchanged context
        const contextLines = rawLines;
        if (contextLines.length <= 4) {
          diffBlocks.push({
            type: 'unchanged',
            startLine: newLineNum,
            lines: contextLines
          });
        } else {
          diffBlocks.push({
            type: 'unchanged',
            startLine: newLineNum,
            lines: [
              contextLines[0],
              contextLines[1],
              `... (${contextLines.length - 3} unchanged lines) ...`,
              contextLines[contextLines.length - 1]
            ]
          });
        }
        oldLineNum += rawLines.length;
        newLineNum += rawLines.length;
      }
    }

    const addedCount = addedLines.length;
    const removedCount = removedLines.length;
    const hasChanged = addedCount > 0 || removedCount > 0;

    // Build human-readable deterministic change summary
    let summary = 'Text modified';
    if (addedCount > 0 && removedCount === 0) {
      summary = `Added ${addedCount} line${addedCount === 1 ? '' : 's'}`;
    } else if (removedCount > 0 && addedCount === 0) {
      summary = `Removed ${removedCount} line${removedCount === 1 ? '' : 's'}`;
    } else if (addedCount > 0 && removedCount > 0) {
      summary = `Updated content (+${addedCount} / -${removedCount} lines)`;
    }

    return {
      hasChanged,
      addedLines: addedLines.slice(0, 100),
      removedLines: removedLines.slice(0, 100),
      addedCount,
      removedCount,
      totalDiffLines: addedCount + removedCount,
      summary,
      blocks: diffBlocks,
      diffBlocks: diffBlocks,
      textDiffJson: {
        summary,
        addedCount,
        removedCount,
        addedSample: addedLines.slice(0, 10),
        removedSample: removedLines.slice(0, 10),
        diffBlocks: diffBlocks.slice(0, 50)
      }
    };
  }
}
