/**
 * Novlangue Detector — Unit Tests
 *
 * Verifies that the deterministic euphemism scanner correctly identifies
 * novlangue patterns and that clean text passes without false positives.
 */

import { detectNovlangue } from "@/lib/agent/novlangue-detector";

describe("Novlangue Detector", () => {
  it("should detect no novlangue in clean, precise text", () => {
    const cleanHtml = "<p>The government killed civilians during the military operation. The policy caused mass layoffs.</p>";
    const result = detectNovlangue(cleanHtml);
    expect(result.clean).toBe(true);
    expect(result.count).toBe(0);
    expect(result.density).toBe(0);
  });

  it("should detect 'collateral damage' as euphemism for civilian deaths", () => {
    const html = "<p>The strike caused significant collateral damage in the residential area.</p>";
    const result = detectNovlangue(html);
    expect(result.clean).toBe(false);
    expect(result.count).toBe(1);
    expect(result.matches[0].term.toLowerCase()).toBe("collateral damage");
    expect(result.matches[0].trueName).toBe("civilian deaths");
    expect(result.matches[0].category).toBe("euphemism");
  });

  it("should detect 'optimization' as euphemism for layoffs", () => {
    const html = "<p>The company announced an optimization plan affecting 500 workers.</p>";
    const result = detectNovlangue(html);
    expect(result.clean).toBe(false);
    expect(result.count).toBe(1);
    expect(result.matches[0].term.toLowerCase()).toBe("optimization");
  });

  it("should detect 'mistakes were made' as bureaucratic passive obfuscation", () => {
    const html = "<p>Mistakes were made during the implementation phase.</p>";
    const result = detectNovlangue(html);
    expect(result.clean).toBe(false);
    expect(result.count).toBe(1);
    expect(result.matches[0].category).toBe("bureaucratic");
  });

  it("should detect multiple novlangue patterns and compute density", () => {
    const html = `
      <p>The company announced an optimization plan. Mistakes were made during
      the restructuring. The government described the bombing as a precision strike
      that caused collateral damage. Enhanced interrogation techniques were used.</p>
    `;
    const result = detectNovlangue(html);
    expect(result.clean).toBe(false);
    expect(result.count).toBeGreaterThanOrEqual(5);
    expect(result.density).toBeGreaterThan(0);
  });

  it("should strip HTML tags before scanning", () => {
    const html = "<div><span class='nx-eyebrow'>Reform</span><p>The reform was announced.</p></div>";
    const result = detectNovlangue(html);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.matches[0].term.toLowerCase()).toBe("reform");
  });

  it("should be case-insensitive", () => {
    const html = "<p>COLLATERAL DAMAGE was reported. The OPTIMIZATION of staff began.</p>";
    const result = detectNovlangue(html);
    expect(result.count).toBe(2);
  });

  it("should not flag partial word matches", () => {
    const html = "<p>The reformation of the church was a historical event.</p>";
    const result = detectNovlangue(html);
    // "reformation" should NOT match "reform" because we use word boundaries
    expect(result.clean).toBe(true);
  });

  it("should provide context for each match", () => {
    const html = "<p>The military operation resulted in significant collateral damage to infrastructure.</p>";
    const result = detectNovlangue(html);
    expect(result.matches[0].context).toContain("collateral damage");
    expect(result.matches[0].context.length).toBeGreaterThan(20);
  });
});
