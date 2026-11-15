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
  it.each([
    "What experience do you have with code review",
    "What kind of error did the compiler report",
    "Which approach did the team use",
    "Who was the customer for that project",
    "Is your team happy with the design",
    "What about the project deadline",
  ])("recognises a wider range of question openings: %s", (text) =>
    expect(detectQuestion(text)?.automaticEligible).toBe(true),
  );
  it("uses a question mark as evidence for a question phrased as a statement", () => {
    const text = "You would use a dictionary for this";
    expect(detectQuestion(text)).toBeNull();
    expect(detectQuestion(`${text}?`)).toMatchObject({
      text,
      complete: true,
      automaticEligible: true,
    });
    expect(
      detectQuestion("We covered the plan. You would use a list here? Fine."),
    ).toMatchObject({ text: "You would use a list here" });
  });
  it.each([
    "That is the right approach, right?",
    "We will use the list, okay?",
    "The plan?",
    "What a nice design?",
  ])("does not answer agreement checks or fragments: %s", (text) =>
    expect(detectQuestion(text)).toBeNull(),
  );
});
