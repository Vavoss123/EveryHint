import { describe, expect, it } from "vitest";
import { detectQuestion } from "../src/main/intelligence/question";

const examples = [
  "Why would you use a dictionary instead of a list?",
  "Can you explain what that function does?",
  "What happens if this variable is empty?",
  "How would you improve this solution?",
  "What's the difference between those two approaches?",
];
describe("local punctuation-independent question detection", () => {
  it.each(examples)(
    "scores a relevant question with and without punctuation: %s",
    (text) => {
      for (const value of [text, text.replace(/\?/g, "")]) {
        expect(detectQuestion(value)?.automaticEligible).toBe(true);
        expect(detectQuestion(value)!.confidence).toBeGreaterThanOrEqual(0.85);
      }
    },
  );
  it.each([
    "This function uses a dictionary.",
    "We discussed how to improve the solution.",
    "What a lovely day",
    "Can you hear me?",
    "Are you there?",
    "Why bother?",
    "Who cares about the code?",
    "What could possibly go wrong?",
    "He asked why would you use a dictionary",
    "This is rhetorical: why use a dictionary?",
    "I wonder whether the function is correct",
    "Do you want coffee?",
    "",
    "What time is it?",
  ])("suppresses statements/rhetorical/unrelated speech: %s", (text) =>
    expect(detectQuestion(text)).toBeNull(),
  );
  it.each([
    "Why would you use the",
    "How would you improve a",
    "Can you explain the",
  ])("keeps incomplete questions below the automatic threshold: %s", (text) => {
    expect(detectQuestion(text)?.automaticEligible).toBe(false);
    expect(detectQuestion(text)!.confidence).toBeLessThan(0.85);
  });
  it("uses recent context conservatively and scores help cues as review-only", () => {
    expect(
      detectQuestion(
        "Could you consider another colour",
        "The red colour differs from blue",
      )?.automaticEligible,
    ).toBe(false);
    expect(
      detectQuestion("Help me explain this function")?.automaticEligible,
    ).toBe(false);
  });
});
